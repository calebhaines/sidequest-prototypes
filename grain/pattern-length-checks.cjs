/* Exercise the maintained sources without rebuilding the generated pages.
 * PLAYWRIGHT_MODULE / CHROMIUM_PATH can select another browser installation.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const checkpoint = process.env.KITCHEN_PATTERN_CHECKPOINT || 'kitchen-before-pattern-sequencing-20261014';
const apps = [
  ['grain', 'GrainApp', ['synth-params.js', 'presets.js', 'audio-engine.js', 'voice-lab.js', 'app.js']],
  ['tine', 'TineApp', ['synth-schema.js', 'presets.js', 'audio-engine.js', 'app.js']]
];
const pages = new Map();
for (const [id, , scripts] of apps) {
  const read = file => fs.readFileSync(path.join(root, id, file), 'utf8');
  const shared = ['pattern-schema.js', 'pattern-drums.js'].map(file => fs.readFileSync(path.join(root, 'shared', file), 'utf8'));
  pages.set('/' + id, read('app.html').replace('<!-- STYLES -->', '<style>' + read('styles.css') + '</style>')
    .replace('<!-- SCRIPTS -->', '<script>' + [...scripts.map(read), ...shared].join('\n').replace(/<\/script/g, '<\\/script') + '</script>'));
  pages.set('/' + id + '-old', execFileSync('git', ['show', checkpoint + ':' + id + '/index.html'], { cwd: root, maxBuffer: 20 * 1024 * 1024 }).toString());
}
function peak(wav, begin = 0, end = Infinity) {
  let value = 0;
  const bytes = Buffer.from(wav), start = 44 + Math.floor(begin * 44100) * 4, stop = Math.min(bytes.length, 44 + Math.floor(end * 44100) * 4);
  for (let at = start; at < stop; at += 2) value = Math.max(value, Math.abs(bytes.readInt16LE(at)) / 32768);
  return value;
}
function compareWavs(actual, expected, tolerance) {
  const a = Buffer.from(actual, 'base64'), b = Buffer.from(expected, 'base64');
  assert.equal(a.length, b.length, 'Legacy WAV duration is unchanged');
  let maximum = 0;
  for (let at = 44; at < a.length; at += 2) maximum = Math.max(maximum, Math.abs(a.readInt16LE(at) - b.readInt16LE(at)));
  assert(maximum <= tolerance, 'Legacy native audio differs by ' + maximum + ' PCM units');
  return maximum;
}
function withoutNewDefaults(state, id) {
  for (const track of state.tracks) {
    assert.deepEqual(track.galleyFx, [null, null], 'Legacy percussion voices receive two empty GALLEY slots');
    delete track.galleyFx;
  }
  if (id === 'tine') {
    assert.deepEqual(state.chain, { enabled: false, loop: true, entries: [] }, 'Legacy CLATTER starts with its new chain disabled');
    delete state.chain;
  }
  return state;
}
(async () => {
  const server = http.createServer((request, response) => {
    const html = pages.get(request.url);
    response.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' }); response.end(html || 'Missing test page');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const [id, facade] of apps) {
      const page = await browser.newPage(), old = await browser.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
      await old.goto(url + '/' + id + '-old'); await page.goto(url + '/' + id);
      await page.waitForFunction(name => window[name], facade); await old.waitForFunction(name => window[name], facade);
      // All factory states and their native render order retain the original voices, hits and timing.
      const presets = await old.locator('#preset-select option').count();
      const differences = [];
      for (let preset = 0; preset < presets - 1; preset++) {
        await old.locator('#preset-select').selectOption(String(preset)); await page.locator('#preset-select').selectOption(String(preset));
        const expected = await old.evaluate(name => window[name].getState(), facade);
        const actual = await page.evaluate(name => window[name].getState(), facade);
        assert.equal(actual.stepCount, 16); delete actual.stepCount; assert.deepEqual(withoutNewDefaults(actual, id), expected);
        const render = name => window[name].exportAudio({ bars: 1, tailSeconds: .2 }).then(async result => {
          const bytes = new Uint8Array(await result.blob.arrayBuffer()); let encoded = '';
          for (let start = 0; start < bytes.length; start += 8192) encoded += String.fromCharCode(...bytes.subarray(start, start + 8192));
          return btoa(encoded);
        });
        differences.push(compareWavs(await page.evaluate(render, facade), await old.evaluate(render, facade), id === 'tine' ? 3 : 1));
      }
      const seededGroove = name => {
        const original = Math.random; let seed = 321;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        try { document.querySelector('#random-button').click(); return window[name].getState(); } finally { Math.random = original; }
      };
      const oldGroove = await old.evaluate(seededGroove, facade), newGroove = await page.evaluate(seededGroove, facade);
      delete newGroove.stepCount; assert.deepEqual(withoutNewDefaults(newGroove, id), oldGroove, '16-step groove generation retains the original RNG order');
      await page.locator('#preset-select').selectOption('0');
      await old.locator('#preset-select').selectOption('0');
      const legacy = await old.evaluate(name => window[name].getProject(), facade);
      await page.evaluate(({ name, project }) => window[name].loadState(project), { name: facade, project: legacy });
      const legacyOne = JSON.parse(JSON.stringify(legacy)); legacyOne.version = 1;
      legacyOne.state.tracks.forEach(track => {
        for (const key of id === 'grain' ? ['synth'] : ['strikeMaterial', 'contactTexture', 'rebound', 'reboundTime']) delete track[key];
      });
      await page.evaluate(({ name, project }) => window[name].loadState(project), { name: facade, project: legacyOne });
      const upgraded = await page.evaluate(name => window[name].getState(), facade);
      delete upgraded.stepCount; assert.deepEqual(withoutNewDefaults(upgraded, id), legacy.state, 'Version1 migration retains the original16-step sound and hits');
      assert.equal(await page.locator('#sequence-length').inputValue(), '16');
      assert(await page.locator('#sequence-page').isHidden());
      assert.equal(await page.locator('#track-rows .step').count(), 128);
      await page.locator('#sequence-length').selectOption('32');
      assert.equal(await page.locator('#track-rows .step').count(), 128, '32-step mode keeps the same visible grid');
      await page.locator('#sequence-page').selectOption('1');
      assert.equal(await page.locator('#step-numbers').innerText(), Array.from({ length: 16 }, (_, index) => String(index + 17)).join('\n'));
      const expanded = await page.evaluate(name => window[name].getProject(), facade);
      assert(expanded.state.tracks.every(track => track.steps.length === 32 && track.steps.slice(16).every(hit => hit === 0)));
      assert(expanded.banks.flat().every(steps => steps.length === 32));
      await page.locator('[data-track="0"][data-step="31"]').click({ modifiers: ['Shift'] });
      await page.locator('#copy-pattern').click(); await page.locator('[data-bank="1"]').click();
      assert.equal(await page.evaluate(name => window[name].getState().tracks[0].steps[31], facade), 2);
      await page.locator('#sequence-length').selectOption('16');
      await page.locator('#clear-button').click();
      let packet = await page.evaluate(() => MusicLabPatternInstrument.exportPattern());
      assert.equal(packet.lengthBeats, 4); assert.equal(packet.notes.length, 0, 'Inactive second-half hits never leak into shared exports');
      await page.locator('#sequence-length').selectOption('32'); await page.locator('#sequence-page').selectOption('1');
      assert.equal(await page.locator('[data-track="0"][data-step="31"]').getAttribute('aria-pressed'), 'true');
      await page.locator('[data-track="0"][data-step="31"]').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#sequence-page').inputValue(), '0');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.step), '0');
      await page.locator('#sequence-length').selectOption('16'); await page.locator('#undo-button').click();
      assert.equal(await page.locator('#sequence-length').inputValue(), '32');
      const saved = await page.evaluate(name => window[name].getProject(), facade);
      await page.evaluate(({ name, project }) => window[name].loadState(project), { name: facade, project: saved });
      await page.waitForTimeout(300); await page.reload();
      assert.deepEqual(await page.evaluate(name => window[name].getProject(), facade), saved, 'Persistence keeps hidden hits, banks and active length');
      for (const invalid of [24, '32', null]) {
        const rejected = await page.evaluate(({ name, count }) => {
          const next = window[name].getProject(); next.state.stepCount = count;
          try { window[name].loadState(next); return false; } catch (_) { return true; }
        }, { name: facade, count: invalid });
        assert(rejected, 'Invalid sequence length is rejected');
      }
      const rejected = await page.evaluate(name => {
        const next = window[name].getProject(); next.banks[0][0].push(1);
        try { window[name].loadState(next); return false; } catch (_) { return true; }
      }, facade);
      assert(rejected, 'Invalid backing array length is rejected');
      // A pattern containing only second-half hits must remain silent in the first bar.
      await page.evaluate(name => {
        const app = window[name], next = app.getProject(); next.state.bpm = 240; next.state.swing = next.state.space = next.state.drive = 0;
        next.state.tracks.forEach(track => { track.steps = Array(32).fill(0); track.mute = track.solo = false; });
        next.state.tracks[0].steps[16] = 1; next.state.tracks[0].steps[31] = 2;
        next.banks[next.bank] = next.state.tracks.map(track => [...track.steps]); app.loadState(next);
      }, facade);
      packet = await page.evaluate(() => MusicLabPatternInstrument.exportPattern());
      assert.equal(packet.lengthBeats, 8); assert.deepEqual(packet.notes.map(note => note.beat), [4, 7.75]);
      const wav = await page.evaluate(async name => Array.from(new Uint8Array(await (await window[name].exportAudio({ bars: 2, tailSeconds: .3 })).blob.arrayBuffer())), facade);
      assert.equal(peak(wav, 0, 1), 0); assert(peak(wav, 1, 1.5) > .01); assert(peak(wav, 1.95, 2.1) > .01);
      await page.evaluate(async name => {
        const app = window[name]; await app.engine.init(); window.lengthSteps = []; window.lengthVoices = [];
        const voices = app.engine.environment.voices, add = voices.add;
        voices.add = function (voice) { window.lengthVoices.push({ step: app.engine.currentStep, time: voice.startTime, volume: voice.volume }); return add.call(this, voice); };
        await app.play(); const display = app.engine.onStep;
        app.engine.onStep = step => { window.lengthSteps.push(step); display(step); };
      }, facade);
      await page.waitForFunction(() => window.lengthSteps.filter(step => step === 0).length >= 2);
      const live = await page.evaluate(name => { window[name].stop(); return { steps: window.lengthSteps, voices: window.lengthVoices }; }, facade);
      assert(live.steps.includes(16) && live.steps.includes(31));
      assert.deepEqual(live.voices.slice(0, 2).map(voice => voice.step), [16, 31], 'Native scheduler reaches both second-half hits');
      assert(Math.abs(live.voices[1].time - live.voices[0].time - 15 / 16) < 1e-9, 'Native scheduler preserves sixteenth-note timing');
      assert(live.voices[1].volume > live.voices[0].volume, 'Step32 retains its accent');
      assert.equal(await page.locator('#beat-position').innerText(), '1 . 1 . 1');
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('#sequence-length,#sequence-page,.sequencer-actions'))
          .filter(element => { const bounds = element.getBoundingClientRect(); return bounds.left < 0 || bounds.right > innerWidth; }).map(element => element.id || element.className));
        assert.deepEqual(overflow, [], '32-step controls remain visible at ' + width + ' px');
      }
      assert.deepEqual(errors, []);
      console.log(id + ': factory states/audio preserved (' + differences.length + ' grooves; max ' + Math.max(...differences) + ' PCM units), legacy load, 32-step edit/banks/undo/persistence, strict validation, native audio/export/timing and shared patterns passed.');
      await old.close(); await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
