/* CLATTER maintained-source regression: exact bank order and per-hit native audio. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('tine/app.html').replace('<!-- STYLES -->', '<style>' + read('tine/styles.css') + '</style>')
  .replace('<!-- SCRIPTS -->', '<script>' + ['shared/pattern-schema.js', 'tine/synth-schema.js', 'tine/presets.js', 'tine/audio-engine.js', 'tine/app.js', 'shared/pattern-drums.js'].map(read).join('\n').replace(/<\/script/gi, '<\\/script') + '</script>');
(async () => {
  const server = http.createServer((_, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const passed = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => window.TineApp);
    const schema = await page.evaluate(() => {
      const app = TineApp, original = app.getProject(), M = TineModel;
      const old = structuredClone(original); delete old.bankLocks; delete old.state.chain; old.version = 3;
      const migrated = M.upgradeProject(old);
      const invalid = [];
      for (const change of [p => p.bankLocks[0][0][0] = { cutoff: 0 }, p => p.bankLocks[0][0][0] = { unknown: .5 }, p => p.bankLocks[0][0][0] = null, p => p.bankLocks[0][0].push({}), p => p.state.chain = { enabled: true, loop: true, entries: [] }, p => p.state.chain.entries = [{ id: 'bad', bank: 8, repeats: 1 }], p => p.state.chain.entries = [{ id: 'bad', bank: 0, repeats: 0 }]]) {
        const next = structuredClone(original); change(next); invalid.push(M.validateProject(next));
      }
      const p = app.getProject(); p.state.bpm = 240; p.state.swing = .2;
      for (const bank of p.banks) for (const steps of bank) steps.fill(0);
      p.banks[0][0][0] = 1; p.banks[1][1][1] = 2; p.banks[2][2][0] = 1; p.bankLocks[0][0][0] = { cutoff: 300, pan: -.4 };
      p.state.chain = { enabled: true, loop: false, entries: [{ id: 'a', bank: 0, repeats: 2 }, { id: 'b', bank: 1, repeats: 1 }, { id: 'c', bank: 2, repeats: 1 }] }; app.loadState(p);
      const before = JSON.stringify(app.getProject()), packet = app.getSequencerPattern(), after = JSON.stringify(app.getProject());
      const removed = structuredClone(p); removed.state.chain.entries.splice(1, 1);
      const successor = M.nextSequenceFrame(removed, { chain: true, entryId: 'b', entry: 1, repeat: 1 });
      return { version: original.version, originalValid: M.validateProject(original), migratedValid: M.validateProject(migrated), migratedChain: migrated.state.chain, migratedLocks: migrated.bankLocks.flat(2).every(locks => Object.keys(locks).length === 0), invalid, packet, noMutation: before === after, successor, explicit: app.getSequencerPattern({ scope: 'pattern' }), voice: app.getSequencerPattern({ scope: 'voice', voice: 0 }), sequenceLoop: app.sequenceLoop };
    });
    assert.equal(schema.version, 4); assert(schema.originalValid && schema.migratedValid && schema.migratedLocks && schema.noMutation);
    assert.deepEqual(schema.migratedChain, { enabled: false, loop: true, entries: [] }); assert(schema.invalid.every(valid => valid === false));
    assert.equal(schema.packet.lengthBeats, 16); assert.deepEqual(schema.packet.notes.map(note => note.beat), [0, 4, 8.3, 12]);
    assert.deepEqual(schema.packet.notes.filter(note => note.locks).map(note => note.locks.cutoff), [300, 300]); assert.equal(schema.explicit.lengthBeats, 4); assert.equal(schema.voice.lengthBeats, 4); assert.equal(schema.sequenceLoop, false);
    assert.equal(schema.successor.entryId, 'c');
    passed.push('Strict v4 validation, v3 migration, pure chain compilation, repeats, swing and canonical note locks');

    // Per-hit cutoff must shape the entire resonator, not merely its noise layer.
    const audio = await page.evaluate(async () => {
      const p = TineApp.getProject(), before = JSON.stringify(p.state.tracks);
      p.state.drive = p.state.space = 0; p.state.master = .8;
      p.state.tracks[0] = TineModel.normalizeTrack(Object.assign(TineModel.defaults('beam'), { pitchHz: 1000, decay: .3, damping: .2, variation: 0, noise: 0, mallet: 1, direct: 0, level: .5, tone: .8, pitchEnv: 0 }));
      const read = async locks => {
        const result = await TineApp.engine.renderNativeEvents(p.state, [{ voice: 0, at: .02, velocity: .8, ...(locks ? { locks } : {}) }, { voice: 0, at: 1, velocity: .8 }], { durationSeconds: 1.5, tailSeconds: .5 });
        const view = new DataView(await result.blob.arrayBuffer()), samples = new Float32Array((view.byteLength - 44) / 4);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(44 + i * 4, true) / 32768;
        return samples;
      };
      const dry = await read(), locked = await read({ cutoff: 200 }), level = await read({ level: 0 }), rms = (x, a, b) => { let sum = 0; for (let i = a; i < b; i++) sum += x[i] * x[i]; return Math.sqrt(sum / (b - a)); };
      let laterDifference = 0; for (let i = 49000; i < 60000; i++) laterDifference = Math.max(laterDifference, Math.abs(dry[i] - locked[i]));
      const probe = new TineEngine(); await probe.init();
      const voice = probe.scheduleNativeNote(p.state.tracks[0], probe.context.currentTime + .1, { locks: { cutoff: 1000, resonance: 10 } });
      const filter = voice.nodes.find(node => node instanceof BiquadFilterNode && node.type === 'lowpass'), response = new Float32Array(1);
      filter.getFrequencyResponse(new Float32Array([1000]), response, new Float32Array(1)); const resonancePeak = response[0]; await probe.dispose();
      return { normalRms: rms(dry, 3000, 15000), cutoffRms: rms(locked, 3000, 15000), mutedHitRms: rms(level, 3000, 15000), laterDifference, laterRms: rms(locked, 49000, 60000), resonancePeak, unchanged: JSON.stringify(TineApp.getProject().state.tracks) === before };
    });
    assert(audio.normalRms > .001); assert(audio.cutoffRms < audio.normalRms * .15); assert.equal(audio.mutedHitRms, 0); assert(audio.laterRms > .001); assert(audio.laterDifference < .0001); assert(audio.unchanged);
    assert(Math.abs(audio.resonancePeak - 10) < .02, 'Canonical resonance Q10 produces actual linear gain10 at the cutoff');
    passed.push('Actual native WAV cutoff removes resonator highs; level lock is hit-local and following unlocked audio is unchanged');

    await page.evaluate(() => {
      const p = TineApp.getProject(); p.state.bpm = 240; p.state.swing = 0; p.state.drive = p.state.space = 0;
      for (const bank of p.banks) for (const steps of bank) steps.fill(0);
      p.banks[0][0][0] = p.banks[1][1][0] = p.banks[2][2][0] = 1; p.bankLocks[0][0][0] = { cutoff: 200 };
      p.state.tracks[2].decay = 2; p.state.chain.entries = [{ id: 'a', bank: 0, repeats: 2 }, { id: 'b', bank: 1, repeats: 1 }, { id: 'c', bank: 2, repeats: 1 }];
      TineApp.loadState(p);
    });
    await page.evaluate(async () => {
      await TineApp.engine.init(); window.sequenceVoices = [];
      const voices = TineApp.engine.environment.voices, add = voices.add;
      voices.add = function (voice) { window.sequenceVoices.push({ name: voice.track.name, time: voice.startTime, filter: voice.nodes.some(node => node instanceof BiquadFilterNode && node.type === 'lowpass') }); return add.call(this, voice); };
      await TineApp.play();
    });
    await page.waitForFunction(() => sequenceVoices.length >= 4 && !TineApp.isPlaying(), { timeout: 10000 });
    const live = await page.evaluate(() => ({ names: sequenceVoices.map(voice => voice.name), times: sequenceVoices.map(voice => voice.time), filters: sequenceVoices.map(voice => voice.filter), tracks: TineApp.getState().tracks.map(track => track.name), running: TineApp.engine.running, ringing: [...TineApp.engine.environment.voices].some(voice => !voice.stolen && !voice.disposed && voice.stopTime > TineApp.engine.context.currentTime) }));
    assert.deepEqual(live.names, [live.tracks[0], live.tracks[0], live.tracks[1], live.tracks[2]]); assert.deepEqual(live.filters, [true, true, false, false]);
    for (let i = 1; i < live.times.length; i++) assert(Math.abs(live.times[i] - live.times[i - 1] - 1) < 1e-8);
    assert.equal(live.running, false); assert(live.ringing, 'Once mode retains the last resonator’s natural ringing tail');
    passed.push('Live A×2→B→C order and exact pattern boundaries, per-hit native filter, once completion and natural tails');

    await page.evaluate(async () => { sequenceVoices.length = 0; await TineApp.play(); });
    await page.waitForFunction(() => sequenceVoices.length >= 1);
    const generation = await page.evaluate(() => TineApp.engine.generation);
    await page.locator('#chain-button').click(); await page.locator('[data-chain-index="1"] [data-chain-action="remove"]').click(); await page.locator('#close-chain').click();
    assert.equal(await page.evaluate(() => TineApp.engine.generation), generation, 'An entry edit does not restart or cancel the audio clock');
    await page.waitForFunction(() => sequenceVoices.length >= 3 && !TineApp.isPlaying());
    const edited = await page.evaluate(() => sequenceVoices.map(voice => ({ name: voice.name, time: voice.time })));
    assert.deepEqual(edited.map(voice => voice.name), [live.tracks[0], live.tracks[0], live.tracks[2]]);
    for (let i = 1; i < edited.length; i++) assert(Math.abs(edited[i].time - edited[i - 1].time - 1) < 1e-8);
    const exports = await page.evaluate(async () => {
      const inspect = async scope => { const result = await TineApp.exportAudio({ scope, bars: 1, tailSeconds: 0 }), view = new DataView(await result.blob.arrayBuffer()); return { rate: view.getUint32(24, true), frames: view.getUint32(40, true) / 4 }; };
      const before = JSON.stringify(TineApp.getProject()), chain = await inspect('chain'), sequence = await inspect('sequence'), pattern = await inspect('pattern'), hit = await inspect('hit');
      const p = TineApp.getProject(); p.state.chain.enabled = false; TineApp.loadState(p); const storedChain = await inspect('chain'), single = await inspect('hit');
      const empty = TineApp.getProject(); empty.state.chain.entries = []; TineApp.loadState(empty);
      let emptyError; try { await TineApp.exportAudio({ scope: 'chain' }); } catch (error) { emptyError = error.message; }
      const limit = TineApp.getProject(); limit.state.bpm = 40; limit.state.chain = { enabled: true, loop: true, entries: [{ id: 'long-a', bank: 0, repeats: 16 }, { id: 'long-b', bank: 1, repeats: 16 }] }; TineApp.loadState(limit);
      let lengthError; try { await TineApp.exportAudio({ scope: 'chain', tailSeconds: 0 }); } catch (error) { lengthError = error.message; }
      return { chain, sequence, pattern, hit, storedChain, single, emptyError, lengthError, original: before };
    });
    assert.equal(exports.chain.frames / exports.chain.rate, 3); assert.deepEqual(exports.sequence, exports.chain); assert.deepEqual(exports.storedChain, exports.chain);
    assert.equal(exports.pattern.frames / exports.pattern.rate, 1); assert.deepEqual(exports.hit, exports.single); assert(exports.hit.frames / exports.hit.rate < 2);
    assert.match(exports.emptyError, /Add a pattern/); assert.match(exports.lengthError, /120 seconds/);
    await page.evaluate(text => TineApp.loadState(JSON.parse(text)), exports.original);
    passed.push('Live entry deletion commits at a complete-pattern boundary without clock restart; chain WAV covers every repeat, one-shots stay single and export limits are explicit');

    // Save/copy/clear/hidden halves and an explicit inspector inheritance change.
    await page.locator('#chain-button').click(); await page.locator('#chain-clear').click(); await page.locator('#close-chain').click(); await page.locator('#undo-button').click();
    assert.equal((await page.evaluate(() => TineApp.getState())).chain.entries.length, 2);
    await page.locator('#step-edit-button').click(); await page.locator('[data-track="0"][data-step="0"]').click();
    await page.locator('#step-inherit-cutoff').check(); assert.equal(await page.locator('#step-lock-cutoff').isDisabled(), true);
    await page.locator('#step-inherit-cutoff').uncheck(); await page.locator('#step-lock-cutoff').fill('450'); await page.locator('#step-lock-cutoff').press('Tab'); await page.locator('#close-step').click();
    assert.equal(await page.evaluate(() => TineApp.getProject().bankLocks[0][0][0].cutoff), 450);
    await page.locator('#copy-pattern').click(); assert.equal(await page.evaluate(() => TineApp.getProject().bankLocks[1][0][0].cutoff), 450);
    await page.locator('#sequence-length').selectOption('32'); await page.locator('#sequence-page').selectOption('1');
    await page.locator('[data-track="0"][data-step="31"]').click(); await page.locator('#step-inherit-cutoff').uncheck(); await page.locator('#step-lock-cutoff').fill('800'); await page.locator('#step-lock-cutoff').press('Tab'); await page.locator('#step-hit').selectOption('2'); await page.locator('#close-step').click();
    await page.locator('#sequence-length').selectOption('16'); await page.locator('#clear-button').click();
    assert.equal(await page.evaluate(() => TineApp.getProject().bankLocks[0][0][31].cutoff), 800); assert.equal(await page.evaluate(() => TineApp.getState().tracks[0].steps[31]), 2);
    const saved = await page.evaluate(() => TineApp.getProject()); await page.waitForTimeout(300); await page.reload(); await page.waitForFunction(() => window.TineApp);
    assert.deepEqual(await page.evaluate(() => TineApp.getProject()), saved);
    passed.push('Inspector inheritance, copy and Undo, 32-step hidden locks, clearing active length, and local project recovery');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed, audio, live }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
