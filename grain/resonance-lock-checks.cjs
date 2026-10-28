/* Physical-Q overrides and the actual short-envelope cleanup endpoint.
 * Serves maintained sources without rebuilding the standalone deliverable. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const scripts = ['grain/synth-params.js', 'grain/presets.js', 'grain/audio-engine.js', 'grain/voice-lab.js', 'grain/app.js', 'shared/pattern-schema.js', 'shared/pattern-drums.js'];
const baselinePath = process.env.SIZZLE_BASELINE_ENGINE;
const oldEngine = baselinePath ? fs.readFileSync(path.resolve(baselinePath), 'utf8') : null;
function source(legacy) {
  return read('grain/app.html').replace('<!-- STYLES -->', '<style>' + read('grain/styles.css') + '</style>')
    .replace('<!-- SCRIPTS -->', '<script>' + scripts.map(name => legacy && name === 'grain/audio-engine.js' ? oldEngine : read(name)).join('\n').replace(/<\/script/g, '<\\/script') + '</script>');
}
(async () => {
  const pages = { '/': source(false), ...(oldEngine ? { '/old': source(true) } : {}) };
  const server = http.createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(pages[request.url] || pages['/']); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = 'http://127.0.0.1:' + server.address().port;
    await page.goto(url); await page.waitForFunction(() => window.GrainApp);
    let defaultDifference = null;
    if (oldEngine) {
      const old = await browser.newPage(); await old.goto(url + '/old'); await old.waitForFunction(() => window.GrainApp);
      const render = () => GrainApp.exportAudio({ scope: 'pattern', bars: 1, tailSeconds: .1 }).then(async result => Array.from(new Uint8Array(await result.blob.arrayBuffer())));
      const current = Buffer.from(await page.evaluate(render)), previous = Buffer.from(await old.evaluate(render));
      assert.equal(current.length, previous.length); defaultDifference = 0;
      for (let at = 44; at < current.length; at += 2) defaultDifference = Math.max(defaultDifference, Math.abs(current.readInt16LE(at) - previous.readInt16LE(at)));
      assert(defaultDifference <= 1, 'Unlocked baseline engine audio is preserved'); await old.close();
    }

    const inherited = await page.evaluate(() => 10 ** (GrainApp.getState().tracks[0].synth.noise.resonance / 20));
    await page.locator('#step-edit-button').click(); await page.locator('[data-track="0"][data-step="0"]').click();
    assert(Math.abs(Number(await page.locator('#step-lock-resonance').inputValue()) - inherited) < .0001, 'Inherited LP/HP resonance displays physical Q');
    assert.equal(await page.locator('#step-lock-resonance').getAttribute('max'), '20');
    assert.equal(await page.locator('#step-inherit-resonance').evaluate(input => input.parentElement.textContent), 'Inherit');
    await page.locator('#step-inherit-resonance').uncheck(); await page.locator('#step-lock-resonance').fill('20'); await page.locator('#step-lock-resonance').press('Tab');
    assert.equal(await page.evaluate(() => GrainApp.getProject().bankLocks[0][0][0].resonance), 20);
    await page.locator('#step-close').click();
    const previewQ = await page.evaluate(async () => {
      await GrainApp.engine.preview(GrainApp.getState().tracks[0], 120, { resonance: 20 });
      const voice = [...GrainApp.engine.environment.voices].at(-1);
      return voice.nodes.filter(node => node instanceof BiquadFilterNode).at(-1).Q.value;
    });
    assert(Math.abs(previewQ - 20 * Math.log10(20)) < .00001, 'Step preview consumes the same explicit physical Q');

    const report = await page.evaluate(async () => {
      const rows = [], Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const original = Offline.prototype.createBiquadFilter;
      let filters;
      Offline.prototype.createBiquadFilter = function () { const node = original.call(this); filters.push(node); return node; };
      try {
        const state = GrainApp.getState(); state.tracks = [state.tracks[0]]; state.drive = state.space = 0; state.master = .5;
        const track = state.tracks[0]; track.mode = 'snare'; track.noise = 'white'; track.level = .35; track.pan = 0;
        track.synth.body.level = 0;
        Object.assign(track.synth.noise, { level: 1, resonance: .707, cutoff: 50, attack: .001, hold: 0, decay: .005, drive: 0, envAmount: 0, bursts: 1 });
        for (const type of ['lowpass', 'highpass', 'bandpass', 'notch']) {
          for (const q of type === 'lowpass' || type === 'highpass' ? [undefined, 10, 20] : [20]) {
            for (const curve of q === undefined ? ['exponential'] : ['exponential', 'linear']) {
              track.synth.noise.filter = type; track.synth.noise.curve = curve; filters = [];
              const event = { voice: 0, at: .1, velocity: .8, pitch: 0, ...(q === undefined ? {} : { locks: { cutoff: 50, resonance: q } }) };
              const output = await GrainApp.engine.renderNativeEvents(state, [event], { durationSeconds: .3, tailSeconds: .1 });
              const filter = filters[1], frequency = new Float32Array([50]), magnitude = new Float32Array(1), phase = new Float32Array(1);
              filter.getFrequencyResponse(frequency, magnitude, phase);
              const bytes = new DataView(await output.blob.arrayBuffer()), rate = bytes.getUint32(24, true);
              // Envelope is silent by110ms. Its source ends at124ms, when the
              // onended cleanup disconnects the voice. Check both sides in PCM.
              const cleanupFrame = Math.round(.124 * rate); let level = 0, jump = 0;
              for (let frame = cleanupFrame - 48; frame <= cleanupFrame + 48; frame++) {
                const value = bytes.getInt16(44 + frame * 4, true), previous = bytes.getInt16(44 + (frame - 1) * 4, true);
                level = Math.max(level, Math.abs(value)); jump = Math.max(jump, Math.abs(value - previous));
              }
              rows.push({ type, q: q ?? null, curve, audioParamQ: filter.Q.value, responseAtCutoff: magnitude[0], cleanupLevelPCM: level, cleanupJumpPCM: jump });
            }
          }
        }
      } finally { Offline.prototype.createBiquadFilter = original; }
      return rows;
    });
    for (const row of report) {
      const expected = row.q === null ? .707 : ['lowpass', 'highpass'].includes(row.type) ? 20 * Math.log10(row.q) : row.q;
      assert(Math.abs(row.audioParamQ - expected) < .00001, 'Actual filter AudioParam uses the intended Q: ' + JSON.stringify(row));
      if (['lowpass', 'highpass'].includes(row.type)) assert(Math.abs(row.responseAtCutoff - (row.q ?? 10 ** (.707 / 20))) < .0001, 'Measured resonance gain equals physical Q');
      assert(row.cleanupLevelPCM <= 1 && row.cleanupJumpPCM <= 1, 'No audible source-cleanup discontinuity: ' + JSON.stringify(row));
    }
    assert.deepEqual(errors, []);
    const output = { baselineEngine: baselinePath || null, defaultMaximumDifferencePCM: defaultDifference, previewQ, scenarios: report };
    fs.writeFileSync('/tmp/sizzle-resonance-probe.json', JSON.stringify(output, null, 2) + '\n');
    console.log('PASS ' + (oldEngine ? 'explicit baseline unlocked PCM, ' : '') + 'physical-Q UI/preview and measured low/high/band/notch resonance; ' + report.length + ' short-envelope cleanup probes are silent within1PCM. /tmp/sizzle-resonance-probe.json');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
