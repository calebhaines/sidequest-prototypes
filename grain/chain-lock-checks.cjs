/* Run against maintained sources, without rebuilding published HTML.
 * PLAYWRIGHT_MODULE / CHROMIUM_PATH select another installed browser. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('grain/app.html').replace('<!-- STYLES -->', '<style>' + read('grain/styles.css') + '</style>')
  .replace('<!-- SCRIPTS -->', '<script>' + ['grain/synth-params.js', 'grain/presets.js', 'grain/audio-engine.js', 'grain/voice-lab.js', 'grain/app.js', 'shared/pattern-schema.js', 'shared/pattern-drums.js'].map(read).join('\n').replace(/<\/script/g, '<\\/script') + '</script>');
const project = page => page.evaluate(() => GrainApp.getProject());
const load = (page, value) => page.evaluate(value => GrainApp.loadState(value), value);
const nativeWav = page => page.evaluate(async () => Array.from(new Uint8Array(await (await GrainApp.exportAudio({ scope: 'pattern', bars: 1, tailSeconds: .12 })).blob.arrayBuffer())));
function wavDifference(a, b, from, to) {
  a = Buffer.from(a); b = Buffer.from(b); assert.equal(a.length, b.length);
  const rate = a.readUInt32LE(24); let max = 0, sum = 0, count = 0;
  for (let offset = 44 + Math.floor(from * rate) * 4; offset < Math.min(a.length, 44 + Math.floor(to * rate) * 4); offset += 2) {
    const difference = Math.abs(a.readInt16LE(offset) - b.readInt16LE(offset)); max = Math.max(max, difference); sum += difference * difference; count++;
  }
  return { max, rms: Math.sqrt(sum / Math.max(1, count)) / 32768 };
}

(async () => {
  const server = http.createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const url = 'http://127.0.0.1:' + server.address().port;
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => window.GrainApp);
    const initial = await project(page);
    assert.equal(initial.version, 4); assert.equal(initial.chain.enabled, false);
    assert(initial.bankLocks.flat(2).every(lock => Object.keys(lock).length === 0));
    const legacy = JSON.parse(JSON.stringify(initial)); legacy.version = 3; delete legacy.chain; delete legacy.bankLocks;
    await load(page, legacy); assert.deepEqual((await project(page)).state, initial.state);
    assert.equal((await project(page)).chain.enabled, false);
    for (const change of [
      value => { value.bankLocks[0][0][0] = { cutoff: '200' }; },
      value => { value.bankLocks[0][0][0] = { cutoff: 0 }; },
      value => { value.bankLocks[0][0][0] = { unknown: 1 }; },
      value => { value.bankLocks[0][0][0] = null; },
      value => { value.bankLocks[0][0].pop(); },
      value => { value.chain = { enabled: true, loop: true, entries: [] }; },
      value => { value.chain.entries = [{ bank: 4, repeats: 1 }]; },
      value => { value.chain.entries = [{ bank: 0, repeats: 17 }]; }
    ]) {
      const invalid = JSON.parse(JSON.stringify(initial)); change(invalid);
      assert(await page.evaluate(value => { try { GrainApp.loadState(value); return false; } catch (_) { return true; } }, invalid), 'Malformed chain/lock project is rejected');
      assert.deepEqual((await project(page)).state, initial.state, 'Rejected data leaves the instrument intact');
    }
    assert(await page.evaluate(() => { try { GrainApp.getSequencerPattern({ scope: 'chain' }); return false; } catch (error) { return /add/i.test(error.message); } }), 'Empty explicit chain has an actionable error');
    console.log('PASS legacy migration and strict, non-destructive project validation.');

    const arranged = await page.evaluate(() => {
      const value = GrainApp.getProject(); value.state.bpm = 240; value.state.swing = .3; value.state.space = value.state.drive = 0; value.state.master = .5;
      value.state.tracks.forEach(track => { track.steps = Array(16).fill(0); track.mute = track.solo = false; });
      value.banks = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)));
      value.banks[0][0][0] = 1; value.banks[1][1][0] = 1; value.banks[2][2][0] = 2;
      value.bankLocks = GrainSequence.emptyLocks(value.banks); value.bankLocks[0][0][0] = { cutoff: 200 };
      value.chain = { enabled: true, loop: false, entries: [{ bank: 0, repeats: 2 }, { bank: 1, repeats: 1 }, { bank: 2, repeats: 1 }] };
      value.bank = value.selected = 0; value.state.tracks.forEach((track, index) => { track.steps = [...value.banks[0][index]]; });
      value.state.tracks[2].synth.noise.decay = 2;
      return value;
    });
    await load(page, arranged);
    const beforePacket = await project(page);
    const packet = await page.evaluate(() => GrainApp.getSequencerPattern());
    assert.equal(packet.lengthBeats, 16); assert.deepEqual(packet.notes.map(note => note.beat), [0, 4, 8, 12]);
    assert.deepEqual(packet.notes.map(note => note.voice), ['voice-0', 'voice-0', 'voice-1', 'voice-2']);
    assert.deepEqual(packet.notes[0].locks, { cutoff: 200 }); assert.equal(packet.notes[2].locks, undefined);
    assert.equal(await page.evaluate(() => GrainApp.getSequencerPattern({ scope: 'pattern' }).lengthBeats), 4);
    assert.equal(await page.evaluate(() => GrainApp.sequenceLoop), false);
    assert.deepEqual(await project(page), beforePacket, 'Portable export never edits the project');
    await page.evaluate(() => { const value = GrainApp.getProject(); value.chain.enabled = false; GrainApp.loadState(value); });
    assert.equal(await page.evaluate(() => GrainApp.getSequencerPattern().lengthBeats), 4);
    assert.equal(await page.evaluate(() => GrainApp.getSequencerPattern({ scope: 'chain' }).lengthBeats), 16, 'Explicit chain exports its complete list even when disabled');
    await load(page, arranged);
    await page.locator('#chain-button').click();
    assert.equal(await page.locator('[data-chain-index]').count(), 3);
    await page.locator('[data-chain-index="0"] [data-chain-repeats]').fill('3'); await page.locator('[data-chain-index="0"] [data-chain-repeats]').press('Tab');
    await page.locator('[data-chain-index="1"] [data-chain-action="up"]').click();
    assert.deepEqual((await project(page)).chain.entries.map(entry => entry.bank), [1, 0, 2]);
    await page.locator('[data-chain-index="1"] [data-chain-action="duplicate"]').click();
    assert.deepEqual((await project(page)).chain.entries.map(entry => entry.repeats), [1, 3, 3, 1]);
    await page.locator('[data-chain-index="2"] [data-chain-action="remove"]').click();
    await page.locator('#chain-clear').click();
    assert.equal((await project(page)).chain.enabled, false); assert.equal((await project(page)).chain.entries.length, 0);
    await page.locator('#chain-undo').click(); assert.equal((await project(page)).chain.entries.length, 3);
    await page.locator('#chain-close').click();
    console.log('PASS complete chain packets, explicit disabled-chain export, repeat/reorder/duplicate/remove/clear/Undo UI.');

    await load(page, arranged);
    await page.evaluate(async () => {
      await GrainApp.engine.init(); window.chainHits = [];
      const voices = GrainApp.engine.environment.voices, add = voices.add;
      voices.add = function (voice) { window.chainHits.push({ mode: voice.mode, time: voice.startTime }); return add.call(this, voice); };
      await GrainApp.play();
    });
    await page.waitForFunction(() => !GrainApp.isPlaying());
    const live = await page.evaluate(() => ({ hits: window.chainHits, ringing: [...GrainApp.engine.environment.voices].some(voice => voice.stopTime > GrainApp.engine.context.currentTime), running: GrainApp.engine.running }));
    assert.deepEqual(live.hits.map(hit => hit.mode), ['kick', 'kick', 'snare', 'hat']);
    live.hits.slice(1).forEach((hit, index) => assert(Math.abs(hit.time - live.hits[index].time - 1) < 1e-8, 'Whole-pattern chain boundaries keep the original audio clock'));
    assert.equal(live.running, false); assert(live.ringing, 'Once completion retains the final sound’s natural tail');
    const chainWav = await page.evaluate(async () => Array.from(new Uint8Array(await (await GrainApp.exportAudio({ scope: 'chain', tailSeconds: .2 })).blob.arrayBuffer())));
    assert(Math.abs((Buffer.from(chainWav).length - 44) / (44100 * 4) - 4.2) < 1 / 44100);
    assert.deepEqual(await project(page), arranged, 'Live playback and WAV rendering leave base voices, banks and locks untouched');

    // A manual bank/tempo change latches at the next whole pattern, while the
    // following pattern uses the new tempo. The engine generation never resets.
    await page.evaluate(value => { value.chain.enabled = false; value.state.swing = 0; GrainApp.loadState(value); }, arranged);
    await page.evaluate(async () => { window.chainHits = []; await GrainApp.play(); window.chainGeneration = GrainApp.engine.generation; });
    await page.waitForFunction(() => GrainApp.engine.currentStep >= 3 && GrainApp.engine.currentStep < 12);
    await page.locator('[data-bank="1"]').click(); await page.locator('#tempo').fill('120'); await page.locator('#tempo').press('Tab');
    await page.waitForFunction(() => window.chainHits.length >= 3);
    const changed = await page.evaluate(() => { const result = { hits: window.chainHits.slice(0, 3), sameGeneration: window.chainGeneration === GrainApp.engine.generation }; GrainApp.stop(); return result; });
    assert(changed.sameGeneration, 'Bank and tempo changes do not restart transport');
    assert.deepEqual(changed.hits.map(hit => hit.mode), ['kick', 'snare', 'snare']);
    assert(Math.abs(changed.hits[1].time - changed.hits[0].time - 1) < 1e-8);
    assert(Math.abs(changed.hits[2].time - changed.hits[1].time - 2) < 1e-8);
    console.log('PASS live repeat/order/once tails, complete chain WAV duration and boundary-latched bank/tempo changes.');

    await load(page, initial); await page.locator('#sequence-length').selectOption('32'); await page.locator('#sequence-page').selectOption('1');
    const baseVoice = (await project(page)).state.tracks[1];
    await page.locator('#step-edit-button').click(); await page.locator('[data-track="1"][data-step="31"]').click();
    await page.locator('#step-hit').selectOption('2'); await page.locator('#step-inherit-cutoff').uncheck();
    await page.locator('#step-lock-cutoff').fill('312'); await page.locator('#step-lock-cutoff').press('Tab');
    assert.equal((await project(page)).bankLocks[0][1][31].cutoff, 312);
    assert.deepEqual((await project(page)).state.tracks[1].synth, baseVoice.synth, 'Editing a step never changes the base voice');
    await page.locator('#step-close').click(); assert(await page.locator('[data-track="1"][data-step="31"]').evaluate(element => element.classList.contains('has-locks')));
    await page.locator('#copy-pattern').click(); await page.locator('[data-bank="1"]').click();
    assert.equal((await project(page)).bankLocks[1][1][31].cutoff, 312);
    await page.locator('#sequence-length').selectOption('16'); await page.locator('#clear-button').click();
    assert.equal((await project(page)).bankLocks[1][1][31].cutoff, 312, 'Clearing16 keeps hidden32-step overrides');
    await page.locator('#sequence-length').selectOption('32'); await page.locator('#clear-button').click();
    assert.deepEqual((await project(page)).bankLocks[1][1][31], {});
    await page.locator('#undo-button').click(); assert.equal((await project(page)).bankLocks[1][1][31].cutoff, 312);
    const retained = await project(page); await page.waitForTimeout(300); await page.reload(); await page.waitForFunction(() => window.GrainApp);
    assert.deepEqual(await project(page), retained, 'Browser recovery includes hidden overrides and every chain field');
    await load(page, initial); await page.locator('#sequence-length').selectOption('32'); await page.locator('#sequence-page').selectOption('1');
    await page.locator('[data-track="0"][data-step="31"]').click({ button: 'right' }); await page.locator('#step-undo').click();
    assert.equal((await project(page)).state.stepCount, 16); assert.equal(await page.locator('#step-dialog').evaluate(dialog => dialog.open), false, 'Undo closes an inspector whose newly added second half no longer exists');
    console.log('PASS focused cutoff editor, base-sound isolation, bank copy, hidden32-step locks, clear/Undo and recovery.');

    // Compare real rendered PCM: a dark first hit must sound different, and its
    // override must not affect the following unlocked bright hit.
    const soundProject = await page.evaluate(() => {
      const value = GrainApp.getProject(); value.state.stepCount = 16; value.state.bpm = 240; value.state.swing = value.state.space = value.state.drive = 0; value.state.master = .5;
      value.chain = GrainSequence.emptyChain(); value.bank = value.selected = 0;
      value.banks = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)));
      value.banks[0][0][0] = value.banks[0][0][8] = 1; value.bankLocks = GrainSequence.emptyLocks(value.banks);
      value.state.tracks.forEach((track, index) => { track.steps = [...value.banks[0][index]]; track.mute = track.solo = false; });
      const track = value.state.tracks[0]; track.mode = 'snare'; track.noise = 'white'; track.level = .35; track.pan = 0; track.synth.body.level = 0;
      Object.assign(track.synth.noise, { level: 1, cutoff: 12000, resonance: .707, filter: 'lowpass', decay: .05, attack: .001, hold: 0, drive: 0, bursts: 1, envAmount: 0 });
      return value;
    });
    await load(page, soundProject); const bright = await nativeWav(page);
    const darkProject = JSON.parse(JSON.stringify(soundProject)); darkProject.bankLocks[0][0][0] = { cutoff: 200 };
    await load(page, darkProject); const dark = await nativeWav(page);
    assert(wavDifference(bright, dark, .015, .12).rms > .003, 'Native cutoff lock has an audible effect');
    assert(wavDifference(bright, dark, .515, .64).max <= 1, 'The following unlocked hit keeps its exact bright sound');
    const sharedPCM = async locked => page.evaluate(async locked => {
      const packet = GrainApp.getSequencerPattern({ scope: 'pattern' }); if (!locked) delete packet.notes[0].locks;
      return Array.from(new Uint8Array(await (await MusicLabPatternInstrument.renderPattern({ pattern: packet, tailSeconds: .12 })).blob.arrayBuffer()));
    }, locked);
    const sharedBright = await sharedPCM(false), sharedDark = await sharedPCM(true);
    const sharedCutoffDifference = wavDifference(sharedBright, sharedDark, 0, .12);
    assert(sharedCutoffDifference.rms > .001, 'Portable/renderNativeEvents cutoff reaches the native synth: ' + JSON.stringify(sharedCutoffDifference));
    assert(wavDifference(sharedBright, sharedDark, .5, .64).max <= 1, 'Shared renders also restore the base sound for unlocked notes');
    assert.deepEqual((await project(page)).state, soundProject.state);
    const dense = await page.evaluate(async () => {
      const engine = GrainApp.engine; await engine.init();
      const when = engine.context.currentTime + .2;
      for (let index = 0; index < 40; index++) engine.scheduleNativeNote(JSON.parse(JSON.stringify(GrainApp.getState().tracks[0])), when + index * .001, { voiceKey: 'host-lane-test', source: 'host-cap-test', velocity: .6, locks: { cutoff: 1000, decay: 2 } });
      const voices = [...engine.environment.voices].filter(voice => voice.voiceKey === 'host-lane-test');
      const result = { active: voices.filter(voice => !voice.disposed && !voice.stolen).length, stolen: voices.filter(voice => voice.stolen).length };
      engine.cancelNativeNotes({ source: 'host-cap-test' }); return result;
    });
    assert.equal(dense.active, 16, 'Stable hosted lane identity retains the16-hit cap across fresh locked snapshots'); assert(dense.stolen >= 24);
    await page.evaluate(() => { const value = GrainApp.getProject(); value.chain = { enabled: true, loop: true, entries: Array.from({ length: 16 }, () => ({ bank: 0, repeats: 16 })) }; GrainApp.loadState(value); });
    assert(await page.evaluate(async () => { try { await GrainApp.exportAudio({ scope: 'chain' }); return false; } catch (error) { return /256 beats/.test(error.message); } }), 'Oversized chain exports report the actual sharing limit');
    await page.evaluate(() => { const value = GrainApp.getProject(); value.state.bpm = 40; value.chain.entries = [{ bank: 0, repeats: 16 }, { bank: 0, repeats: 16 }]; GrainApp.loadState(value); });
    assert(await page.evaluate(async () => { try { await GrainApp.exportAudio({ scope: 'chain' }); return false; } catch (error) { return /120.second/.test(error.message); } }), 'Long audio exports report their duration limit without truncation');
    console.log('PASS audible cutoff locks in native/shared WAVs, unlocked-hit restoration, base isolation, cloned hosted-hit cap and bounded exports.');

    for (const width of [320, 390]) {
      const mobile = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true });
      mobile.on('pageerror', error => errors.push(error.message)); await mobile.goto(url); await mobile.waitForFunction(() => window.GrainApp);
      await mobile.locator('#chain-button').tap(); await mobile.locator('#chain-add').tap();
      assert.equal(await mobile.locator('[data-chain-index]').count(), 1);
      let overflow = await mobile.evaluate(() => { const dialog = document.querySelector('#chain-dialog'); return dialog.scrollWidth > dialog.clientWidth + 1; });
      assert.equal(overflow, false, width + ' px chain dialog fits without horizontal scrolling');
      await mobile.locator('#chain-close').tap(); await mobile.locator('#step-edit-button').tap();
      await mobile.locator('[data-track="0"][data-step="0"]').tap();
      await mobile.locator('#step-inherit-cutoff').uncheck(); await mobile.locator('#step-lock-cutoff').fill('415'); await mobile.locator('#step-lock-cutoff').press('Tab');
      assert.equal((await project(mobile)).bankLocks[0][0][0].cutoff, 415);
      overflow = await mobile.evaluate(() => { const dialog = document.querySelector('#step-dialog'); return dialog.scrollWidth > dialog.clientWidth + 1; });
      assert.equal(overflow, false, width + ' px sound inspector fits without horizontal scrolling');
      await mobile.locator('#step-inherit-cutoff').check(); assert.deepEqual((await project(mobile)).bankLocks[0][0][0], {});
      await mobile.close();
    }
    assert.deepEqual(errors, [], 'No uncaught errors in desktop or touch workflows');
    console.log('PASS320/390px touch chain/step controls and inheritance; no browser errors.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
