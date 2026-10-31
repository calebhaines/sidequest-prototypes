'use strict';
// Real hosted tonal engines -> shared note clock -> GALLEY's dry recorder.
// Maintained host/recorder sources are served directly; instruments are the
// standalone pages bundled by GALLEY. No synthetic audio replaces a voice.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sourceDownload = fs.existsSync(path.join(__dirname, 'instruments'));
const root = sourceDownload ? __dirname : path.resolve(__dirname, '..');
const scripts = ['shared/pattern-schema.js', 'loom/vocal-catalog.js', 'loom/utility-catalog.js', 'loom/filter-catalog.js', 'loom/creative-catalog.js', 'loom/char-catalog.js', 'loom/effects-catalog.js', 'loom/vocal-dsp.js', 'loom/utility-dsp.js', 'loom/filter-dsp.js', 'loom/creative-dsp.js', 'loom/char-dsp.js', 'loom/effects.js', 'loom/schema.js', 'loom/track-eq-dsp.js', 'loom/audio-engine.js', 'loom/host-bridge.js', 'loom/instrument-host.js', 'loom/note-playback.js']
  .map(file => sourceDownload ? file.replace(/^loom\//, '') : file).filter(file => fs.existsSync(path.join(root, file)));
const html = '<!doctype html><meta charset="utf-8"><title>Tonal capture timing</title>' + scripts.map(file => '<script src="/' + file + '"></script>').join('');
const apps = (process.env.TONAL_LIVE_APPS || 'bower,roux,proof,marinade,haze,fable,mire,picnic,spool,ravel').split(',');
const modes = (process.env.TONAL_LIVE_MODES || 'worklet,fallback').split(',');
const extraCases = (process.env.TONAL_LIVE_EXTRA_CASES ?? 'native,live,count-in,seek').split(',').filter(Boolean);
const observations = [];

async function capture(browser, url, id, mode, scenario = 'notes') {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode === 'fallback') await page.addInitScript(() => Object.defineProperty(AudioContext.prototype, 'audioWorklet', { configurable: true, get: () => undefined }));
  try {
    await page.goto(url + '/timing');
    const result = await page.evaluate(async ({ id, mode, scenario }) => {
      const S = window.LoomSchema, state = S.defaultState();
      state.tempo = 120; state.loopEnabled = false; state.master.level = 1;
      // Microphone alignment must never move an internal instrument take.
      state.recording.micCompensation = 'manual'; state.recording.micOffsetMs = 250;
      if (scenario === 'count-in') state.recording.countInBars = 1;
      state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
      state.tracks[0].instrument = { id }; state.tracks[0].armed = true;
      state.tracks[0].instrumentLive = scenario === 'live';
      const audio = new window.LoomAudio(state), statuses = [];
      audio.onStatus = value => { if (value.type === 'error') statuses.push(value.message); };
      await audio.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' });
      await audio.init(); await audio.context.resume();
      const host = new window.LoomInstrumentHost({ context: () => audio.context, getTrackInput: key => audio.getTrackInput(key), transport: () => audio.getTransport(), baseURL: new URL('/', location.href).href });
      const frame = document.createElement('iframe'); document.body.append(frame);
      await host.load('track-1', { id }, frame);
      if (id === 'spool' || id === 'ravel') {
        // These sample/tape instruments can carry tonal material too. Send a
        // known stereo tone through their actual import and playback paths so
        // native drum demo transients cannot stand in for pitched coverage.
        const sampleRate = 48000, frames = sampleRate * 2, pcm = new Float32Array(frames * 2);
        for (let i = 0; i < frames; i++) { pcm[i * 2] = .18 * Math.sin(2 * Math.PI * 220 * i / sampleRate); pcm[i * 2 + 1] = .14 * Math.sin(2 * Math.PI * 330 * i / sampleRate); }
        await host.importAudio('track-1', { pcm, sampleRate, name: 'Tonal timing ingredient', tempo: 120 }, { target: 0, replace: true });
      }
      await host.command('track-1', 'prepare');
      const adapter = host.getPatternAdapter('track-1');
      const voice = adapter.notes.voices.find(item => item.id !== 'auto' && Number.isInteger(item.pitch)) || adapter.notes.voices[0];
      const limits = voice.pitchRange || adapter.notes.pitchRange || [0, 127];
      const pitch = Math.max(limits[0], Math.min(limits[1], voice.pitch ?? 60));
      const packet = { format: 'musiclab-pattern', version: 1, name: 'A deliberate rest', sourceApp: id, tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4],
        voices: [{ id: voice.id, name: voice.name }], notes: [{ id: 'delayed', voice: voice.id, pitch, velocity: .8, beat: 1, duration: .25, probability: 1 }], seed: 7, tags: [] };
      if (scenario !== 'native') state.tracks[0].clips = [{ id: 'timed-notes', name: packet.name, type: 'notes', pattern: packet, voiceMap: {}, start: scenario === 'seek' ? 2 : 0, length: 4, sourceOffset: 0, rate: 1, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 }];
      audio.setState(state);
      if (scenario === 'seek') audio.seek(2);
      const trace = [], schedule = host.scheduleNote.bind(host);
      host.scheduleNote = (trackId, event) => { trace.push({ source: event.source, when: event.when, pitch: event.pitch }); return schedule(trackId, event); };
      const playback = new window.LoomNotePlayback({ audio, host, getState: () => state, onStatus: message => statuses.push(message) });
      playback.setRecordingTracks(['track-1']); await playback.prepare();
      // This is GALLEY's production record-start order, including the host Start
      // command that must not turn an arranged part into an autonomous groove.
      audio.onRecordingTransportStart = () => { playback.start(); host.command('track-1', 'start').catch(error => statuses.push(error.message)); };
      try {
        await audio.startRecording(['track-1'], { startTransport: true, maxSeconds: 1.05 });
        const deadline = performance.now() + 6500;
        while (audio.isRecording && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        if (audio.isRecording) throw Error('The bounded recording did not finish.');
        const takes = await audio.stopRecording(), take = takes[0];
        if (!take?.frames) throw Error('The recorder produced no take.');
        let first = -1, peak = 0;
        for (let i = 0; i < take.frames; i++) {
          const amplitude = Math.max(Math.abs(take.left[i]), Math.abs(take.right[i]));
          if (!Number.isFinite(amplitude)) throw Error('Non-finite recorded audio.');
          if (first < 0 && amplitude > 1e-7) first = i;
          peak = Math.max(peak, amplitude);
        }
        return { id, mode: audio.mode, scenario, firstSeconds: first < 0 ? -1 : first / take.sampleRate, startBeat: take.startBeat, frames: take.frames, sampleRate: take.sampleRate, peak, trace, statuses, clockDriven: host.records.get('track-1').externalClock === true };
      } finally { playback.dispose(); host.dispose(); await audio.dispose(); }
    }, { id, mode, scenario });
    assert.deepEqual(errors, [], 'No uncaught browser errors for ' + id + '/' + mode);
    assert.deepEqual(result.statuses, [], 'No host/audio failures for ' + id + '/' + mode);
    assert.equal(result.mode, mode, 'The requested real audio path was used');
    assert(result.peak > .00001, 'The actual ' + id + ' voice reached the recorder');
    if (scenario === 'native' || scenario === 'live') {
      assert(result.firstSeconds >= 0 && result.firstSeconds < .15, 'The native recipe still sounds at its initial beat');
      assert(result.trace.some(event => event.source.startsWith('loom-live:')), 'Native pattern capture remains available');
      if (scenario === 'live') assert(result.trace.some(event => event.source === 'loom'), 'Explicit Live mixes the recipe with arranged notes');
    } else {
      assert(result.clockDriven, 'Arranged notes suppress the autonomous app clock');
      assert(result.trace.length > 0 && result.trace.every(event => event.source === 'loom'), 'Arming does not secretly add the native groove');
      assert(result.firstSeconds >= .5 - 128 / result.sampleRate, 'The delayed note starts early: ' + JSON.stringify(result));
      assert(result.firstSeconds < .65, 'The delayed note retains its natural attack without a blanket compensation delay');
      assert(Math.abs(result.startBeat - (scenario === 'seek' ? 2 : 0)) < 1e-5, 'The take keeps its arrangement position');
    }
    observations.push({ id, mode, scenario, firstSeconds: result.firstSeconds, startBeat: result.startBeat });
    console.log('PASS', id, mode, scenario, 'first PCM at', result.firstSeconds.toFixed(6), 'seconds');
  } finally { await context.close(); }
}

(async () => {
  const server = http.createServer((request, response) => {
    let pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/timing') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    const instrument = /^\/([a-z]+)\/index\.html$/.exec(pathname);
    if (instrument && process.env.TONAL_LIVE_INSTRUMENT_DIR) {
      const preview = path.join(process.env.TONAL_LIVE_INSTRUMENT_DIR, instrument[1] + '.html');
      if (fs.existsSync(preview)) { response.setHeader('Content-Type', 'text/html'); response.end(fs.readFileSync(preview)); return; }
    }
    if (instrument && sourceDownload) pathname = '/instruments/' + instrument[1] + '.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); response.end(fs.readFileSync(file)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    for (const mode of modes) for (const id of apps) await capture(browser, url, id, mode);
    for (const mode of modes) {
      for (const scenario of extraCases) {
        if (scenario === 'count-in') {
          await capture(browser, url, 'proof', mode, scenario);
          await capture(browser, url, 'marinade', mode, scenario);
        } else await capture(browser, url, 'roux', mode, scenario);
      }
    }
    console.log(JSON.stringify({ passed: observations.length, observations }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
