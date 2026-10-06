'use strict';

// Checks the actual self-contained Kitchen instruments. Baselines are captured
// before packaging a refresh; no substitute synthesis engine is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT = path.resolve(process.env.KITCHEN_ROOT || path.join(__dirname, '..'));
const REPORT = process.env.KITCHEN_REPORT || '/tmp/kitchen-interface-refresh-qa';
const BASELINE = process.env.KITCHEN_BASELINE || '/tmp/kitchen-interface-refresh-baseline.json';
const capture = process.argv.includes('--capture-baseline');
const refreshNativeReference = process.argv.includes('--refresh-native-reference');
const apps = [
  ['grain', 'GrainApp', '#play-button', '#restart-button'],
  ['tine', 'TineApp', '#play-button', '#restart-button'],
  ['mire', 'MireApp', '#play-button', '#panic-button'],
  ['spool', 'SpoolApp', '#play-button', '#panic-button'],
  ['haze', 'HazeApp', '#play-button', '#panic-button'],
  ['bower', 'BowerApp', '#playButton', '#stopButton'],
  ['ravel', 'RavelApp', '#playButton', '#panicButton'],
  ['fable', 'FableApp', '#play', '#stop'],
  ['roux', 'RouxApp', '#playButton', '#stopButton'],
  ['batter', 'BatterApp', '#playButton', '#stopButton']
].filter(([id]) => !process.env.KITCHEN_APPS || process.env.KITCHEN_APPS.split(',').includes(id));
const report = { capture, checks: [], apps: [], errors: [] };
fs.mkdirSync(REPORT, { recursive: true });
const pass = label => { report.checks.push(label); console.log('PASS ' + label); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function wavSamples(base64) {
  const bytes = Buffer.from(base64, 'base64'); let format, data;
  for (let at = 12; at + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (name === 'fmt ') format = bytes.subarray(at + 8, at + 8 + size);
    if (name === 'data') data = bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + size % 2;
  }
  assert(format && data, 'Reference audio must contain real WAV format and samples');
  assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(14), 16);
  return { format, data };
}

function nativeDifference(actual, expected, exactLength = true) {
  const a = wavSamples(actual.wav), b = wavSamples(expected.wav); assert.deepEqual(a.format, b.format);
  if (exactLength) assert.equal(a.data.length, b.data.length, 'Native WAV sample count is preserved');
  const length = Math.max(a.data.length, b.data.length) / 2; let max = 0, power = 0, count = 0;
  for (let i = 0; i < length; i++) {
    const x = i * 2 < a.data.length ? a.data.readInt16LE(i * 2) : 0, y = i * 2 < b.data.length ? b.data.readInt16LE(i * 2) : 0;
    const difference = x - y; max = Math.max(max, Math.abs(difference)); power += difference * difference; if (difference) count++;
  }
  return { maxLSB: max, rms: Math.sqrt(power / length) / 32768, changedSamples: count, samples: length };
}

function compareAudio(id, actual, expected, label) {
  if (!['grain', 'tine', 'fable', 'batter'].includes(id)) {
    assert.equal(actual.hash, expected.hash, label + ' exact rendered audio');
    if (expected.offline) assert.deepEqual(actual.offline, expected.offline, label + ' exact OfflineAudioContext PCM');
    return;
  }
  // Native oscillator/filter/convolver float accumulation varies slightly even
  // between repeated old-app renders in the same Chrome process. Against full
  // real old references, SIZZLE differs by at most one16-bit step. CLATTER's
  // high-Q native resonators show up to three steps even old versus old.
  let difference;
  if (id === 'fable') {
    const a = Buffer.from(actual.floatPCM, 'base64'), b = Buffer.from(expected.floatPCM, 'base64'); assert.equal(a.length, b.length);
    const x = new Float32Array(a.buffer, a.byteOffset, a.length / 4), y = new Float32Array(b.buffer, b.byteOffset, b.length / 4); let maximum = 0, power = 0;
    for (let i = 0; i < x.length; i++) { const d = x[i] - y[i]; maximum = Math.max(maximum, Math.abs(d)); power += d * d; }
    assert(maximum < 1e-6 && Math.sqrt(power / x.length) < 1e-7, label + ' native sample-graph float preservation'); difference = { maximumFloat: maximum, rms: Math.sqrt(power / x.length) };
  } else { difference = nativeDifference(actual, expected); assert(difference.maxLSB <= (id === 'tine' ? 3 : 1), label + ': ' + JSON.stringify(difference)); }
  if (expected.offline) {
    assert.equal(actual.offline.length, expected.offline.length);
    for (let i = 0; i < actual.offline.length; i++) {
      const a = actual.offline[i], b = expected.offline[i]; assert.equal(a.frames, b.frames); assert.equal(a.sampleRate, b.sampleRate); assert.equal(a.channels.length, b.channels.length);
      for (let ch = 0; ch < a.channels.length; ch++) {
        const aBytes = Buffer.from(a.channelPCM[ch], 'base64'), bBytes = Buffer.from(b.channelPCM[ch], 'base64');
        const x = new Float32Array(aBytes.buffer, aBytes.byteOffset, aBytes.length / 4), y = new Float32Array(bBytes.buffer, bBytes.byteOffset, bBytes.length / 4); let maximum = 0, power = 0;
        for (let j = 0; j < x.length; j++) { const delta = x[j] - y[j]; maximum = Math.max(maximum, Math.abs(delta)); power += delta * delta; }
        assert(maximum < (id === 'tine' ? 6e-5 : 1e-6), label + ' actual native float PCM difference ' + maximum);
        assert(Math.sqrt(power / x.length) < (id === 'tine' ? 1e-5 : 1e-7), label + ' native float RMS preservation');
      }
    }
  }
  report.nativePrecision = report.nativePrecision || []; report.nativePrecision.push({ label, ...difference });
}

