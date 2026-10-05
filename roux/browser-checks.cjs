'use strict';

/* Integration checks for the built, standalone ROUX instrument. Build first.
 * PLAYWRIGHT_MODULE / CHROMIUM_PATH select a local browser installation.
 * ROUX_QA_URL may check a published build; ROUX_QA_ARTIFACTS saves screenshots.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

function inspectWav(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  let at = 12, format, data;
  while (at + 8 <= bytes.length) {
    const name = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    assert(at + 8 + size <= bytes.length, 'WAV chunks must fit the downloaded file.');
    if (name === 'fmt ') format = { type: bytes.readUInt16LE(at + 8), channels: bytes.readUInt16LE(at + 10), rate: bytes.readUInt32LE(at + 12), bits: bytes.readUInt16LE(at + 22) };
    if (name === 'data') data = bytes.subarray(at + 8, at + 8 + size);
    at += size + 8 + (size & 1);
  }
  assert(format && data, 'A WAV must include format and PCM chunks.');
  assert.equal(format.type, 1); assert.equal(format.channels, 2); assert.equal(format.bits, 16);
  assert(format.rate >= 44100 && format.rate <= 48000);
  assert.equal(data.length % 4, 0);
  let peak = 0, square = 0, tailPeak = 0;
  for (let i = 0; i < data.length; i += 2) {
    const value = data.readInt16LE(i) / 32768;
    peak = Math.max(peak, Math.abs(value)); square += value * value;
    if (i >= data.length - format.rate * 4 / 100) tailPeak = Math.max(tailPeak, Math.abs(value));
  }
  return { ...format, frames: data.length / 4, seconds: data.length / (format.rate * 4), peak, rms: Math.sqrt(square / (data.length / 2)), tailPeak };
}

const exactPattern = {
  format: 'musiclab-pattern', version: 1, name: 'Off-grid order', sourceApp: 'QA', kind: 'notes',
  tempo: 119, swing: .17, lengthBeats: 4, meter: [4, 4], seed: 8197,
  voices: [{ id: 'borrowed', name: 'Borrowed bass', pitch: 36 }],
  notes: [
    { id: 'a', pitch: 31, beat: .033, duration: .337, velocity: .61, probability: 1, voice: 'borrowed' },
    { id: 'b', pitch: 38, beat: .75, duration: .421, velocity: .93, probability: .63, voice: 'borrowed' },
    { id: 'c', pitch: 34, beat: 1.391, duration: .609, velocity: .8, probability: 1, voice: 'borrowed' },
    { id: 'd', pitch: 43, beat: 2.71, duration: 1.031, velocity: .71, probability: 1, voice: 'borrowed' },
  ], tags: ['off-grid', 'bass'],
};

async function pcmStats(page, expression, argument) {
  return page.evaluate(async ({ expression, argument }) => {
    const result = await (0, eval)(expression)(argument);
    if (result.blob) return { bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())), sourceApp: result.sourceApp, name: result.name };
    if (!result.pcm || !(result.pcm instanceof Float32Array) || result.pcm.length % 2) throw Error('Expected stereo PCM or WAV.');
    let peak = 0, square = 0, bad = 0;
    for (const value of result.pcm) { if (!Number.isFinite(value)) bad++; peak = Math.max(peak, Math.abs(value)); square += value * value; }
    return { frames: result.pcm.length / 2, seconds: result.pcm.length / (2 * result.sampleRate), rate: result.sampleRate, peak, rms: Math.sqrt(square / result.pcm.length), bad, sourceApp: result.sourceApp, name: result.name };
  }, { expression, argument });
}

function audible(result) {
  const stats = result.bytes ? inspectWav(Buffer.from(result.bytes)) : result;
  assert(stats.frames > 0 && stats.peak > .005 && stats.rms > .0001, 'A rendered bass line must contain audible audio.');
  assert(stats.peak <= 1 && !stats.bad, 'Rendered samples must remain finite and bounded.');
  return stats;
}

(async () => {
  const html = await fs.readFile(path.join(__dirname, 'index.html'));
  const server = http.createServer((_, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [], passed = [], output = {};
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(45000);
  async function check(name, run) { console.log('Checking: ' + name); const result = await run(); passed.push(name); if (result !== undefined) output[name] = result; }
  try {
    await page.goto(process.env.ROUX_QA_URL || `http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.RouxApp?.engine && window.MusicLabPatternInstrument);
    await check('Native patch and project remain portable', async () => {
      const result = await page.evaluate(() => {
        const S = window.RouxSchema, state = RouxApp.getState();
        const serialize = S.serializeProject || S.serialize;
        const saved = serialize(state), restored = S.parseProject(saved);
        return { saved, restored: serialize(restored), voices: MusicLabPatternInstrument.notes.voices };
      });
      assert.equal(result.restored, result.saved); assert(result.voices.some(voice => voice.id === 'bass'));
    });
    const nativeState = await page.evaluate(() => RouxApp.getState());
    await check('Actual ring edits support Undo and Redo', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      const notesBefore = await page.evaluate(() => RouxSchema.compileRecipe(RouxApp.getState()).notes.length);
      await page.locator('.recipe-step[data-step="1"]').click();
      await page.locator('[data-mode="rest"]').click();
      const edited = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      assert.notEqual(edited, before);
      assert(await page.evaluate(() => RouxSchema.compileRecipe(RouxApp.getState()).notes.length) < notesBefore);
      await page.locator('#undoButton').click();
      assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
      await page.locator('#redoButton').click();
      assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), edited);
      await page.evaluate(state => RouxApp.loadState(state), nativeState);
    });
    await check('Traversal and independent clocks alter concrete musical events', async () => {
      const result = await page.evaluate(() => {
        const compile = state => RouxSchema.compileRecipe(state, { cycles: 3 });
        const state = RouxApp.getState(), original = compile(state);
        const reverse = RouxSchema.copy(state); reverse.recipe.direction = 'reverse';
        const stride = RouxSchema.copy(state); stride.recipe.stride = 3;
        const flat = RouxSchema.copy(state); flat.recipe.accents.pulses = 0; flat.recipe.slides.pulses = 0;
        flat.recipe.steps.forEach(step => { step.accent = false; step.slide = false; });
        const accents = RouxSchema.copy(flat); accents.recipe.accents.pulses = accents.recipe.accents.length;
        const slides = RouxSchema.copy(flat); slides.recipe.slides.pulses = slides.recipe.slides.length;
        return { original, reverse: compile(reverse), stride: compile(stride), flat: compile(flat), accents: compile(accents), slides: compile(slides) };
      });
      assert.notDeepEqual(result.original.notes.map(n => [n.pitch, n.beat]), result.reverse.notes.map(n => [n.pitch, n.beat]));
      assert.notDeepEqual(result.original.steps.map(n => n.index), result.stride.steps.map(n => n.index));
      assert.notDeepEqual(result.flat.notes.map(n => n.velocity), result.accents.notes.map(n => n.velocity));
      assert(result.slides.notes.some(n => n.slide), 'An independent slide cycle must flag real pitched events.');
      assert(result.original.steps.some(n => n.mode === 'hold') && result.original.steps.some(n => n.mode === 'rest'));
    });
    await check('Play, Stop, Return, Panic, and manual keys operate offline', async () => {
      await context.setOffline(true);
      await page.locator('#playButton').click();
      await page.waitForFunction(() => RouxApp.engine.isPlaying);
      await page.waitForFunction(() => RouxApp.engine.getMeters().peak > .005 || RouxApp.engine.getMeters().rms > .001);
      assert.equal(await page.locator('#playButton').getAttribute('aria-pressed'), 'true');
      await page.locator('#rewindButton').click();
      assert.equal(await page.evaluate(() => RouxApp.engine.isPlaying), true);
      await page.locator('#stopButton').click();
      await page.waitForFunction(() => !RouxApp.engine.isPlaying);
      await page.locator('#panicButton').click();
      await page.waitForFunction(() => RouxApp.engine.getMeters().peak < .001 && RouxApp.engine.getMeters().rms < .001);
      await page.locator('#auditionButton').click();
      await page.waitForFunction(() => RouxApp.engine.getMeters().peak > .005 || RouxApp.engine.getMeters().rms > .001);
      await page.locator('#panicButton').click();
      await page.keyboard.press('a');
      await page.waitForFunction(() => RouxApp.engine.getMeters().peak > .005 || RouxApp.engine.getMeters().rms > .001);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !RouxApp.engine.isPlaying && RouxApp.engine.getMeters().peak < .001);
    });
    await check('Visible WAV export downloads audible stereo and preserves the patch', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportButton').click()]);
      assert.equal(await download.failure(), null); assert.match(download.suggestedFilename(), /\.wav$/i);
      const stats = audible({ bytes: Array.from(await fs.readFile(await download.path())) });
      const body = await page.evaluate(() => RouxApp.getState().exportBars * 240 / RouxApp.getState().tempo);
      assert(stats.seconds > body, 'Native WAV export must include the resonator tail.');
      await page.waitForFunction(() => !document.querySelector('#exportButton').disabled);
      assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
      assert.equal(await page.evaluate(() => RouxApp.engine.isPlaying), false);
      return stats;
    });
    await check('Project download and actual file input restore the entire recipe', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveButton').click()]);
      assert.equal(await download.failure(), null); assert.match(download.suggestedFilename(), /\.json$/i);
      const bytes = await fs.readFile(await download.path());
      assert.equal(JSON.parse(bytes.toString()).format, 'roux-project');
      await page.evaluate(() => { const changed = RouxApp.getState(); changed.name = 'The deliberately changed order'; changed.synth.cutoff = 480; RouxApp.loadState(changed); });
      assert.notEqual(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
      await page.locator('#projectFile').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes });
      await page.waitForFunction(saved => JSON.stringify(RouxApp.getState()) === saved, before);
    });
    await check('Exact borrowed notes render without editing the native patch', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      const result = await pcmStats(page, 'async pattern => MusicLabPatternInstrument.renderPattern({ pattern, voiceMap: { borrowed: "bass" }, tailSeconds: .5 })', exactPattern);
      assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
      return audible(result);
    });
    await check('Rendered bass follows transformed GALLEY clip tempos', async () => {
      const phrase = { ...exactPattern, lengthBeats: .5, notes: [{ ...exactPattern.notes[0], beat: .01, duration: .48 }] };
      const results = [];
      for (const tempo of [5, 1920]) {
        const stats = audible(await pcmStats(page, 'async ({ pattern, tempo }) => MusicLabPatternInstrument.renderPattern({ pattern, tempo, voiceMap: { borrowed: "bass" }, tailSeconds: .3 })', { pattern: phrase, tempo }));
        assert(Math.abs(stats.seconds - (phrase.lengthBeats * 60 / tempo + .3)) < 1 / stats.rate + .00001);
        results.push({ tempo, ...stats });
      }
      return results;
    });
    await check('Canceled renders abort and preserve the editor', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      const names = await page.evaluate(async pattern => {
        const controller = new AbortController(); controller.abort();
        const results = [];
        try { await MusicLabPatternInstrument.renderPattern({ pattern, voiceMap: { borrowed: 'bass' }, signal: controller.signal }); results.push('not canceled'); }
        catch (error) { results.push(error.name); }
        const live = new AbortController(); setTimeout(() => live.abort(), 0);
        try { await MusicLabPatternInstrument.renderPattern({ pattern, voiceMap: { borrowed: 'bass' }, signal: live.signal }); results.push('not canceled'); }
        catch (error) { results.push(error.name); }
        return results;
      }, exactPattern);
      assert.deepEqual(names, ['AbortError', 'AbortError']); assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
    });
    await check('Scheduled cancellation cuts only its source at the requested audio time', async () => {
      const result = await page.evaluate(async () => {
        const saved = RouxApp.getState(), dry = RouxSchema.copy(saved);
        dry.master.echo = 0; dry.synth.body = 0; dry.synth.amp.release = .008; dry.synth.lfo.depth = 0;
        RouxApp.loadState(dry); await MusicLabPatternInstrument.prepare();
        const engine = RouxApp.engine, ctx = engine.context, analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
        const silent = ctx.createGain(); silent.gain.value = 0; analyser.connect(silent); silent.connect(ctx.destination); engine.node.connect(analyser);
        const at = ctx.currentTime + .03, samples = new Float32Array(analyser.fftSize);
        const rmsAt = async offset => {
          while (ctx.currentTime < at + offset) await new Promise(resolve => setTimeout(resolve, 5));
          analyser.getFloatTimeDomainData(samples); let sum = 0; for (const x of samples) sum += x * x;
          return Math.sqrt(sum / samples.length);
        };
        try {
          MusicLabPatternInstrument.scheduleNote({ id: 'a-before', pitch: 36, velocity: .8, voice: 'bass', when: at + .05, durationSeconds: .7, source: 'qa-a' });
          MusicLabPatternInstrument.scheduleNote({ id: 'a-after', pitch: 43, velocity: .8, voice: 'bass', when: at + .4, durationSeconds: .3, source: 'qa-a' });
          MusicLabPatternInstrument.scheduleNote({ id: 'b-after', pitch: 31, velocity: .8, voice: 'bass', when: at + .5, durationSeconds: .5, source: 'qa-b' });
          MusicLabPatternInstrument.cancelNotes({ source: 'qa-a', when: at + .22 });
          const early = await rmsAt(.15), cut = await rmsAt(.44), otherSource = await rmsAt(.62);
          MusicLabPatternInstrument.cancelNotes({ source: 'qa-b' });
          const released = await rmsAt(.76);
          MusicLabPatternInstrument.scheduleNote({ id: 'a-resumed', pitch: 38, velocity: .8, voice: 'bass', when: ctx.currentTime + .02, durationSeconds: .3, source: 'qa-a' });
          MusicLabPatternInstrument.cancelNotes({ source: 'qa-a' });
          MusicLabPatternInstrument.scheduleNote({ id: 'a-new', pitch: 38, velocity: .8, voice: 'bass', when: ctx.currentTime + .02, durationSeconds: .3, source: 'qa-a' });
          const resumed = await rmsAt(.9);
          return { early, cut, otherSource, released, resumed };
        } finally { engine.node.disconnect(analyser); analyser.disconnect(); silent.disconnect(); engine.panic(); RouxApp.loadState(saved); }
      });
      assert(result.early > .005, 'A note before a future cancellation must sound.');
      assert(result.cut < .001, 'Canceled future notes must not start after the cutoff.');
      assert(result.otherSource > .005, 'Other sources must remain scheduled.');
      assert(result.released < .001, 'Immediate cancellation must release its held source.');
      assert(result.resumed > .005, 'Immediate cancellation must clear old future cutoffs so a source can resume: ' + JSON.stringify(result));
      return result;
    });
    await check('Exact note imports preserve timing, swing, and probability through projects', async () => {
      const result = await page.evaluate(async pattern => {
        await MusicLabPatternInstrument.importPattern({ pattern, options: { target: 'pattern', voiceMap: { borrowed: 'bass' }, replace: true } });
        const state = RouxApp.getState(), imported = MusicLabPatternInstrument.exportPattern();
        const serialized = RouxSchema.serialize(state); RouxApp.loadState(RouxSchema.parseProject(serialized));
        return { imported, restored: RouxApp.getState().musicLabPattern, packet: MusicLabPatternSchema.normalize(pattern) };
      }, exactPattern);
      for (const key of ['notes', 'swing', 'seed', 'lengthBeats', 'meter', 'voices']) assert.deepEqual(result.imported[key], result.packet[key]);
      assert.deepEqual(result.restored.pattern, result.packet); assert.deepEqual(result.restored.voiceMap, { borrowed: 'bass' });
      assert.equal(await page.locator('#nativeSequenceButton').isVisible(), true);
      const aligned = await page.evaluate(async () => {
        const state = RouxApp.getState();
        const shared = await MusicLabPatternInstrument.renderPattern({ pattern: state.musicLabPattern.pattern, state, tempo: state.tempo, tailSeconds: .5 });
        const native = await RouxApp.engine.renderWav(1, .5);
        const a = new Uint8Array(await shared.blob.arrayBuffer()), b = new Uint8Array(await native.arrayBuffer());
        return { same: a.length === b.length && a.every((byte, i) => byte === b[i]), bytes: a.length };
      });
      assert.equal(aligned.same, true, 'Shared pattern rendering and standalone imported performance must use the same native synthesis and timing.');
      await page.locator('#tabEnvelopes').click();
      await page.locator('#synth-cutoff').evaluate(input => { input.value = '650'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.equal(await page.evaluate(() => !!RouxApp.getState().musicLabPattern), true, 'Sound shaping must keep the exact borrowed notes.');
      assert.equal(await page.evaluate(() => RouxApp.getState().synth.cutoff), 650);
      await page.locator('.recipe-step[data-step="1"]').click();
      await page.locator('[data-mode="rest"]').click();
      assert.equal(await page.evaluate(() => !!RouxApp.getState().musicLabPattern), false, 'Native circular recipe edits must leave exact-note mode.');
      await page.locator('#undoButton').click();
      assert.equal(await page.evaluate(() => !!RouxApp.getState().musicLabPattern), true, 'Undo must restore the borrowed part and sound controls together.');
      await page.locator('#playButton').click(); await page.waitForFunction(() => RouxApp.engine.isPlaying);
      await page.waitForFunction(() => RouxApp.engine.getMeters().peak > .005 || RouxApp.engine.getMeters().rms > .001);
      await page.locator('#stopButton').click(); await page.locator('#panicButton').click();
      await page.locator('#nativeSequenceButton').click();
      assert.equal(await page.evaluate(() => !!RouxApp.getState().musicLabPattern), false);
      await page.locator('#tabFoundation').click();
    });
    await check('Unsupported notes and chords reject atomically', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      const failures = await page.evaluate(async pattern => {
        const results = [];
        for (const kind of ['pitch', 'chord', 'map']) {
          const candidate = JSON.parse(JSON.stringify(pattern));
          if (kind === 'pitch') candidate.notes[0].pitch = 0;
          if (kind === 'chord') candidate.notes[1].beat = candidate.notes[0].beat;
          try { await MusicLabPatternInstrument.importPattern({ pattern: candidate, options: { target: 'pattern', voiceMap: { borrowed: kind === 'map' ? 'missing' : 'bass' }, replace: true } }); results.push(null); }
          catch (error) { results.push(error.message); }
        }
        return results;
      }, exactPattern);
      assert(failures.every(Boolean), 'Invalid pitches, chord onsets, and unknown mappings must explain rejection.');
      assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
      return failures;
    });
    await check('Actual Samples and Patterns panels save reusable audio and notes', async () => {
      const before = await page.evaluate(() => JSON.stringify(RouxApp.getState()));
      await page.locator('[data-musiclab-exchange="roux"]').click();
      const samples = page.locator('.ml-ex-dialog');
      await samples.locator('[data-tab="send"]').click();
      await samples.locator('[name="bars"]').fill('1');
      await samples.locator('[name="tail"]').fill('.5');
      await samples.locator('[name="export-name"]').fill('QA bass delivery');
      await samples.locator('[data-action="render"]').click();
      await samples.locator('.ml-ex-rendered').waitFor({ state: 'visible' });
      await samples.locator('[data-action="save"]').click();
      await page.waitForFunction(async () => (await MusicLabExchange.list()).some(item => item.name === 'QA bass delivery'));
      const [audio] = await Promise.all([page.waitForEvent('download'), samples.locator('[data-action="wav"]').click()]);
      const stats = audible({ bytes: Array.from(await fs.readFile(await audio.path())) });
      await samples.locator('[data-action="close"]').click();
      await page.locator('[data-musiclab-patterns="roux"]').click();
      const patterns = page.locator('.ml-pat-dialog');
      await patterns.locator('[data-tab="send"]').click();
      await patterns.locator('[name="export-name"]').fill('QA bass order');
      await patterns.locator('[data-action="export"]').click();
      await patterns.locator('.ml-pat-exported').waitFor({ state: 'visible' });
      await patterns.locator('[data-action="save-exported"]').click();
      await page.waitForFunction(async () => (await MusicLabPatterns.list()).some(item => item.name === 'QA bass order'));
      const [notes] = await Promise.all([page.waitForEvent('download'), patterns.locator('[data-action="download-exported"]').click()]);
      const packet = JSON.parse(await fs.readFile(await notes.path(), 'utf8'));
      assert.equal(packet.format, 'musiclab-pattern'); assert(packet.notes.length > 0); assert.equal(packet.name, 'QA bass order');
      await patterns.locator('[data-action="close"]').click();
      assert.equal(await page.evaluate(() => JSON.stringify(RouxApp.getState())), before);
      return { sample: stats, patternNotes: packet.notes.length };
    });
    await check('Instrument fits phones, tablets, and desktop', async () => {
      await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
      const sizes = [];
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => ({ viewport: innerWidth, width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
        assert(layout.width <= layout.viewport + 1, `ROUX must fit ${width}px without horizontal scrolling (${layout.width}px).`);
        if (process.env.ROUX_QA_ARTIFACTS) { await fs.mkdir(process.env.ROUX_QA_ARTIFACTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.ROUX_QA_ARTIFACTS, `roux-${width}.png`), fullPage: true }); }
        sizes.push(layout);
      }
      return sizes;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed, ...output, pageErrors: errors }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
