/* Real hosted tonal instruments → GALLEY note print → arrangement audio.
 * The standalone instrument pages must be built before running this check.
 * PLAYWRIGHT_MODULE and CHROMIUM_PATH select a local browser installation.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sourceDownload = fs.existsSync(path.join(__dirname, 'instruments'));
const root = sourceDownload ? __dirname : path.resolve(__dirname, '..');
const scripts = ['shared/pattern-schema.js', 'loom/vocal-catalog.js', 'loom/utility-catalog.js', 'loom/filter-catalog.js', 'loom/creative-catalog.js', 'loom/char-catalog.js', 'loom/effects-catalog.js',
  'loom/vocal-dsp.js', 'loom/utility-dsp.js', 'loom/filter-dsp.js', 'loom/creative-dsp.js', 'loom/char-dsp.js', 'loom/effects.js', 'loom/schema.js', 'loom/track-eq-dsp.js', 'loom/audio-engine.js', 'loom/host-bridge.js', 'loom/instrument-host.js', 'loom/note-renderer.js'];
const sourceScripts = scripts.map(file => sourceDownload ? file.replace(/^loom\//, '') : file);
const parent = '<!doctype html><meta charset="utf-8"><body><iframe id="editor"></iframe>' + sourceScripts.filter(file => fs.existsSync(path.join(root, file))).map(file => '<script src="/' + file + '"></script>').join('');
const ids = ['bower', 'roux', 'proof', 'marinade', 'haze', 'fable', 'mire', 'picnic', 'spool', 'ravel'];

(async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(parent); return; }
    let pathname = new URL(request.url, 'http://local').pathname;
    if (sourceDownload && /^\/[a-z]+\/index\.html$/.test(pathname)) pathname = '/instruments/' + pathname.split('/')[1] + '.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end('Missing fixture'); return; }
    response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html' }); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    for (const id of ids) {
      const results = await page.evaluate(async id => {
        const context = new AudioContext({ sampleRate: 48000 });
        const input = context.createGain(); input.gain.value = 0; input.connect(context.destination);
        const host = new LoomInstrumentHost({ context, getTrackInput: () => input, baseURL: location.origin + '/' });
        const renderer = new LoomNoteRenderer({ context, baseURL: location.origin + '/' });
        const summarize = (audio, expectedSeconds) => {
          const expected = Math.round(expectedSeconds * audio.sampleRate); let before = 0, peak = 0, first = -1;
          for (let frame = 0; frame < audio.left.length; frame++) {
            const value = Math.max(Math.abs(audio.left[frame]), Math.abs(audio.right[frame]));
            if (!Number.isFinite(value)) throw Error(id + ' rendered non-finite audio');
            peak = Math.max(peak, value);
            if (frame < expected - 2) before = Math.max(before, value);
            if (first < 0 && value > 1e-5) first = frame;
          }
          return { before, peak, firstSeconds: first / audio.sampleRate, expectedSeconds, sampleRate: audio.sampleRate };
        };
        const timeline = (state, assets, expectedSeconds) => {
          const DSP = createLoomEngineDSP(createLoomEffectsDSP), core = new DSP.Core(state, assets, 48000, { linear: true });
          core.start(0); const frames = Math.ceil((expectedSeconds + .3) * 48000), left = new Float32Array(frames), right = new Float32Array(frames);
          for (let at = 0; at < frames; at += 128) core.processBlock(left.subarray(at, Math.min(frames, at + 128)), right.subarray(at, Math.min(frames, at + 128)));
          return summarize({ left, right, sampleRate: 48000 }, expectedSeconds);
        };
        const rows = [];
        try {
          await host.load('timing-source', { id }, document.querySelector('iframe'));
          if (id === 'spool' || id === 'ravel') {
            // Both tools can play tonal material. Replace the native drum/tape
            // demo with real stereo PCM, then let the normal host snapshot carry
            // that sample into the private native printing editor.
            const sampleRate = 48000, frames = Math.round(sampleRate * .4), pcm = new Float32Array(frames * 2);
            for (let frame = 0; frame < frames; frame++) {
              pcm[frame * 2] = .3 * Math.sin(2 * Math.PI * 220 * frame / sampleRate);
              pcm[frame * 2 + 1] = .2 * Math.sin(2 * Math.PI * 330 * frame / sampleRate);
            }
            await host.importAudio('timing-source', { pcm, sampleRate, name: 'Tonal timing stereo fixture' }, { target: 0, replace: true });
          }
          const snapshot = await host.snapshot('timing-source'), adapter = host.getPatternAdapter('timing-source');
          const voice = adapter.notes.voices.find(voice => voice.id !== 'auto') || adapter.notes.voices[0], pitch = voice.pitch ?? 60;
          for (const settings of [
            { name: 'leading silence', beat: 2, swing: 0, tempo: 120, rate: 1, offset: 0, start: 2 },
            { name: 'swing + time rate + source trim', beat: 1.25, swing: .4, tempo: 100, rate: 1.5, offset: .25, start: 1.5 }
          ]) {
            const packet = { format: 'musiclab-pattern', version: 1, name: 'Timing ' + id, sourceApp: id, kind: 'notes', tempo: settings.tempo,
              swing: settings.swing, lengthBeats: 4, meter: [4, 4], voices: [{ id: voice.id, name: voice.name, pitch }],
              notes: [{ id: 'delayed', voice: voice.id, pitch, beat: settings.beat, duration: .5, velocity: .9, probability: 1 }], seed: 17 };
            const state = LoomSchema.defaultState(); state.tempo = settings.tempo; state.master.level = 1; state.loopEnabled = false; state.tracks[0].level = 1;
            const track = state.tracks[0]; track.instrument = { id, snapshot }; track.instrumentLive = false;
            track.clips = [{ id: 'timed-note', name: 'Timing phrase', type: 'notes', pattern: packet, voiceMap: { [voice.id]: voice.id },
              start: settings.start, length: 4 / settings.rate, sourceOffset: settings.offset, rate: settings.rate, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 }];
            const noteBeat = settings.beat + settings.swing / 4;
            const sourceTime = noteBeat * 60 / (settings.tempo * settings.rate);
            const arrangementTime = settings.start * 60 / settings.tempo + (noteBeat - settings.offset) * 60 / (settings.tempo * settings.rate);
            const print = await renderer.print(state, track.id, 'timed-note');
            const source = summarize(print.audio, sourceTime);
            state.assets = [print.asset]; track.clips = [print.clip];
            const printed = timeline(state, LoomSchema.decodeAssets(state.assets), arrangementTime);
            // The direct export path must use the same musical geometry as Print.
            const notes = LoomSchema.copy(state); notes.assets = []; notes.tracks[0].clips = [LoomSchema.copy(print.origin.sourceClip)];
            const prepared = await renderer.prepareNotes(notes, {});
            const exportAudio = timeline(prepared.state, prepared.assets, arrangementTime);
            rows.push({ name: settings.name, source, printed, exportAudio, start: print.clip.start, expectedStart: settings.start,
              sourceOffset: print.clip.sourceOffset, expectedOffset: settings.offset * 60 / (settings.tempo * settings.rate) });
          }
        } finally { await renderer.dispose(); host.dispose(); input.disconnect(); await context.close(); }
        return rows;
      }, id);
      for (const row of results) {
        assert.equal(row.start, row.expectedStart, id + ' preserves arrangement start');
        assert(Math.abs(row.sourceOffset - row.expectedOffset) < 1e-12, id + ' converts source offset in the rendered time rate');
        for (const [path, audio] of Object.entries(row).filter(([, value]) => value && typeof value === 'object' && 'before' in value)) {
          assert(audio.before < 1e-5, id + ' ' + row.name + ' ' + path + ' starts early: ' + JSON.stringify(audio));
          assert(audio.peak > .002, id + ' ' + path + ' must contain actual native sound');
          assert(audio.firstSeconds >= audio.expectedSeconds - 2 / audio.sampleRate, id + ' ' + path + ' loses leading silence');
          assert(audio.firstSeconds < audio.expectedSeconds + .15, id + ' ' + path + ' has an unexpected scheduling delay');
        }
      }
      console.log('PASS ' + id + ': real native print + arrangement + note export preserve leading silence, swing, trim, rate, and placement.');
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