function audioProbe() {
  window.__kitchenAudio = { offline: [], taps: [] };
  window.__kitchenHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  window.__kitchenBase64 = bytes => {
    const array = new Uint8Array(bytes); let value = '';
    for (let i = 0; i < array.length; i += 16384) value += String.fromCharCode(...array.subarray(i, i + 16384));
    return btoa(value);
  };
  const offline = OfflineAudioContext.prototype.startRendering;
  OfflineAudioContext.prototype.startRendering = async function (...args) {
    const result = await offline.apply(this, args), channels = [], metrics = [], channelPCM = [];
    for (let ch = 0; ch < result.numberOfChannels; ch++) {
      const pcm = result.getChannelData(ch); channels.push(await __kitchenHash(pcm.buffer));
      let energy = 0, peak = 0;
      for (const value of pcm) { if (!Number.isFinite(value)) throw Error('Non-finite offline audio'); energy += value * value; peak = Math.max(peak, Math.abs(value)); }
      metrics.push({ peak, rms: Math.sqrt(energy / pcm.length) });
      if (window.__kitchenKeepPCM) channelPCM.push(__kitchenBase64(pcm.buffer));
    }
    __kitchenAudio.offline.push({ sampleRate: result.sampleRate, frames: result.length, channels, metrics, ...(channelPCM.length ? { channelPCM } : {}) });
    return result;
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination instanceof AudioDestinationNode && !(this.context instanceof OfflineAudioContext)) {
      const analyser = this.context.createAnalyser(), mute = this.context.createGain();
      analyser.fftSize = 2048; mute.gain.value = 0;
      connect.call(this, analyser); connect.call(analyser, mute); connect.call(mute, destination);
      __kitchenAudio.taps.push({ analyser, context: this.context });
    }
    return result;
  };
}

