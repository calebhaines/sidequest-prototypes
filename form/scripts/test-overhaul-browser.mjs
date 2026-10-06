/** HOTPLATE 3: integration tests using real Web Audio source buffers and WAVs.
 * Build/package first. FORM_URL may select the Vite preview or published app;
 * otherwise the exact standalone HTML is served with every other request blocked.
 * OVERHAUL_MODE=audio|transport|saved|legacy|ui|fill|wav|responsive|compat|host|all selects focused checks.
 * Optional GALLEY_FILE supplies the final self-contained GALLEY host candidate.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDsp } from './dsp-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.env.OVERHAUL_MODE || 'all';
const runMode = name => mode === 'all' || mode.split(',').includes(name);
const reports = process.env.OVERHAUL_REPORT_DIR || '/tmp/hotplate-3-qa';
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const loaded = await loadDsp(['audio', 'sequencing', 'grooves', 'burner-controls']);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
await fs.mkdir(reports, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true, hasTouch: true });
await context.addInitScript(() => {
  window.__hotplateQA = { sources: [], connections: new WeakMap() };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    const routes = window.__hotplateQA.connections.get(this) || [];
    routes.push(destination);
    window.__hotplateQA.connections.set(this, routes);
    return connect.call(this, destination, ...rest);
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.buffer) {
      const pcm = this.buffer.getChannelData(0).slice();
      const bytes = new Uint8Array(pcm.buffer);
      let hash = 2166136261, energy = 0, peak = 0;
      for (const value of bytes) hash = Math.imul(hash ^ value, 16777619);
      for (const value of pcm) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
      const gain = (window.__hotplateQA.connections.get(this) || []).find(node => node instanceof GainNode);
      const record = { hash: hash >>> 0, pcm, rms: Math.sqrt(energy / pcm.length), peak,
        when: args[0] ?? this.context.currentTime, now: this.context.currentTime,
        rate: this.playbackRate.value, duration: pcm.length / this.buffer.sampleRate / this.playbackRate.value,
        velocity: gain?.gain.value ?? null, stopped: false };
      this.__qaRecord = record;
      window.__hotplateQA.sources.push(record);
      if (window.__hotplateQA.sources.length > 256) window.__hotplateQA.sources.shift();
    }
    return start.apply(this, args);
  };
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...args) {
    if (this.__qaRecord) this.__qaRecord.stopped = true;
    return stop.apply(this, args);
  };
});
const page = await context.newPage();
const errors = [], blockedRequests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
const selectedStep = (voice, step) => page.locator(`[data-voice="${voice}"][data-step="${step}"]`);
const button = name => page.getByRole('button', { name, exact: true });
const clone = value => JSON.parse(JSON.stringify(value));
const hashPcm = pcm => { let hash = 2166136261; for (const value of new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)) hash = Math.imul(hash ^ value, 16777619); return hash >>> 0; };
const rms = pcm => Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / Math.max(1, pcm.length));
const peak = pcm => pcm.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
const difference = (a, b) => {
  let numerator = 0, denominator = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) { numerator += ((a[i] || 0) - (b[i] || 0)) ** 2; denominator += (a[i] || 0) ** 2 + (b[i] || 0) ** 2; }
  return Math.sqrt(numerator / Math.max(denominator, 1e-20));
};
async function state() { return page.evaluate(() => FormApp.getState()); }
async function load(project) {
  await page.evaluate(project => FormApp.loadState(project), project);
  await page.waitForFunction(project => {
    const current = FormApp.getState();
    return current.name === project.name && JSON.stringify(current.sounds) === JSON.stringify(project.sounds) && JSON.stringify(current.steps) === JSON.stringify(project.steps);
  }, project);
}
async function sharedAdapters() {
  if (process.env.FORM_URL && !(await page.evaluate(() => Boolean(window.MusicLabPatternSchema)))) {
    for (const filename of ['pattern-schema.js', 'pattern-drums.js']) await page.addScriptTag({ path: path.join(root, '..', 'shared', filename) });
  }
}
async function readExport(scope = 'pattern', extra = {}) {
  const serialized = await page.evaluate(async ({ scope, extra }) => {
    const result = await FormApp.exportAudio({ scope, sampleRate: 44100, ...extra });
    const { pcm, ...metadata } = result;
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
    return { ...metadata, pcmBase64: btoa(chunks.join('')) };
  }, { scope, extra });
  const bytes = Buffer.from(serialized.pcmBase64, 'base64');
  const pcm = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
  delete serialized.pcmBase64;
  return { ...serialized, pcm };
}
async function sources() { return page.evaluate(() => window.__hotplateQA.sources.map(({ pcm, ...metadata }) => metadata)); }
async function clearSources() { await page.evaluate(() => { window.__hotplateQA.sources.length = 0; }); }
async function deferPlay() {
  await page.evaluate(() => {
    const engine = FormApp.engine, preload = engine.preload.bind(engine);
    let release;
    const deferred = new Promise(resolve => { release = resolve; });
    engine.preload = async (...args) => { await deferred; return preload(...args); };
    window.__qaPendingPlay = FormApp.play();
    window.__qaReleasePlay = async () => { engine.preload = preload; release(); await window.__qaPendingPlay; };
  });
}
async function audition(voice = 0) {
  const before = (await sources()).length;
  await page.evaluate(async voice => { await FormApp.prepare(); FormApp.scheduleNativeNote(voice, FormApp.engine.audioContext.currentTime + 0.02, { velocity: 1, pitch: 0, source: 'qa-audition' }); }, voice);
  await page.waitForFunction(before => window.__hotplateQA.sources.length > before, before);
  return (await sources()).at(-1);
}
async function changeSlider(label, value) {
  const slider = page.getByRole('slider', { name: label, exact: true });
  await slider.evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function exactValue(label, value) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(`^Edit ${escaped} value`) }).click();
  const editor = page.getByRole('spinbutton', { name: new RegExp(`^${escaped} value`) });
  await editor.fill(String(value));
  await editor.press('Enter');
  await editor.waitFor({ state: 'hidden' });
}
async function undo() {
  await page.locator('.hotplate-pattern-tools').getByRole('button', { name: 'Undo', exact: true }).click();
}
async function keyboardRedo() {
  await selectedStep(0, 0).focus();
  await page.keyboard.press('Control+Shift+z');
}
function wavPCM(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE');
  let format, data;
  for (let position = 12; position + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', position, position + 4), size = buffer.readUInt32LE(position + 4);
    if (id === 'fmt ') format = { tag: buffer.readUInt16LE(position + 8), channels: buffer.readUInt16LE(position + 10), rate: buffer.readUInt32LE(position + 12), bits: buffer.readUInt16LE(position + 22) };
    if (id === 'data') data = buffer.subarray(position + 8, position + 8 + size);
    position += 8 + size + (size % 2);
  }
  assert(format && data, 'WAV needs format and PCM chunks');
  const pcm = new Float32Array(data.length / (format.bits / 8));
  for (let i = 0; i < pcm.length; i++) {
    const offset = i * format.bits / 8;
    pcm[i] = format.tag === 3 ? data.readFloatLE(offset) : format.bits === 16 ? data.readInt16LE(offset) / 32768 : format.bits === 24 ? data.readIntLE(offset, 3) / 8388608 : data.readInt32LE(offset) / 2147483648;
  }
  return { ...format, pcm };
}

try {
  if (process.env.FORM_URL) {
    await page.goto(process.env.FORM_URL, { waitUntil: 'networkidle' });
    // Vite supplies the native app only; inject the identical shared adapters
    // used by package.mjs so compatibility tests exercise production modules.
    await sharedAdapters();
  } else {
    const html = await fs.readFile(process.env.FORM_FILE || path.join(root, 'releases/FORM.html'), 'utf8');
    const url = 'http://localhost/hotplate-overhaul-check';
    await page.route('**/*', route => {
      if (route.request().url() === url) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      blockedRequests.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    await page.goto(url, { waitUntil: 'load' });
  }
  await page.waitForFunction(() => window.FormApp && window.MusicLabPatternInstrument);
  const fresh = await state();
  assert.equal(fresh.sounds.length, 8);

  if (runMode('audio')) {
    const factory = loaded.audio.FACTORY_KITS;
    assert.equal(factory.length, 4);
    const renderedKits = [];
    for (const kit of factory) {
      const project = clone(fresh); project.sounds = loaded.audio.buildFactoryKit(kit.id);
      await load(project);
      const actual = await audition(0);
      assert(actual.rms > 0.001 && actual.peak <= 1.001, `${kit.name} real source must be audible and bounded`);
      renderedKits.push(actual.hash);
    }
    assert.equal(new Set(renderedKits).size, 4, 'Four factory kicks must produce distinct PCM');
    const fingerprints = new Set();
    for (const groove of loaded.grooves.FACTORY_GROOVES) {
      const project = { ...clone(fresh), steps: clone(groove.steps), stepDetails: clone(groove.stepDetails), bpm: groove.tempo, swing: groove.swing };
      await load(project);
      const result = await readExport();
      const pcm = Float32Array.from(result.pcm);
      assert(rms(pcm) > 0.001 && peak(pcm) <= 1.001 && pcm.every(Number.isFinite));
      fingerprints.add(hashPcm(pcm));
    }
    assert.equal(fingerprints.size, 12, 'Twelve authored rhythms must render twelve genuinely different loops');
    pass('four curated kits and twelve authored rhythms produce distinct, audible, finite PCM');

    const detail = { ...clone(fresh), bpm: 240, swing: 37, steps: Array.from({ length: 8 }, () => Array(16).fill(false)) };
    for (const step of [0, 4, 7, 12]) detail.steps[0][step] = true;
    detail.stepDetails = loaded.sequencing.createStepDetails(detail.steps);
    Object.assign(detail.stepDetails[0][4], { velocity: 0.37, probability: 1, ratchet: 3, timing: -0.2, pitch: 7 });
    Object.assign(detail.stepDetails[0][7], { velocity: 1, probability: 0, ratchet: 4, timing: 0.1, pitch: 0 });
    Object.assign(detail.stepDetails[0][12], { velocity: 0.61, probability: 1, ratchet: 1, timing: 0.17, pitch: -5 });
    await load(detail); await page.evaluate(() => FormApp.prepare()); await clearSources();
    await page.evaluate(() => FormApp.play());
    await page.waitForTimeout(950);
    await page.evaluate(() => FormApp.stop());
    const played = await sources();
    const expected = Array.from({ length: 16 }, (_, step) => loaded.sequencing.eventsForStep(detail.steps, detail.stepDetails, step, 0, detail.bpm, detail.swing))
      .flatMap((events, step) => events.map(event => ({ ...event, at: step * 60 / detail.bpm / 4 + event.offset }))).sort((a, b) => a.at - b.at);
    assert.equal(expected.length, 5);
    assert(played.length >= expected.length, `Native scheduler started ${played.length} of ${expected.length} first-cycle sources`);
    const start = played[0].when;
    for (let i = 0; i < expected.length; i++) {
      assert(Math.abs(played[i].when - start - expected[i].at) < 0.004, `Step detail ${i} must reach native Web Audio time`);
      assert(Math.abs(played[i].velocity - expected[i].velocity) < 1e-6, `Step detail ${i} must reach native gain`);
      assert(Math.abs(played[i].rate - 2 ** (expected[i].pitch / 12)) < 1e-6, `Step detail ${i} must reach source playbackRate`);
      assert(played[i].rms > 0.001);
    }
    const afterStop = (await sources()).length;
    await page.waitForTimeout(180);
    assert.equal((await sources()).length, afterStop, 'Stop must prevent later scheduler source starts');
    const stoppedAt = await page.evaluate(() => FormApp.engine.audioContext.currentTime);
    assert(played.every(source => source.stopped || source.when + source.duration < stoppedAt + 0.025), 'Stop must cancel all still-active or future scheduled sources');
    const rendered = await readExport();
    const oracle = loaded.audio.renderPattern(detail.sounds.map((params, index) => ({ params, steps: detail.steps[index], muted: detail.muted[index], velocities: detail.steps[index].map((_, step) => step % 4 === 0 ? 1 : 0.86), stepDetails: detail.stepDetails[index] })), detail.bpm, { sampleRate: 44100, swing: detail.swing / 100, bars: 1, tail: false });
    const oraclePCM = new Float32Array(oracle[0].length * 2);
    for (let i = 0; i < oracle[0].length; i++) { oraclePCM[i * 2] = oracle[0][i]; oraclePCM[i * 2 + 1] = oracle[1][i]; }
    assert.equal(hashPcm(Float32Array.from(rendered.pcm)), hashPcm(oraclePCM), 'App export must use production detail-aware renderer exactly');
    const plain = clone(detail); delete plain.stepDetails;
    await load(plain);
    const before = await readExport();
    assert(difference(Float32Array.from(before.pcm), Float32Array.from(rendered.pcm)) > 0.1, 'Edited per-step values must appreciably change rendered PCM');
    pass('velocity, zero probability, ratchets, signed timing and pitch reach real live sources and exact offline rendering');

  }

  if (runMode('transport')) {
    await load(fresh);
    await page.evaluate(() => FormApp.prepare());
    await clearSources();
    await deferPlay();
    await button('Stop sequencer').click();
    await page.evaluate(() => window.__qaReleasePlay());
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => FormApp.isPlaying()), false, 'UI Stop must cancel native Play still preparing audio');
    assert.equal((await sources()).length, 0, 'Cancelled warmup must never schedule a late audible source');
    pass('UI Stop cancels a pending native Play before asynchronous preparation completes; no late audio sources start');
  }

  if (runMode('saved') || runMode('transport')) {
    const saved = { ...clone(fresh), name: 'QA saved transport reset', bpm: 240, swing: 0, steps: Array.from({ length: 8 }, () => Array(16).fill(false)) };
    saved.steps[0][0] = saved.steps[0][8] = true;
    saved.stepDetails = loaded.sequencing.createStepDetails(saved.steps);
    saved.stepDetails[0][0].velocity = 0.41; saved.stepDetails[0][8].velocity = 0.89;
    await load(saved);
    await button('Save project').click();
    await page.waitForFunction(name => JSON.parse(localStorage.getItem('form-projects') || '[]').some(entry => entry.project.name === name), saved.name);
    await button('Play sequencer').click();
    await page.waitForFunction(() => Number(document.querySelector('.sequence-step.playhead')?.dataset.step ?? -1) >= 4);
    await button('Pause sequencer').click();
    const openSaved = async () => {
      await button('Project options').click();
      await button('Open saved projects').click();
      await page.locator('.saved-project').filter({ has: page.getByRole('heading', { name: saved.name, exact: true }) }).getByRole('button', { name: 'Open', exact: true }).click();
    };
    await openSaved(); await clearSources();
    await button('Play sequencer').click();
    await page.waitForFunction(() => window.__hotplateQA.sources.length > 0);
    assert(Math.abs((await sources())[0].velocity - 0.41) < 1e-6, 'Saved project Open must reset paused playback to its first step');
    await button('Stop sequencer').click(); await clearSources();
    await deferPlay(); await openSaved();
    await page.evaluate(() => window.__qaReleasePlay());
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => FormApp.isPlaying()), false, 'Saved project Open must invalidate pending native Play');
    assert.equal((await sources()).length, 0, 'Saved project Open must prevent late warmup audio');
    pass('saved projects remain reachable; Open resets a paused cursor to step one and cancels pending native playback');
  }

  if (runMode('legacy') || runMode('audio')) {
    const legacy = clone(fresh); delete legacy.stepDetails; delete legacy.grooveId;
    const oldIds = ['sub-foundation', 'dry-snap', 'room-hands', 'closed-metal', 'low-orbit', 'wood-click', 'fm-droplet', 'sand-engine'];
    legacy.sounds = oldIds.map(id => {
      const params = loaded.audio.sanitizeParams(loaded.audio.PRESETS.find(preset => preset.id === id).params);
      return { ...params, architecture: loaded.audio.ensureArchitecture(params) };
    });
    const oldGrain = legacy.sounds[6].architecture.layers[2];
    oldGrain.engine = 'granular'; oldGrain.enabled = true; oldGrain.level = 0.12;
    oldGrain.granular.source = 'sample';
    oldGrain.granular.sample = { name: 'Saved legacy ingredient', sampleRate: 22050, data: Array.from({ length: 4410 }, (_, i) => Math.sin(i / 22050 * Math.PI * 2 * 313) * Math.exp(-i / 1800) * 0.3) };
    await load(legacy); const first = await readExport();
    await page.waitForFunction(project => JSON.parse(localStorage.getItem('form-studio-v2')).name === project.name && JSON.stringify(JSON.parse(localStorage.getItem('form-studio-v2')).sounds) === JSON.stringify(project.sounds), legacy);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.FormApp);
    await sharedAdapters();
    const restored = await state();
    assert.deepEqual(restored.sounds, legacy.sounds);
    const second = await readExport();
    assert.equal(hashPcm(Float32Array.from(first.pcm)), hashPcm(Float32Array.from(second.pcm)), 'Legacy saved params retain exact PCM');
    pass('legacy project with archived sounds and embedded grains restores parameters, asset data and exact exported PCM');
  }

  // Remaining native UI, portable-pattern and responsive checks are below;
  // each group is independently selectable to avoid repeating expensive renders.

  if (runMode('ui')) {
    await load(fresh);
    assert.equal(await page.locator('.sequence-step').count(), 128, 'One 16-step bank for each of eight burners');
    assert.equal(await page.locator('.hotplate-burner').count(), 8);
    assert.equal(await page.locator('#hotplate-deep-recipe').count(), 0, 'Deep synthesis starts collapsed');
    const order = await page.evaluate(() => ['.hotplate-recipebar', '.hotplate-sequencer', '.hotplate-pad-deck', '.burner-panel'].map(selector => document.querySelector(selector).getBoundingClientRect().top));
    assert(order.every((value, index) => index === 0 || value > order[index - 1]), 'Groove workflow must precede audition pads and sound editor');
    const baseline = await state();
    await page.getByLabel('Sound kit', { exact: true }).selectOption(loaded.audio.FACTORY_KITS[1].id);
    const newKit = await state();
    assert.notDeepEqual(newKit.sounds, baseline.sounds);
    assert.deepEqual(newKit.steps, baseline.steps);
    assert.deepEqual(newKit.stepDetails, baseline.stepDetails);
    await page.getByLabel('Rhythm recipe', { exact: true }).selectOption(loaded.grooves.FACTORY_GROOVES[2].id);
    const newGroove = await state();
    assert.deepEqual(newGroove.sounds, newKit.sounds);
    assert.deepEqual(newGroove.steps, loaded.grooves.FACTORY_GROOVES[2].steps);
    assert.equal(newGroove.bpm, loaded.grooves.FACTORY_GROOVES[2].tempo);
    await undo(); assert.deepEqual((await state()).steps, newKit.steps);
    await undo(); assert.deepEqual((await state()).sounds, baseline.sounds);
    assert.equal(await page.getByLabel('Sound kit', { exact: true }).inputValue(), loaded.audio.FACTORY_KITS[0].id, 'Kit label must follow actual restored sounds');
    pass('groove-first layout, independent kit/rhythm recipes, and Undo preserve the other half of the project');

    await load(fresh);
    await page.getByLabel('Use recipe tempo and swing').uncheck();
    const tempo = (await state()).bpm, swing = (await state()).swing;
    await page.getByLabel('Rhythm recipe', { exact: true }).selectOption(loaded.grooves.FACTORY_GROOVES[3].id);
    assert.equal((await state()).bpm, tempo); assert.equal((await state()).swing, swing);
    await page.getByLabel('Use recipe tempo and swing').check();
    await page.getByRole('button', { name: /^Bar B / }).click();
    assert.equal(await selectedStep(0, 16).count(), 1);
    assert.equal(await selectedStep(0, 0).count(), 0);
    const beforeB = await state();
    await selectedStep(0, 17).click();
    assert.equal((await state()).steps[0][17], !beforeB.steps[0][17]);
    await undo(); assert.deepEqual((await state()).steps, beforeB.steps);
    await button('A → B').click();
    const duplicated = await state();
    assert.deepEqual(duplicated.steps.map(row => row.slice(16)), duplicated.steps.map(row => row.slice(0, 16)));
    assert.deepEqual(duplicated.stepDetails.map(row => row.slice(16)), duplicated.stepDetails.map(row => row.slice(0, 16)));
    await undo(); assert.deepEqual((await state()).steps, beforeB.steps);
    await button('16 steps').click();
    assert.equal((await state()).steps[0].length, 16);
    assert(await page.getByRole('button', { name: /^Bar B / }).isDisabled());
    await button('32 steps').click();
    assert.equal((await state()).stepDetails[0].length, 32);
    await page.getByRole('button', { name: /^Bar A / }).click();
    pass('A/B always expose sixteen columns; lengths and A → B duplicate notes together with their details');

    const beforeDetails = await state();
    await button('Edit step details').click();
    await selectedStep(0, 3).click();
    assert.equal((await state()).steps[0][3], beforeDetails.steps[0][3], 'Details mode selects without toggling');
    assert(await page.locator('.hp-step-inspector').isVisible());
    await exactValue('Step velocity', 42);
    await exactValue('Step probability', 0);
    await exactValue('Step repeats', 4);
    await exactValue('Step timing', -21);
    await exactValue('Step pitch', 12);
    const changedDetail = (await state()).stepDetails[0][3];
    assert.deepEqual(changedDetail, { velocity: 0.42, probability: 0, ratchet: 4, timing: -0.21, pitch: 12 });
    await undo(); assert.equal((await state()).stepDetails[0][3].pitch, beforeDetails.stepDetails[0][3].pitch);
    await keyboardRedo(); assert.equal((await state()).stepDetails[0][3].pitch, 12);
    if (!(await state()).steps[0][3]) await button('Enable step').click();
    assert((await state()).steps[0][3]);
    await button('Close details').click();
    await button('Details mode').click();
    const keyboardBefore = (await state()).steps[0][2];
    await selectedStep(0, 2).focus(); await page.keyboard.press('Space');
    assert.equal((await state()).steps[0][2], !keyboardBefore);
    assert.equal(await page.evaluate(() => FormApp.isPlaying()), false, 'Native step Space must not toggle transport');
    await button('Clear pattern').click();
    assert((await state()).steps.every(row => row.every(value => !value)));
    await undo(); assert((await state()).steps.some(row => row.some(Boolean)));
    await button('Clear burner').click();
    assert((await state()).steps[0].every(value => !value));
    await undo();
    pass('touch-friendly Details mode, exact step edits, native keyboard activation, clear and Undo/Redo retain full detail state');

    const laneBefore = await state();
    await page.locator('.hp-density-tool summary').click();
    await changeSlider('Density hits', 5); await changeSlider('Density rotation', 3);
    await button('Apply density to bar A').click();
    const density = await state();
    assert.equal(density.steps[0].slice(0, 16).filter(Boolean).length, 5);
    assert.deepEqual(density.steps.slice(1), laneBefore.steps.slice(1));
    await button('Shift selected burner right').click();
    const shifted = await state();
    assert.deepEqual(shifted.steps[0], density.steps[0].map((_, index, row) => row[(index - 1 + row.length) % row.length]));
    assert.deepEqual(shifted.stepDetails[0], density.stepDetails[0].map((_, index, row) => row[(index - 1 + row.length) % row.length]));
    await undo();
    await button('Vary rhythm').click(); const variation = await state();
    assert.notDeepEqual(variation.steps[0], density.steps[0]);
    assert.deepEqual(variation.steps.slice(1), density.steps.slice(1));
    await undo(); await button('Vary rhythm').click();
    assert.deepEqual((await state()).steps, variation.steps, 'Variation must repeat deterministically from the same saved rhythm');
    await page.locator('.hp-density-tool summary').click();
    pass('selected-burner density, rotation, shifts and reproducible variation preserve other lanes and move details with notes');

    const macroKit = clone(fresh); macroKit.sounds = loaded.audio.buildFactoryKit(loaded.audio.FACTORY_KITS[0].id);
    for (const [label, value] of [['Pitch', 160], ['Length', 700], ['Body', 18], ['Snap', 90], ['Air', 80], ['Heat', 87]]) {
      await load(macroKit);
      const before = await audition(0);
      await exactValue(label, value);
      const edited = await state();
      const afterCount = (await sources()).length;
      await button('Audition sound').click();
      await page.waitForFunction(count => window.__hotplateQA.sources.length > count, afterCount);
      const after = (await sources()).at(-1);
      assert.notEqual(after.hash, before.hash, `${label} must change actual audition PCM`);
      assert.notDeepEqual(edited.sounds[0], macroKit.sounds[0]);
      const sampleRate = await page.evaluate(() => FormApp.engine.audioContext.sampleRate);
      assert.equal(after.hash, hashPcm(loaded.audio.renderSound(edited.sounds[0], sampleRate)), `${label} UI must audition the actual saved parameters`);
    }
    pass('all six focused burner controls change the actual saved synthesis and real audition PCM');

  }

  if (runMode('fill') || runMode('ui')) {
    const fillProject = { ...clone(fresh), bpm: 240, swing: 0, steps: Array.from({ length: 8 }, () => Array(16).fill(false)) };
    fillProject.steps[0][0] = fillProject.steps[0][12] = true;
    fillProject.stepDetails = loaded.sequencing.createStepDetails(fillProject.steps);
    await load(fillProject); await page.evaluate(() => FormApp.prepare()); await clearSources();
    const fillBefore = await state();
    await button('Hold fill').focus(); await page.keyboard.down('Space');
    assert.equal(await button('Hold fill').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => FormApp.play());
    await page.waitForFunction(() => window.__hotplateQA.sources.length >= 3, null, { timeout: 5000 });
    await page.keyboard.up('Space');
    assert.equal(await button('Hold fill').getAttribute('aria-pressed'), 'false');
    const fillSources = await sources();
    assert(fillSources.length >= 3, 'Held fill must add a second real source to the active late-bar hit');
    assert(Math.abs(fillSources[1].when - fillSources[0].when - 0.75) < 0.004, 'Late fill must retain its exact nominal step onset');
    assert(Math.abs(fillSources[2].when - fillSources[0].when - 0.78125) < 0.004, 'Held fill must produce its exact second repeat before the next step');
    assert.deepEqual(await state(), fillBefore, 'Fill must not persist sequence edits');
    await button('Restart sequencer from beginning').click();
    await page.waitForTimeout(90);
    assert((await sources()).length > fillSources.length);
    assert.equal(await page.evaluate(() => FormApp.isPlaying()), true);
    await button('Stop sequencer').click();
    assert.equal(await page.evaluate(() => FormApp.isPlaying()), false);
    await button('Hold fill').focus(); await page.keyboard.down('Enter');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await button('Hold fill').getAttribute('aria-pressed'), 'false');
    await page.keyboard.up('Enter');
    pass('Hold fill generates real repeat hits, releases on keys and window blur, never persists, and restart/stop control playback');

  }

  if (runMode('wav') || runMode('ui')) {
    const wavProject = { ...clone(fresh), bpm: 240, swing: 0, steps: Array.from({ length: 8 }, () => Array(16).fill(false)) };
    wavProject.steps[0][0] = wavProject.steps[0][12] = true;
    wavProject.stepDetails = loaded.sequencing.createStepDetails(wavProject.steps);
    Object.assign(wavProject.stepDetails[0][12], { velocity: 0.39, probability: 1, ratchet: 3, timing: -0.19, pitch: 7 });
    await load(wavProject);
    const expectedWav = await readExport('pattern', { tail: true });
    await button('Export groove →').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '32-bit', exact: true }).click();
    const normalize = dialog.getByLabel('Normalize volume');
    if (await normalize.isChecked()) { await normalize.focus(); await normalize.press('Space'); }
    assert.equal(await normalize.isChecked(), false);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download WAV', exact: true }).click();
    const download = await downloadPromise;
    const wav = wavPCM(await fs.readFile(await download.path()));
    assert.equal(wav.channels, 2); assert.equal(wav.rate, 44100); assert.equal(wav.bits, 32);
    const expectedPCM = Float32Array.from(expectedWav.pcm);
    assert.equal(wav.pcm.length, expectedPCM.length);
    assert(difference(wav.pcm, expectedPCM) < 1e-6, 'Downloaded WAV must preserve detail-aware render PCM');
    pass('downloaded stereo WAV contains the same detail-aware PCM as the real pattern renderer');
  }

  if (runMode('responsive')) {
    await load(fresh);
    await page.locator('.toast').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(140);
      const geometry = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth,
        sequencer: document.querySelector('.hotplate-sequencer').getBoundingClientRect().toJSON(),
        pads: Array.from(document.querySelectorAll('.hotplate-burner')).map(node => node.getBoundingClientRect().toJSON()),
        grid: document.querySelector('.sequence-scroll').getBoundingClientRect().toJSON(),
        steps: document.querySelectorAll('.sequence-step').length,
        deep: Boolean(document.querySelector('#hotplate-deep-recipe')) }));
      assert.equal(geometry.document, width, `Document overflow at ${width}px`);
      assert.equal(geometry.steps, 128);
      assert(geometry.grid.left >= 0 && geometry.grid.right <= width + 0.5, `Sequence scroll region must stay within ${width}px`);
      assert(geometry.pads.every(pad => pad.left >= 0 && pad.right <= width + 0.5 && pad.height >= 44));
      await page.screenshot({ path: path.join(reports, `hotplate-${width}.png`), fullPage: true });
      await fs.writeFile(path.join(reports, `layout-${width}.json`), JSON.stringify(geometry, null, 2));
      if (width === 390) {
        await button('Edit step details').click();
        const step = selectedStep(0, 2);
        await step.scrollIntoViewIfNeeded();
        const bounds = await step.boundingBox();
        const before = (await state()).steps[0][2];
        await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        assert.equal((await state()).steps[0][2], before);
        assert(await page.locator('.hp-step-inspector').isVisible());
        await button('Close details').click(); await button('Details mode').click();
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await page.setViewportSize({ width: 1440, height: 1080 });
    pass('320/390/768/1440 layouts retain all eight burners and the sixteen-column grid without document overflow; touch details work');
  }

  if (runMode('compat')) {
    await load(fresh);
    const beforeImport = await state();
    const invalid = await page.evaluate(() => {
      const before = JSON.stringify(FormApp.getState());
      const inputs = [];
      for (const mutate of [p => { p.stepDetails[0].pop(); }, p => { p.stepDetails[0][0].velocity = NaN; }, p => { p.stepDetails[0][0].ratchet = 8; }, p => { p.stepDetails[0][0].pitch = Infinity; }, p => { p.stepDetails[0][0].pitch = 1.5; }]) {
        const project = FormApp.getState(); mutate(project);
        try { FormApp.loadState(project); inputs.push(false); } catch { inputs.push(true); }
        if (JSON.stringify(FormApp.getState()) !== before) throw Error('Malformed step details mutated current project');
      }
      return inputs;
    });
    assert(invalid.every(Boolean));
    const transfer = await page.evaluate(async () => {
      const pcm = new Float32Array(24000);
      for (let i = 0; i < pcm.length / 2; i++) pcm[i * 2] = pcm[i * 2 + 1] = Math.sin(i / 48000 * Math.PI * 2 * 267) * 0.18;
      return FormApp.importAudio({ pcm, sampleRate: 48000, name: 'QA imported texture', options: { target: '6:c', replace: true } });
    });
    const embedded = await state();
    assert.equal(transfer.target, '6:c');
    assert.deepEqual(embedded.steps, beforeImport.steps);
    assert.deepEqual(embedded.stepDetails, beforeImport.stepDetails);
    assert.equal(embedded.sounds[6].architecture.layers[2].granular.sample.name, 'QA imported texture');
    const voiceExport = await readExport('voice', { voice: 6 });
    assert(rms(Float32Array.from(voiceExport.pcm)) > 0.001);
    await page.evaluate(project => FormApp.loadState(JSON.parse(JSON.stringify(project))), embedded);
    assert.deepEqual((await state()).sounds[6], embedded.sounds[6]);
    const restoredExport = await readExport('voice', { voice: 6 });
    assert.equal(hashPcm(Float32Array.from(voiceExport.pcm)), hashPcm(Float32Array.from(restoredExport.pcm)));
    pass('shared PCM imports into the selected granular layer, preserves all steps/details, and survives portable project restoration');

    const packet = {
      format: 'musiclab-pattern', version: 1, name: 'Exact QA received part', sourceApp: 'batter', kind: 'drums', tempo: 129, swing: 0,
      lengthBeats: 4, meter: [4, 4], seed: 8724,
      voices: [{ id: 'source-kick', name: 'Received kick', pitch: 36 }],
      notes: [
        { id: 'received-0', voice: 'source-kick', pitch: 43, beat: 0.132, duration: 0.17, velocity: 0.43, probability: 1 },
        { id: 'received-1', voice: 'source-kick', pitch: 31, beat: 2.71, duration: 0.11, velocity: 0.81, probability: 1 },
      ],
    };
    await page.evaluate(async packet => MusicLabPatternInstrument.importPattern({ pattern: packet, options: { voiceMap: { 'source-kick': 'voice-0' }, replace: true } }), packet);
    const overlay = await state();
    assert(overlay.musicLabPattern);
    const overlayAudio = await readExport();
    const exactChannels = loaded.audio.renderExactPatternEvents(overlay.sounds, packet.notes.map(note => ({ voice: 0, at: note.beat * 60 / overlay.bpm, velocity: note.velocity, pitch: note.pitch - 36 })), { durationSeconds: 4 * 60 / overlay.bpm, sampleRate: 44100, master: 1 });
    const exactPCM = new Float32Array(exactChannels[0].length * 2);
    for (let i = 0; i < exactChannels[0].length; i++) { exactPCM[i * 2] = exactChannels[0][i]; exactPCM[i * 2 + 1] = exactChannels[1][i]; }
    assert.equal(hashPcm(Float32Array.from(overlayAudio.pcm)), hashPcm(exactPCM), 'Native audio export must render exact received notes instead of the underlying grid');
    const exportedPacket = await page.evaluate(() => MusicLabPatternInstrument.exportPattern());
    assert.deepEqual(exportedPacket.notes.map(note => [note.beat, note.pitch, note.velocity]), packet.notes.map(note => [note.beat, note.pitch, note.velocity]));
    const exact = await page.evaluate(async packet => {
      const value = await MusicLabPatternInstrument.renderPattern({ pattern: packet, voiceMap: { 'source-kick': 'voice-0' }, tempo: 129, tailSeconds: 0.15 });
      return { pcm: Array.from(value.pcm), frames: value.pcm.length / 2, sampleRate: value.sampleRate };
    }, packet);
    assert(rms(Float32Array.from(exact.pcm)) > 0.001);
    assert.equal(exact.frames, Math.ceil((4 * 60 / 129 + 0.15) * exact.sampleRate));
    await page.evaluate(() => MusicLabPatternInstrument.prepare());
    await clearSources();
    await page.evaluate(() => {
      const when = FormApp.engine.audioContext.currentTime + 0.09;
      MusicLabPatternInstrument.scheduleNote({ id: 'host-qa', voice: 'voice-0', pitch: 43, velocity: 0.43, when, durationSeconds: 0.25, source: 'loom' });
    });
    const native = (await sources()).at(-1);
    assert(Math.abs(native.rate - 2 ** (7 / 12)) < 1e-6);
    assert(Math.abs(native.velocity - 0.43) < 1e-6);
    await page.evaluate(() => MusicLabPatternInstrument.cancelNotes({ source: 'loom' }));
    assert((await sources()).at(-1).stopped, 'Host cancellation must stop the real native source');
    await button(`Mute ${overlay.sounds[0].name}`).click();
    assert.deepEqual((await state()).musicLabPattern, overlay.musicLabPattern, 'Muting a voice must preserve received notes');
    await button(`Unmute ${overlay.sounds[0].name}`).click();
    await exactValue('Pitch', 136);
    assert.deepEqual((await state()).musicLabPattern, overlay.musicLabPattern, 'Changing a sound must preserve received notes');
    await button('Use native grid').click();
    assert.equal((await state()).musicLabPattern, undefined);
    await undo();
    assert.deepEqual((await state()).musicLabPattern, overlay.musicLabPattern, 'Use native grid must retain the immutable overlay in Undo');
    await selectedStep(0, 3).click();
    assert.equal((await state()).musicLabPattern, undefined, 'Native grid editing explicitly converts to native pattern');
    await undo(); assert.deepEqual((await state()).musicLabPattern, overlay.musicLabPattern);
    const tailProject = { ...clone(fresh), bpm: 120 };
    await load(tailProject);
    const downpitched = { format: 'musiclab-pattern', version: 1, name: 'Low late kick', sourceApp: 'batter', kind: 'drums', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], seed: 1,
      voices: [{ id: 'source', name: 'Down-pitched kick', pitch: 36 }],
      notes: [{ id: 'low-late', voice: 'source', beat: 3.75, duration: 0.125, pitch: 12, velocity: 1, probability: 1 }] };
    await page.evaluate(async pattern => MusicLabPatternInstrument.importPattern({ pattern, options: { voiceMap: { source: 'voice-0' }, replace: true } }), downpitched);
    const sourceFrames = loaded.audio.renderSound(tailProject.sounds[0], 44100).length;
    const naturalEnd = Math.round(1.875 * 44100) + Math.ceil(sourceFrames / 0.25);
    const fullTail = await readExport('pattern', { tail: true });
    assert.equal(fullTail.pcm.length / 2, naturalEnd, 'Automatic full-tail export must retain the entire late down-pitched drum decay');
    const explicitTail = await readExport('pattern', { tailSeconds: 0.25 });
    assert.equal(explicitTail.pcm.length / 2, 99225, 'Requested tail remains exactly a quarter second');
    assert(rms(fullTail.pcm.subarray(explicitTail.pcm.length)) > 0.0001, 'The preserved pitched decay beyond an explicit short tail must contain real audio');
    pass('portable patterns retain exact timing/pitch/velocity; host notes use the real native source and support scoped cancellation');
    await load(fresh);
  }

  if (runMode('host') && process.env.GALLEY_FILE) {
    const galley = await context.newPage();
    const hostErrors = [];
    galley.on('pageerror', error => hostErrors.push(error.message));
    const html = await fs.readFile(process.env.GALLEY_FILE, 'utf8');
    const url = 'http://localhost/music/loom/host-overhaul-check';
    await galley.route('**/*', route => route.request().url() === url
      ? route.fulfill({ status: 200, contentType: 'text/html', body: html })
      : route.abort('blockedbyclient'));
    await galley.goto(url, { waitUntil: 'load' });
    await galley.waitForFunction(() => window.LoomApp);
    const hostResult = await galley.evaluate(async () => {
      const app = LoomApp;
      await app.engine.init();
      await app.engine.context.resume();
      const trackId = app.getState().tracks[0].id;
      const iframe = document.createElement('iframe'); iframe.id = 'hotplate-overhaul-host'; document.body.append(iframe);
      const loaded = await app.host.load(trackId, { id: 'form' }, iframe);
      const child = iframe.contentWindow;
      if (!child.document.querySelector('.hotplate-sequencer')) throw Error('GALLEY embedded HOTPLATE is stale');
      await app.host.command(trackId, 'prepare');
      const snapshot = await app.host.snapshot(trackId);
      const packet = await app.host.exportPattern(trackId);
      const output = await app.host.renderPattern(trackId, { pattern: packet, tempo: 137, tailSeconds: 0.1 });
      let power = 0; for (const value of output.pcm) { if (!Number.isFinite(value)) throw Error('Non-finite host PCM'); power += value * value; }
      app.engine.resumeAudition(trackId);
      for (let note = 0; note < 3; note++) app.host.scheduleNote(trackId, { id: 'host-source-' + note, voice: 'voice-0', pitch: 43, velocity: 0.6, when: app.engine.context.currentTime + 0.1 + note * 0.1, durationSeconds: 0.3, source: 'loom-live' });
      let observed = 0;
      for (let trial = 0; trial < 24; trial++) { await new Promise(resolve => setTimeout(resolve, 25)); observed = Math.max(observed, app.engine.getMeters().tracks[0].peak); }
      app.host.cancelNotes(trackId, { source: 'loom-live' });
      child.FormApp.setTempo(171);
      await app.host.restore(trackId, snapshot);
      const restored = await app.host.snapshot(trackId);
      if (JSON.stringify(restored.state) !== JSON.stringify(snapshot.state)) throw Error('Host snapshot changed on restore');
      await app.host.command(trackId, 'panic');
      app.host.unload(trackId); iframe.remove();
      return { loaded, frames: output.pcm.length / 2, rms: Math.sqrt(power / output.pcm.length), observed };
    });
    assert(hostResult.loaded.ready && hostResult.loaded.capabilities.notes);
    assert(hostResult.rms > 0.001 && hostResult.observed > 0.005, 'Hosted native notes must reach actual GALLEY track audio meters');
    assert.deepEqual(hostErrors, []);
    pass('final GALLEY embeds HOTPLATE 3, restores its snapshot, renders shared notes, and routes native playback to the real mixer');
    await galley.close();
  }

  assert.deepEqual(errors, [], 'Browser must have no application errors');
  if (!process.env.FORM_URL) assert.deepEqual(blockedRequests, [], 'Standalone must not request any external resources');
  await fs.writeFile(path.join(reports, `report-${mode.replaceAll(',', '-')}.json`), JSON.stringify({ mode, checks, errors, blockedRequests, url: process.env.FORM_URL || 'exact standalone HTML' }, null, 2));
  console.log(`HOTPLATE overhaul browser checks: ${checks.length} groups passed (${mode}).`);
} catch (error) {
  await page.screenshot({ path: path.join(reports, `failure-${mode.replaceAll(',', '-')}.png`), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(reports, `failure-${mode.replaceAll(',', '-')}.json`), JSON.stringify({ mode, checks, errors, blockedRequests, sources: await sources().catch(() => []), context: await page.evaluate(() => ({ state: FormApp?.engine?.audioContext?.state, now: FormApp?.engine?.audioContext?.currentTime, playing: FormApp?.isPlaying() })).catch(() => null), error: error.stack }, null, 2));
  throw error;
} finally {
  await browser.close();
  await loaded.cleanup();
}
