/* Real SIZZLE/CLATTER/HOTPLATE/BATTER -> GALLEY host -> private native Print
 * -> GALLEY WAV checks. Build all four standalones before running. Also runs
 * inside LOOM-source.zip using its bundled instruments, without sibling apps.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const portable = fs.existsSync(path.join(__dirname, 'instruments'));
const root = portable ? __dirname : path.resolve(__dirname, '..');
const ids = ['grain', 'tine', 'form', 'batter'];
const scripts = ['shared/pattern-schema.js', 'loom/vocal-catalog.js', 'loom/utility-catalog.js', 'loom/filter-catalog.js', 'loom/creative-catalog.js', 'loom/char-catalog.js', 'loom/effects-catalog.js',
  'loom/vocal-dsp.js', 'loom/utility-dsp.js', 'loom/filter-dsp.js', 'loom/creative-dsp.js', 'loom/char-dsp.js', 'loom/effects.js', 'loom/schema.js', 'loom/track-eq-dsp.js', 'loom/audio-engine.js',
  'loom/host-bridge.js', 'loom/instrument-host.js', 'loom/note-renderer.js', 'loom/note-playback.js'].map(file => portable ? file.replace(/^loom\//, '') : file);
const embedded = Object.fromEntries(ids.map(id => [id, fs.readFileSync(path.join(root, portable ? 'instruments/' + id + '.html' : id === 'form' ? 'music/form/index.html' : id + '/index.html'), 'utf8')]));
const html = '<!doctype html><meta charset="utf-8"><body><iframe id="editor"></iframe><script>window.LoomEmbeddedInstruments=' + JSON.stringify(embedded).replace(/</g, '\\u003c') + ';</script>' +
  scripts.map(file => '<script src="/' + file + '"></script>').join('');

(async () => {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname;
    if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); return; }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end('Missing fixture'); return; }
    response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [], rows = [], requests = [];
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message)); page.on('requestfailed', request => requests.push(request.url()));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => !!window.LoomNoteRenderer && !!window.LoomAudio && !!window.LoomNotePlayback);
    for (const id of ids) {
      const result = await page.evaluate(async id => {
        const copy = value => JSON.parse(JSON.stringify(value));
        const context = new AudioContext({ sampleRate: 48000 }); await context.resume();
        const input = context.createGain(); input.gain.value = 0; input.connect(context.destination);
        const host = new LoomInstrumentHost({ context, getTrackInput: () => input, baseURL: location.origin + '/' });
        const renderer = new LoomNoteRenderer({ context, baseURL: location.origin + '/' });
        let studio;
        const metrics = (audio, start, end) => {
          const from = Math.max(0, Math.round(start * audio.sampleRate)), to = Math.min(audio.left.length, Math.round(end * audio.sampleRate));
          let peak = 0, power = 0, first = -1;
          for (let frame = from; frame < to; frame++) {
            const a = audio.left[frame], b = audio.right[frame]; if (!Number.isFinite(a) || !Number.isFinite(b)) throw Error('Non-finite ' + id + ' audio');
            const value = Math.max(Math.abs(a), Math.abs(b)); peak = Math.max(peak, value); power += (a * a + b * b) * .5;
            if (first < 0 && value > 1e-6) first = frame;
          }
          return { peak, rms: Math.sqrt(power / Math.max(1, to - from)), firstSeconds: first < 0 ? -1 : first / audio.sampleRate };
        };
        const maximumDifference = (a, b, from, to) => {
          if (a.sampleRate !== b.sampleRate || a.left.length !== b.left.length) throw Error('Inconsistent native source dimensions');
          let maximum = 0; for (let frame = Math.round(from * a.sampleRate); frame < Math.min(a.left.length, Math.round(to * a.sampleRate)); frame++) maximum = Math.max(maximum, Math.abs(a.left[frame] - b.left[frame]), Math.abs(a.right[frame] - b.right[frame])); return maximum;
        };
        try {
          await host.load('percussion-source', { id }, document.querySelector('iframe'));
          const child = document.querySelector('iframe').contentWindow, names = { grain: 'GrainApp', tine: 'TineApp', form: 'FormApp', batter: 'BatterApp' }, app = child[names[id]];
          let p, lockedVoice;
          if (id === 'grain' || id === 'tine') {
            p = app.getProject(); p.state.bpm = 240; p.state.swing = 0; p.state.drive = p.state.space = 0; p.state.master = .5; p.state.stepCount = 16;
            p.banks = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array(32).fill(0)));
            p.bankLocks = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array.from({ length: 32 }, () => ({}))));
            const voice = id === 'grain' ? 2 : 0; lockedVoice = 'voice-' + voice;
            p.banks[0][voice][4] = p.banks[1][voice][4] = 1; p.bankLocks[0][voice][4] = { cutoff: 200 };
            p.banks[3][voice][31] = 2; p.bankLocks[3][voice][31] = { cutoff: 713, pan: -.3 };
            p.bank = p.selected = 0;
            p.state.tracks.forEach((track, index) => { track.steps = [...p.banks[0][index]]; track.mute = track.solo = false; });
            if (id === 'grain') {
              const track = p.state.tracks[voice]; track.noise = 'white'; track.level = .5; track.pan = 0; track.synth.body.level = 0;
              Object.assign(track.synth.noise, { level: 1, filter: 'lowpass', cutoff: 18000, resonance: .707, attack: .001, hold: 0, decay: .04, drive: 0, envAmount: 0, bursts: 1, rate: 1 });
              p.chain = { enabled: true, loop: false, entries: [{ bank: 0, repeats: 1 }, { bank: 1, repeats: 1 }] };
            } else {
              p.state.tracks[voice] = child.TineModel.normalizeTrack(Object.assign(child.TineModel.defaults('beam'), { pitchHz: 2500, decay: .05, damping: .6, variation: 0, noise: 0, mallet: 1, direct: .2, level: .5, tone: 1, pitchEnv: 0, steps: [...p.banks[0][voice]] }));
              p.state.chain = { enabled: true, loop: false, entries: [{ id: 'a', bank: 0, repeats: 1 }, { id: 'b', bank: 1, repeats: 1 }] };
            }
          } else if (id === 'form') {
            p = app.getState(); p.bpm = 240; p.swing = 0; p.muted.fill(false); p.selectedBank = 0; lockedVoice = 'voice-0';
            const details = () => ({ velocity: .8, probability: 1, ratchet: 1, timing: 0, pitch: 0 });
            p.patternBanks = Array.from({ length: 4 }, () => ({ length: 16, steps: Array.from({ length: 8 }, () => Array(32).fill(false)), stepDetails: Array.from({ length: 8 }, () => Array.from({ length: 32 }, details)) }));
            p.patternBanks[0].steps[0][4] = p.patternBanks[1].steps[0][4] = true; p.patternBanks[0].stepDetails[0][4].locks = { cutoff: 200 };
            p.patternBanks[3].steps[0][31] = true; p.patternBanks[3].stepDetails[0][31].locks = { cutoff: 713, pan: -.3 };
            p.steps = p.patternBanks[0].steps.map(row => row.slice(0, 16)); p.stepDetails = p.patternBanks[0].stepDetails.map(row => copy(row.slice(0, 16)));
            p.sounds[0] = copy(p.sounds[2]); delete p.sounds[0].architecture; p.sounds[0].type = 'hat';
            Object.assign(p.sounds[0].noise, { level: 1, filter: 18000, decay: 40 }); Object.assign(p.sounds[0].tone, { frequency: 5000, decay: 40 });
            Object.assign(p.sounds[0].mix, { volume: .35, pan: 0 }); Object.assign(p.sounds[0].effects, { reverb: 0, delay: 0, drive: 0, bitDepth: 16, sampleRate: 44100 });
            p.chain = { enabled: true, loop: false, entries: [{ bank: 0, repeats: 1 }, { bank: 1, repeats: 1 }] };
          } else {
            const S = child.BatterSchema, rate = 48000, samples = new Float32Array(Math.round(rate * .08));
            for (let frame = 0; frame < samples.length; frame++) samples[frame] = .2 * Math.sin(2 * Math.PI * 6000 * frame / rate) + .07 * Math.sin(2 * Math.PI * 200 * frame / rate);
            p = S.defaultState(); p.tempo = 240; p.humanize = p.velocityHumanize = p.swing = 0; lockedVoice = 'kick';
            p.assets = [S.encodeAsset({ left: samples, right: samples, sampleRate: rate, channels: 1 }, { id: 'integration-ingredient', name: 'Hosted percussion fixture' })];
            for (const pattern of p.patterns) for (const lane of pattern.lanes) { lane.length = 16; lane.steps.forEach(step => { step.on = false; }); }
            for (const lane of p.lanes) { lane.room = lane.delay = 0; lane.mute = lane.solo = false; }
            Object.assign(p.lanes[0], { sampleId: 'integration-ingredient', sampleIds: ['integration-ingredient'], volume: .5, room: 0, delay: 0, choke: 0, sustain: 1, attack: .001, release: .005, gate: .12, lowpass: 20000 });
            p.patterns[0].lanes[0].steps[4] = { ...S.step(true), gate: .5, locks: { lowpass: 200 } }; p.patterns[1].lanes[0].steps[4] = { ...S.step(true), gate: .5 };
            p.patterns[7].lanes[0].steps[63].locks = { lowpass: 713, pan: -.3 };
            p.selectedPattern = 'A'; p.chainEnabled = true; p.chainLoop = false; p.chain = [{ pattern: 'A', repeats: 1 }, { pattern: 'B', repeats: 1 }]; p.master.volume = .5;
          }
          await app.loadState(copy(p)); await host.setTempo(240);
          const adapter = host.getPatternAdapter('percussion-source'); await adapter.prepare();
          const snapshot = await host.snapshot('percussion-source'), packet = await host.exportPattern('percussion-source'), sourceBefore = JSON.stringify(snapshot.state);
          // Restore the complete hosted project through the real bridge, then
          // compare every bank, hidden override and chain field, not just notes.
          await host.restore('percussion-source', snapshot);
          const restored = await host.snapshot('percussion-source'), restoredPacket = await host.exportPattern('percussion-source');
          const pure = sourceBefore === JSON.stringify(restored.state), restoredNotes = JSON.stringify(packet) === JSON.stringify(restoredPacket);

          // GALLEY's real note scheduler forwards each lock into real native
          // audio nodes; the synthetic musical clock avoids wall-time sleeps.
          const native = app.engine, method = id === 'form' ? 'schedulePrepared' : id === 'batter' ? 'scheduleHit' : 'scheduleNativeNote', originalNative = native[method], nativeCalls = [], hostCalls = [];
          native[method] = function (...args) { const result = originalNative.apply(this, args); const locks = id === 'form' ? args[5] : id === 'batter' ? args[0].locks : args[2]?.locks; nativeCalls.push(copy(locks || {})); return result; };
          const originalHost = host.scheduleNote.bind(host); host.scheduleNote = (track, event) => { hostCalls.push(copy(event)); return originalHost(track, event); };
          const clock = { contextTime: context.currentTime + .5, tempo: 240, revision: 1, cycle: 0, endBeat: 16, loopEnabled: false, loopStart: 0, loopEnd: 16 };
          const playback = new LoomNotePlayback({ audio: { getTransport: () => clock, subscribeTransport: () => () => {} }, host, getState: () => ({ tracks: [] }) });
          const entry = { adapter }, track = { id: 'percussion-source' };
          playback._liveClip(track, entry, packet, 'integration-live', 0, { start: 0, end: 8, boundary: 16, when: clock.contextTime, cycle: 0 }, clock, adapter.nativeSequenceLoop);
          const onceCount = hostCalls.length;
          playback._liveClip(track, entry, packet, 'integration-live', 0, { start: 8, end: 16, boundary: 16, when: clock.contextTime + 2, cycle: 0 }, clock, adapter.nativeSequenceLoop);
          host.cancelNotes('percussion-source', { source: 'integration-live' }); native[method] = originalNative;

          const state = LoomSchema.defaultState(); state.name = 'Percussion integration'; state.tempo = 240; state.lengthBars = 4; state.loopEnabled = false; state.master.level = .7; state.tracks[0].level = .8;
          state.tracks[0].instrument = { id, snapshot }; state.tracks[0].instrumentLive = false;
          state.tracks[0].clips = [{ id: 'native-chain', type: 'notes', name: 'Complete native chain', pattern: packet, voiceMap: Object.fromEntries(packet.voices.map(voice => [voice.id, voice.id])), start: 2, length: packet.lengthBeats, sourceOffset: 0, rate: 1, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 }];
          const stateBefore = JSON.stringify(state), printed = await renderer.print(state, 'track-1', 'native-chain');
          const unlocked = copy(state); unlocked.tracks[0].clips[0].pattern.sourceApp = 'integration';
          unlocked.tracks[0].clips[0].pattern.notes.forEach((note, index) => { delete note.locks; note.id = 'unlocked-' + index; });
          const direct = await renderer.print(unlocked, 'track-1', 'native-chain');
          const first = metrics(printed.audio, .25, .37), comparison = metrics(direct.audio, .25, .37), laterDifference = maximumDifference(printed.audio, direct.audio, 1.25, 1.4);
          const sourceFirst = metrics(printed.audio, 0, .6), beforeFirst = metrics(printed.audio, 0, .25 - 2 / printed.audio.sampleRate);
          const sourceSecond = metrics(printed.audio, 1.25, 1.4), beforeSecond = metrics(printed.audio, 1, 1.25 - 2 / printed.audio.sampleRate);
          const arrange = copy(state); arrange.assets = [printed.asset]; arrange.tracks[0].clips = [printed.clip];
          const reopened = LoomSchema.parseProject(LoomSchema.serializeProject(arrange));
          studio = new LoomAudio(arrange);
          const blob = await studio.renderWav(reopened, LoomSchema.decodeAssets(reopened.assets), { startBeat: 0, endBeat: 12, tailSeconds: 0, includeMetronome: false });
          const buffer = await context.decodeAudioData(await blob.arrayBuffer()), wav = { left: buffer.getChannelData(0), right: buffer.getChannelData(1), sampleRate: buffer.sampleRate };
          const wavFirst = metrics(wav, 0, 1), wavBefore = metrics(wav, 0, .75 - 2 / wav.sampleRate), wavSecond = metrics(wav, 1.75, 1.9);
          const sourceAfter = await host.snapshot('percussion-source');
          return { id, pure, restoredNotes, sourceUnchanged: sourceBefore === JSON.stringify(sourceAfter.state), inputUnchanged: stateBefore === JSON.stringify(state),
            packet: { lengthBeats: packet.lengthBeats, beats: packet.notes.map(note => note.beat), locks: packet.notes.map(note => note.locks || null), voices: packet.notes.map(note => note.voice) },
            nativeSequenceLoop: adapter.nativeSequenceLoop, nativeCalls, hostCalls: hostCalls.map(note => ({ when: note.when - clock.contextTime, locks: note.locks || null })), onceCount,
            expectedVoice: lockedVoice, sourceFrames: printed.audio.left.length, sourceRate: printed.audio.sampleRate, beforeFirst, sourceFirst, sourceSecond, beforeSecond,
            firstRmsRatio: first.rms / comparison.rms, laterDifference, wavFirst, wavBefore, wavSecond, wavFrames: buffer.length, wavRate: buffer.sampleRate,
            originLocks: reopened.tracks[0].clips[0].origin.pattern.notes[0].locks, originBeats: reopened.tracks[0].clips[0].origin.pattern.notes.map(note => note.beat),
            originNativeStateEqual: JSON.stringify(printed.origin.instrument.snapshot.state) === sourceBefore,
            frameCount: document.querySelectorAll('iframe').length, registryCount: Object.values(window.__LoomHostRegistry).filter(record => record.active).length };
        } finally { await renderer.dispose(); await studio?.dispose(); host.dispose(); input.disconnect(); await context.close(); }
      }, id);
      assert(result.pure && result.restoredNotes && result.sourceUnchanged && result.inputUnchanged, id + ': capture, restore and private rendering must not edit source projects');
      assert.equal(result.packet.lengthBeats, 8); assert.deepEqual(result.packet.beats, [1, 5]); assert.deepEqual(result.packet.voices, [result.expectedVoice, result.expectedVoice]);
      assert.equal(result.packet.locks[0].cutoff, 200); assert.equal(result.packet.locks[1], null); assert.equal(result.nativeSequenceLoop, false);
      assert.equal(result.onceCount, 2); assert.equal(result.hostCalls.length, 2, id + ': once chain must not repeat'); result.hostCalls.forEach((note, index) => assert(Math.abs(note.when - [.25, 1.25][index]) < 1e-9, id + ': native timestamp remains exact'));
      assert.equal(result.nativeCalls.length, 2); assert.equal(result.nativeCalls[0][id === 'batter' ? 'lowpass' : 'cutoff'], 200); assert.equal(result.nativeCalls[1][id === 'batter' ? 'lowpass' : 'cutoff'], undefined);
      assert.equal(result.sourceFrames, result.sourceRate * 2); assert(result.beforeFirst.peak < 1e-5 && result.beforeSecond.peak < 1e-5, id + ': printed notes must retain both leading gaps');
      assert(result.sourceFirst.firstSeconds >= .25 - 2 / result.sourceRate && result.sourceFirst.firstSeconds < .30, id + ': first native hit timing');
      assert(result.sourceSecond.firstSeconds >= 1.25 - 2 / result.sourceRate && result.sourceSecond.peak > .001, id + ': second native hit timing');
      assert(result.firstRmsRatio < .8, id + ': cutoff must audibly alter the first printed strike: ' + result.firstRmsRatio);
      assert(result.laterDifference <= 3 / 32768, id + ': the following unlocked hit must retain its sound: ' + result.laterDifference);
      assert.equal(result.originLocks.cutoff, 200); assert.deepEqual(result.originBeats, [1, 5]); assert(result.originNativeStateEqual);
      assert.equal(result.wavFrames, 3 * result.wavRate); assert(result.wavBefore.peak < 1e-5);
      assert(result.wavFirst.firstSeconds >= .75 - 2 / result.wavRate && result.wavFirst.firstSeconds < .80 && result.wavSecond.peak > .001, id + ': GALLEY WAV preserves print placement');
      assert.equal(result.frameCount, 1, id + ': private rendering frames cleaned up'); assert.equal(result.registryCount, 1, id + ': private host registrations cleaned up');
      rows.push({ id, sourceRate: result.sourceRate, firstHitSeconds: result.sourceFirst.firstSeconds, secondHitSeconds: result.sourceSecond.firstSeconds, cutoffRmsRatio: result.firstRmsRatio, unlockedMaximumDifference: result.laterDifference, arrangementFirstHitSeconds: result.wavFirst.firstSeconds });
      console.log('PASS ' + id + ': actual hosted chain/locks/once, complete snapshot restore, native per-hit options, private Print, unchanged next strike, project recovery and GALLEY WAV timing.');
    }
    assert.deepEqual(errors, [], 'No uncaught browser audio/app errors'); assert.deepEqual(requests, [], 'Embedded instruments require no missing resources');
    console.log(JSON.stringify({ passed: rows, errors, failedRequests: requests }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