async function open(browser, id, facade, htmlPath = path.join(ROOT, id, 'index.html')) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await context.newPage(), errors = [], blocked = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(audioProbe);
  const url = `https://${id}.kitchen-refresh.test/`, bytes = (capture || refreshNativeReference) && process.env.KITCHEN_BASELINE_COMMIT
    ? execFileSync('git', ['show', `${process.env.KITCHEN_BASELINE_COMMIT}:${id}/index.html`], { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 })
    : fs.readFileSync(htmlPath);
  await page.route('**/*', route => {
    if (route.request().url() === url) return route.fulfill({ status: 200, contentType: 'text/html', body: bytes });
    blocked.push(route.request().url()); return route.abort();
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(f => !!window[f]?.getState && !!window[f]?.engine, facade, { timeout: 60000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page, errors, blocked, bytes };
}

async function audio(page, facade, options = {}) {
  return page.evaluate(async ({ facade, options }) => {
    __kitchenAudio.offline.length = 0;
    window.__kitchenKeepPCM = ['GrainApp', 'TineApp', 'FableApp', 'BatterApp'].includes(facade);
    const app = window[facade], scopes = app.audioExport.scopes;
    const selected = options.scope || scopes.find(x => ['pattern', 'mix', 'score'].includes(x.id))?.id || scopes[0].id;
    const result = await app.exportAudio({ scope: selected, bars: 1, tailSeconds: .15, ...options });
    const bytes = result.blob ? await result.blob.arrayBuffer() : Float32Array.from(result.pcm).buffer;
    return { hash: await __kitchenHash(bytes), bytes: bytes.byteLength, sampleRate: result.sampleRate, offline: __kitchenAudio.offline,
      ...(__kitchenKeepPCM ? { [result.blob ? 'wav' : 'floatPCM']: __kitchenBase64(bytes) } : {}) };
  }, { facade, options });
}

async function current(page, facade) {
  return page.evaluate(async facade => {
    const app = window[facade], state = app.getState();
    return { state, project: app.getProject ? await app.getProject() : state,
      exportScopes: app.audioExport.scopes, importSpec: app.audioImport || null,
      nativePattern: !!window.MusicLabPatternInstrument,
      voices: window.MusicLabPatternInstrument?.voices || null };
  }, facade);
}

async function restore(page, facade, state) {
  await page.evaluate(async ({ facade, state }) => { await window[facade].loadState(state); }, { facade, state });
}

async function baselineApp(browser, [id, facade]) {
  const { context, page, errors, blocked, bytes } = await open(browser, id, facade);
  try {
    const before = await current(page, facade), rendered = await audio(page, facade);
    assert(rendered.bytes > 1000, id + ' must render audio');
    const source = (capture || refreshNativeReference) && process.env.KITCHEN_BASELINE_COMMIT
      ? execFileSync('git', ['show', `${process.env.KITCHEN_BASELINE_COMMIT}:${id}/app.html`], { cwd: ROOT, encoding: 'utf8' })
      : fs.readFileSync(path.join(ROOT, id, 'app.html'), 'utf8');
    const controls = [...source.matchAll(/<(?:input|select|button|textarea)\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
    const result = { ...before, rendered, htmlSHA: sha(bytes), controls };
    if (id === 'grain') {
      result.originalPresets = await page.evaluate(() => JSON.parse(JSON.stringify(NOISE_PRESETS.slice(0, 6))));
      result.presetAudio = [];
      for (let i = 0; i < 6; i++) {
        const preset = result.originalPresets[i];
        const output = await page.evaluate(async preset => {
          const blob = await GrainApp.engine.exportWav({ ...preset, master: .78 }, { bars: 1, tailSeconds: .15 });
          const bytes = await blob.arrayBuffer(); return { hash: await __kitchenHash(bytes), bytes: blob.size, wav: __kitchenBase64(bytes) };
        }, preset);
        result.presetAudio.push(output);
      }
      result.hitAudio = await audio(page, facade, { scope: 'hit', tailSeconds: .1 });
    }
    if (id === 'fable') result.sourceAudio = await audio(page, facade, { scope: 'source' });
    if (id === 'batter') {
      await restore(page, facade, before.project); result.restoredState = (await current(page, facade)).state;
      result.restoredAudio = await audio(page, facade);
    }
    assert.deepEqual(errors, [], id + ' baseline errors');
    assert.deepEqual(blocked, [], id + ' baseline external dependencies');
    pass(id + ' baseline project, capabilities, and actual render captured');
    return result;
  } finally { await context.close(); }
}

async function inspectViewport(page, id, width) {
  await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
  await page.evaluate(() => { scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const metrics = await page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const headers = [...document.querySelectorAll('header, .topbar, .masthead')];
    return { viewport: innerWidth, width: document.documentElement.scrollWidth,
      clippedHeaders: headers.flatMap(header => [...header.querySelectorAll('button,a,select')]).filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => ({ id: el.id, text: el.textContent.trim() })),
      smallPrimaryTargets: [...document.querySelectorAll('header button,.topbar button,.masthead button,.transport button')].filter(visible).filter(el => el.getBoundingClientRect().height < 35).map(el => ({ id: el.id, height: el.getBoundingClientRect().height })),
      controls: document.querySelectorAll('button,input,select').length };
  });
  await page.screenshot({ path: path.join(REPORT, `${id}-${width}.png`), fullPage: width === 390 || width === 1440 });
  assert(metrics.width <= width + 1, `${id} document overflow at ${width}: ${metrics.width}`);
  assert.deepEqual(metrics.clippedHeaders, [], `${id} header actions must fit at ${width}`);
  assert.deepEqual(metrics.smallPrimaryTargets, [], `${id} main actions need usable touch targets at ${width}`);
  return metrics;
}

async function checkApp(browser, config, saved) {
  const [id, facade, play, stop] = config;
  const { context, page, errors, blocked, bytes } = await open(browser, id, facade);
  const row = { id, htmlSHA: sha(bytes), viewports: [] }; report.apps.push(row);
  try {
    const fresh = await current(page, facade);
    for (const control of saved.controls || []) assert.equal(await page.locator('#' + control).count(), 1, `${id} keeps original control #${control}`);
    assert.deepEqual(fresh.state, saved.state, id + ' fresh musical defaults must remain unchanged');
    assert.deepEqual(fresh.exportScopes, saved.exportScopes, id + ' existing audio export scopes');
    assert.deepEqual(fresh.importSpec, saved.importSpec, id + ' existing audio imports');
    assert.equal(fresh.nativePattern, saved.nativePattern, id + ' shared pattern facade');
    if (id === 'fable' && saved.sourceAudio) assert.equal((await audio(page, facade, { scope: 'source' })).hash, saved.sourceAudio.hash, 'STOCK original source sample remains byte exact');
    if (id === 'batter') await checkBatterTouch(page, saved);
    const rendered = await audio(page, facade);
    compareAudio(id, rendered, saved.rendered, id + ' original default rendered audio');
    await restore(page, facade, saved.project);
    assert.deepEqual((await current(page, facade)).state, saved.restoredState || saved.state, id + ' original portable project restores exactly as the original app');
    if (saved.restoredAudio) compareAudio(id, await audio(page, facade), saved.restoredAudio, id + ' original portable project audio');
    pass(id + ' default, old project, original sound and exchange capabilities preserved');
    for (const width of [320, 390, 768, 1440]) row.viewports.push(await inspectViewport(page, id, width));
    pass(id + ' four responsive layouts and header touch targets');
    await page.locator(play).click();
    await page.waitForFunction(facade => {
      const app = window[facade]; return app.isPlaying?.() || app.engine.playing || app.engine.isPlaying || app.engine.getMeters?.().playing;
    }, facade, { timeout: 20000 });
    const audible = await page.evaluate(async () => {
      let rms = 0;
      for (let i = 0; i < 50 && rms < .0005; i++) {
        for (const tap of __kitchenAudio.taps) {
          const pcm = new Float32Array(tap.analyser.fftSize); tap.analyser.getFloatTimeDomainData(pcm);
          rms = Math.max(rms, Math.sqrt(pcm.reduce((energy, value) => energy + value * value, 0) / pcm.length));
        }
        if (rms < .0005) await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return rms;
    });
    assert(audible > .0005, id + ' actual live output must be audible'); row.liveRms = audible;
    // Use the same main play control to stop toggle-only instruments.
    const stopButton = page.locator(stop); if (await stopButton.count()) await stopButton.click(); else await page.locator(play).click();
    await page.evaluate(f => { const app = window[f]; app.stop?.(); app.engine.stop?.(); }, facade);
    pass(id + ' visible transport drives audible live Web Audio');
    await checkEditor(page, id, facade, saved);
    if (id === 'grain') await checkSizzle(page, saved);
    assert.deepEqual(errors, [], id + ' application errors'); assert.deepEqual(blocked, [], id + ' standalone dependencies');
  } finally { await context.close(); }
}

async function reveal(page, locator) {
  // Native details remain genuinely user-operated; opening them is display
  // state and must never mutate the saved instrument.
  const details = await locator.evaluate(el => {
    const ids = [];
    for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) {
      if (!parent.id) parent.id = 'qa-open-' + ids.length + '-' + Math.random().toString(36).slice(2); ids.unshift(parent.id);
    }
    return ids;
  });
  for (const id of details) await page.locator('#' + id + ' > summary').click();
}

async function changeInput(locator) {
  await locator.scrollIntoViewIfNeeded();
  const kind = await locator.getAttribute('type');
  if (kind === 'range' || await locator.getAttribute('role') === 'slider') {
    await locator.focus(); await locator.press('End'); await locator.press('ArrowLeft'); await locator.press('Tab');
  } else {
    const value = await locator.inputValue(); await locator.fill(String(Number(value) + 7)); await locator.press('Tab');
  }
}

async function checkEditor(page, id, facade, saved) {
  await restore(page, facade, saved.project);
  const original = await current(page, facade), before = await audio(page, facade);
  const navigation = {
    grain: ['#edit-synthesis', '[data-synth-tab="body"]'],
    tine: ['.impact-details > summary', '[data-synth-tab="resonator"]'],
    mire: ['a[href="#network-workspace"]'],
    spool: ['a[href="#spool-editor"]', '[data-tab="tape"]'],
    haze: ['.sound-bench > summary'],
    bower: ['#tabString'],
    ravel: [],
    fable: ['#stockEditView', '[data-inspector-tab="sample"]'],
    roux: ['a[href="#roux-sound"]', '[data-tab="motion"]'],
    batter: ['a[href="#batter-drum"]']
  };
  for (const selector of navigation[id]) {
    const element = page.locator(selector); if (await element.count()) await element.first().click();
  }
  assert.deepEqual((await current(page, facade)).state, original.state, id + ' editor navigation must stay outside musical state');
  const controls = {
    grain: '[role="slider"][data-param="synth-body-frequency"]',
    tine: '#impact-knobs [data-param="pitchHz"] [role="slider"]',
    mire: 'input[aria-label="Node A decay"]',
    spool: 'input[aria-label="Deck A saturation"]',
    haze: '#control-color',
    bower: '#lane-position',
    ravel: '#step-pitch',
    fable: '[data-zone-field="transpose"]',
    roux: '#synth-drive',
    batter: 'input[aria-label="Heat / drive"]'
  };
  const input = page.locator(controls[id]).first();
  assert(await input.count(), id + ' preserved deep sound field'); await reveal(page, input); await input.scrollIntoViewIfNeeded();
  assert(await input.isVisible(), id + ' deep controls are reachable through labeled navigation');
  if (id === 'ravel') {
    const enabled = await page.evaluate(() => RavelApp.getState().patterns[RavelApp.getState().selectedPattern].steps.findIndex(step => step.on));
    await page.locator(`.step[data-step="${enabled}"] .step-main`).click();
  }
  await changeInput(input);
  const edited = await current(page, facade); assert.notDeepEqual(edited.state, original.state, id + ' real sound control changes saved musical state');
  const after = await audio(page, facade);
  if (['grain', 'tine'].includes(id)) assert(nativeDifference(after, before, false).rms > .0001, id + ' deep sound control changes actual exported audio');
  else assert.notEqual(after.hash, before.hash, id + ' deep sound control changes actual exported audio');
  await restore(page, facade, edited.project); assert.deepEqual((await current(page, facade)).state, edited.state, id + ' edited controls survive project restoration');
  compareAudio(id, await audio(page, facade), after, id + ' saved edited sound');
  for (const width of [320, 390, 768, 1440]) {
    await inspectViewport(page, id, width);
    assert(await input.isVisible(), id + ' deep control remains available at ' + width);
  }
  await restore(page, facade, saved.project);
  if (id === 'haze') await checkSteamDetail(page, saved);
  if (id === 'bower') {
    const beforeRack = await page.evaluate(() => BowerApp.getState()); await page.locator('.rack-string').nth(2).click();
    assert.deepEqual(await page.evaluate(() => BowerApp.getState()), beforeRack, 'SKEWER playable rack preserves musical project');
    assert(/\d/.test(await page.locator('#rackNote').innerText()), 'SKEWER playable rack reports actual note');
  }
  pass(id + ' editor navigation, retained deep sound control, audible edits and exact project persistence');
}

async function checkSteamDetail(page, saved) {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = await page.evaluate(() => HazeApp.getState());
  await page.locator('#detail-view-button').click(); await page.locator('#detail-time').selectOption('16'); await page.locator('#detail-pitch').selectOption('8');
  assert.deepEqual(await page.evaluate(() => HazeApp.getState()), original, 'STEAM zoom and focus stay outside saved score');
  const canvas = page.locator('#score-canvas'); await canvas.scrollIntoViewIfNeeded(); const rect = await canvas.boundingBox();
  const column = 18, band = 10, x = rect.x + 43 + ((column - 16) + .5) * (rect.width - 49) / 8;
  const y = rect.y + 15 + (8 - 1 - (band - 8) + .5) * (rect.height - 35) / 8;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await client.detach();
  const edited = await page.evaluate(() => HazeApp.getState());
  assert(edited.score[band][column] > 0, 'STEAM enlarged touch cell uses exact global score coordinates');
  for (let b = 0; b < 24; b++) for (let c = 0; c < 32; c++) if (b !== band || c !== column) assert.equal(edited.score[b][c], original.score[b][c], 'STEAM detail view edits one exact cell');
  assert((await page.locator('#selected-pitch').innerText()).includes('Hz'), 'STEAM detail editor reports actual frequency');
  await page.locator('#undo-button').click(); assert.deepEqual(await page.evaluate(() => HazeApp.getState()), original, 'STEAM precise paint Undo');
  await restore(page, 'HazeApp', saved.project);
}

async function checkBatterTouch(page, saved) {
  await page.setViewportSize({ width: 390, height: 844 });
  const undoBefore = await page.locator('#undoButton').isDisabled(), before = await page.evaluate(() => BatterApp.getState());
  const cell = page.locator('.step-cell[data-lane="snare"][data-step="2"]'); await cell.scrollIntoViewIfNeeded();
  const rect = await cell.boundingBox(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2, client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForFunction(() => document.querySelector('#selectedStepNumber').textContent === '03' && /SNARE/.test(document.querySelector('#selectedStepLane').textContent.toUpperCase()), {}, { timeout: 2000 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await page.evaluate(() => BatterApp.getState()), before, 'BATTER long press selects without toggling');
  assert.equal(await page.locator('#undoButton').isDisabled(), undoBefore, 'BATTER long press creates no Undo entry');
  await cell.tap(); const after = await page.evaluate(() => BatterApp.getState());
  const p = before.patterns.find(p => p.id === before.selectedPattern), q = after.patterns.find(p => p.id === after.selectedPattern), li = before.lanes.findIndex(l => l.id === 'snare');
  assert.equal(q.lanes[li].steps[2].on, !p.lanes[li].steps[2].on, 'BATTER ordinary touch still toggles hit');
  await page.locator('#undoButton').click(); assert.deepEqual(await page.evaluate(() => BatterApp.getState()), before);
  await client.detach(); await page.setViewportSize({ width: 1440, height: 1000 });
  pass('BATTER true touch long press selects without changing music/history; normal tap edits and Undo restores');
}

async function checkGalley(browser, baseline) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); await page.addInitScript(audioProbe);
  const html = fs.readFileSync(process.env.GALLEY_FILE || path.join(ROOT, 'loom', 'index.html'));
  const url = 'http://localhost/music/loom/interface-check';
  await page.route('**/*', route => route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html', body: html }) : route.abort());
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 }); await page.waitForFunction(() => window.LoomApp);
    await page.evaluate(project => { window.__kitchenSizzleOldProject = project; }, baseline.grain.project);
    for (const [id, facade] of apps) {
      const expectedHash = sha(fs.readFileSync(path.join(ROOT, id, 'index.html')));
      const result = await page.evaluate(async ({ id, facade, expectedHash }) => {
        const app = LoomApp; await app.engine.init(); await app.engine.context.resume();
        const trackId = app.getState().tracks[0].id, frame = document.createElement('iframe'); document.body.append(frame);
        try {
          const loaded = await app.host.load(trackId, { id }, frame), child = frame.contentWindow;
          await app.host.command(trackId, 'prepare'); const snapshot = await app.host.snapshot(trackId), native = child[facade];
          // Source templates carry the exact complete instrument, rather than
          // loading siblings or fetching an outdated standalone app.
          const template = window.LoomEmbeddedInstruments?.[id];
          if (typeof template !== 'string' || await __kitchenHash(new TextEncoder().encode(template)) !== expectedHash) throw Error('Stale embedded instrument source: ' + id);
          const probe = { loaded, title: child.document.title, hasNotes: !!loaded.capabilities.notes, rendered: null, peak: null, sizzle: null };
          if (['grain', 'tine', 'bower', 'fable', 'batter'].includes(id)) {
            const pattern = await app.host.exportPattern(trackId), output = await app.host.renderPattern(trackId, { pattern, tempo: pattern.tempo, tailSeconds: .15 });
            let pcm = output.pcm;
            if (!pcm && output.blob) {
              const decoded = await app.engine.context.decodeAudioData(await output.blob.arrayBuffer()); pcm = new Float32Array(decoded.length * 2);
              const left = decoded.getChannelData(0), right = decoded.getChannelData(Math.min(1, decoded.numberOfChannels - 1));
              for (let i = 0; i < decoded.length; i++) { pcm[i * 2] = left[i]; pcm[i * 2 + 1] = right[i]; }
            }
            if (!pcm) throw Error('Native host renderer returned no PCM or WAV');
            let power = 0; for (const value of pcm) { if (!Number.isFinite(value)) throw Error('Non-finite native host audio'); power += value * value; }
            probe.rendered = { rms: Math.sqrt(power / pcm.length), frames: pcm.length / 2 };
            app.engine.resumeAudition(trackId);
            const note = pattern.notes[0]; if (!note) throw Error('Factory pattern has no note');
            for (let i = 0; i < 3; i++) app.host.scheduleNote(trackId, { id: 'ui-refresh-' + i, voice: note.voice, pitch: note.pitch, velocity: .8, when: app.engine.context.currentTime + .08 + i * .08, durationSeconds: .25, source: 'loom-live' });
            let peak = 0;
            for (let frame = 0; frame < 45 && peak < .005; frame++) { await new Promise(resolve => requestAnimationFrame(resolve)); peak = Math.max(peak, app.engine.getMeters().tracks[0].peak); }
            probe.peak = peak; app.host.cancelNotes(trackId, { source: 'loom-live' });
          }
          if (id === 'grain') {
            await native.loadState(window.__kitchenSizzleOldProject);
            const output = await native.exportAudio({ scope: 'pattern', bars: 1, tailSeconds: .15 });
            const bytes = await output.blob.arrayBuffer(); probe.sizzle = { hash: await __kitchenHash(bytes), wav: __kitchenBase64(bytes) };
            if (!child.document.querySelector('#noise-bench')) throw Error('GALLEY embedded SIZZLE is stale');
          }
          await app.host.restore(trackId, snapshot); const restored = await app.host.snapshot(trackId);
          if (JSON.stringify(snapshot.state) !== JSON.stringify(restored.state)) throw Error(id + ' hosted project restore changed musical state');
          await app.host.command(trackId, 'panic'); return probe;
        } finally { app.host.unload(trackId); frame.remove(); }
      }, { id, facade, expectedHash });
      assert(result.loaded.ready, id + ' GALLEY instrument ready');
      if (result.rendered) { assert(result.rendered.rms > .0005, id + ' native host offline audio'); assert(result.peak > .005, id + ' routed note must reach real mixer'); }
      if (id === 'grain') compareAudio(id, result.sizzle, { ...baseline.grain.rendered, offline: undefined }, 'Hosted original SIZZLE PCM');
      report.apps.push({ id: 'galley-' + id, ...result }); pass('GALLEY embeds, prepares and restores refreshed ' + id + (result.rendered ? ' with audible native note routing and rendering' : ''));
    }
    assert.deepEqual(errors, [], 'GALLEY application errors');
  } finally { await context.close(); }
}

async function checkSizzle(page, saved) {
  const presets = await page.evaluate(() => JSON.parse(JSON.stringify(NOISE_PRESETS.slice(0, 6))));
  assert.deepEqual(presets, saved.originalPresets, 'SIZZLE original six presets including names/order/values');
  for (let i = 0; i < 6; i++) {
    const result = await page.evaluate(async preset => { const bytes = await (await GrainApp.engine.exportWav({ ...preset, master: .78 }, { bars: 1, tailSeconds: .15 })).arrayBuffer(); return { hash: await __kitchenHash(bytes), wav: __kitchenBase64(bytes) }; }, presets[i]);
    compareAudio('grain', result, saved.presetAudio[i], 'SIZZLE preset ' + presets[i].name + ' old audio');
  }
  await restore(page, 'GrainApp', saved.project);
  compareAudio('grain', await audio(page, 'GrainApp', { scope: 'hit', tailSeconds: .1 }), saved.hitAudio, 'Original selected SIZZLE hit');
  await page.locator('#noise-bench > summary').click();
  const original = await page.evaluate(() => GrainApp.getState());
  const originalAudio = await audio(page, 'GrainApp', { scope: 'hit', tailSeconds: .1 });
  const recipes = await page.locator('#noise-recipe-select option').evaluateAll(options => options.filter(o => o.value).map(o => ({ value: o.value, name: o.textContent })));
  assert(recipes.length >= 12, 'SIZZLE additive specialist noise recipes');
  await page.locator('#noise-recipe-select').selectOption(recipes[0].value);
  await page.locator('#apply-noise-recipe').click();
  const edited = await page.evaluate(() => GrainApp.getState());
  const stripped = state => { const s = structuredClone(state); delete s.tracks[0].synth.noise; delete s.tracks[0].noise; return s; };
  assert.deepEqual(stripped(edited), stripped(original), 'Noise recipe must preserve body, pattern, mix and LFO');
  assert(nativeDifference(await audio(page, 'GrainApp', { scope: 'hit', tailSeconds: .1 }), originalAudio, false).rms > .0001, 'Noise recipe changes actual rendered PCM');
  await page.keyboard.press('Control+z');
  assert.deepEqual(await page.evaluate(() => GrainApp.getState()), original, 'Noise recipe Undo restores exact musical state');
  const allHashes = new Set();
  for (const recipe of recipes) {
    await page.locator('#noise-recipe-select').selectOption(recipe.value); await page.locator('#apply-noise-recipe').click();
    const now = await page.evaluate(() => GrainApp.getState()); assert.deepEqual(stripped(now), stripped(original), recipe.name + ' preserves unrelated controls');
    const output = await audio(page, 'GrainApp', { scope: 'hit', tailSeconds: .1 }); assert(output.bytes > 1000); allHashes.add(output.hash);
  }
  assert(allHashes.size >= 12, 'Specialist recipes must have distinct actual sound');
  const newProject = await page.evaluate(() => GrainApp.getProject()), newAudio = await audio(page, 'GrainApp');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#save-button').click();
  const download = await downloadPromise, downloaded = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.deepEqual(downloaded, newProject, 'SIZZLE actual Save project download retains new noise recipe');
  await restore(page, 'GrainApp', saved.project); await restore(page, 'GrainApp', newProject);
  compareAudio('grain', await audio(page, 'GrainApp'), newAudio, 'Noise recipes survive portable project save/reload and WAV export');
  const benchBefore = await page.evaluate(() => GrainApp.getState()), benchAudio = await audio(page, 'GrainApp', { scope: 'hit', tailSeconds: .1 });
  const cutoff = page.locator('#noise-bench-knobs [role="slider"][data-param="bench-cutoff"]');
  await cutoff.focus(); await cutoff.press('Home'); await cutoff.press('Tab');
  const benchAfter = await page.evaluate(() => GrainApp.getState()); assert.deepEqual(stripped(benchAfter), stripped(benchBefore));
  assert.notEqual(benchAfter.tracks[0].synth.noise.cutoff, benchBefore.tracks[0].synth.noise.cutoff, 'Bench knob edits existing saved cutoff');
  assert(nativeDifference(await audio(page, 'GrainApp', { scope: 'hit', tailSeconds: .1 }), benchAudio, false).rms > .0001, 'Bench knob reaches actual noise DSP');
  const kits = await page.evaluate(() => NOISE_PRESETS.length); assert.equal(kits, 10, 'Four additional kits retain all six original presets');
  const kitHashes = [];
  for (let i = 6; i < 10; i++) {
    await page.locator('#preset-select').selectOption(String(i)); const output = await audio(page, 'GrainApp');
    assert(output.offline.some(render => render.metrics.some(metric => metric.rms > .0005)), 'New specialist kit must produce audible finite audio'); kitHashes.push(output.hash);
  }
  assert.equal(new Set(kitHashes).size, 4, 'Four additional complete noise kits sound distinct');
  pass('SIZZLE six original kits preserved, specialist noise recipes audible/distinct, non-destructive, undoable and portable');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    if (capture) {
      const baseline = {};
      for (const config of apps) { baseline[config[0]] = await baselineApp(browser, config); fs.writeFileSync(BASELINE, JSON.stringify(baseline)); }
    } else if (refreshNativeReference) {
      assert(process.env.KITCHEN_BASELINE_COMMIT, 'Native precision references must come from the preserved git checkpoint');
      const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
      for (const config of apps.filter(([id]) => ['grain', 'tine', 'fable', 'batter'].includes(id))) {
        const old = await baselineApp(browser, config); assert.deepEqual(old.state, baseline[config[0]].state, 'Original checkpoint default state remains exact');
        old.initialRendered = baseline[config[0]].rendered; baseline[config[0]] = old; fs.writeFileSync(BASELINE, JSON.stringify(baseline));
      }
    } else {
      const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
      for (const config of process.env.KITCHEN_MODE === 'host' ? [] : apps) {
        try { await checkApp(browser, config, baseline[config[0]]); }
        catch (error) {
          const summary = (config[0] + ': ' + error.stack).slice(0, 1600); report.errors.push(summary);
          console.error('FAIL ' + summary);
        }
      }
      if (process.env.GALLEY_FILE) {
        await checkGalley(browser, baseline);
      }
      if (report.errors.length) throw Error(`${report.errors.length} instrument checks failed; see report.json for concise evidence.`);
    }
  } catch (error) { report.errors.push(error.stack); throw error; }
  finally { fs.writeFileSync(path.join(REPORT, capture ? 'baseline-report.json' : 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(`Kitchen interface checks: ${report.checks.length} meaningful groups passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
