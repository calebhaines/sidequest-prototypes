'use strict';
// CLATTER's actual portable note adapter reads fresh public state snapshots.
// Dense repeats must still share the native six-voice budget for their lane.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const read = file => {
  const target = [path.join(root, file), path.join(__dirname, 'timing-fixtures', file), path.join(__dirname, file)].find(file => fs.existsSync(file));
  if (!target) throw Error('Missing maintained CLATTER test source: ' + file);
  return fs.readFileSync(target, 'utf8');
};
const template = read('tine/app.html');
const common = ['tine/synth-schema.js', 'tine/presets.js'];
const after = ['tine/app.js', 'shared/pattern-schema.js', 'shared/pattern-drums.js'];
const pageFor = engine => template.replace('<!-- STYLES -->', '<style>' + read('tine/styles.css') + '</style>')
  .replace('<!-- SCRIPTS -->', '<script>' + [...common.map(read), engine, ...after.map(read)].join('\n').replace(/<\/script/g, '<\\/script') + '</script>');

(async () => {
  const pages = { '/current': pageFor(read('tine/audio-engine.js')) };
  const server = http.createServer((request, response) => { const html = pages[request.url]; response.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' }); response.end(html || 'Missing fixture'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext(), errors = [];
  try {
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/current'); await page.waitForFunction(() => window.MusicLabPatternInstrument);
    const results = await page.evaluate(async () => {
      const app = window.TineApp, engine = app.engine, adapter = window.MusicLabPatternInstrument;
      const project = app.getProject();
      for (let index = 0; index < 2; index++) Object.assign(project.state.tracks[index], { decay: 4, pitchHz: 110, model: 'membrane', mallet: 1, noise: 0, variation: 0, level: .25 });
      app.loadState(project); await adapter.prepare();
      const snapshot = app.getState(), before = JSON.stringify(snapshot), start = engine.context.currentTime + .1;
      for (let index = 0; index < 20; index++) adapter.scheduleNote({ voice: 'voice-0', pitch: 36, velocity: .6, when: start + index * .025, durationSeconds: .1, source: 'polyphony-one' });
      const voices = [...engine.environment.voices], active = voices.filter(voice => !voice.stolen);
      const one = { active: active.length, stolen: engine.environment.stolen, keys: [...new Set(active.map(voice => voice.voiceKey))], untouched: JSON.stringify(app.getState()) === before, distinctSnapshots: new Set(voices.map(voice => voice.track)).size };
      engine.stop();
      const secondStart = engine.context.currentTime + .7;
      const initialStolen = engine.environment.stolen;
      for (let index = 0; index < 20; index++) adapter.scheduleNote({ voice: 'voice-' + index % 2, pitch: 36 + index % 2, velocity: .6, when: secondStart + index * .025, durationSeconds: .1, source: 'polyphony-two' });
      const lanes = [...engine.environment.voices].filter(voice => !voice.stolen && voice.scopeSource === 'polyphony-two');
      const two = { active: lanes.length, lane0: lanes.filter(voice => voice.voiceKey === 'voice-0').length, lane1: lanes.filter(voice => voice.voiceKey === 'voice-1').length, stolen: engine.environment.stolen - initialStolen };
      engine.stop();
      // Parameter snapshots remain current; lane identity must not replace a
      // new public snapshot with a cached, stale synthesis patch.
      const revised = app.getProject(); revised.state.tracks[0].pitchHz = 330; app.loadState(revised);
      adapter.scheduleNote({ voice: 'voice-0', pitch: 36, velocity: .6, when: engine.context.currentTime + .1, durationSeconds: .1, source: 'revised-patch' });
      const newest = [...engine.environment.voices].find(voice => voice.scopeSource === 'revised-patch');
      const revisedPitch = newest.modes[0].frequency;
      engine.stop();
      // Standalone direct callers retain the original object-identity budget.
      const native = new window.TineEngine(); await native.init();
      const track = app.getState().tracks[0], at = native.context.currentTime + .1;
      for (let index = 0; index < 20; index++) native.scheduleNativeNote(track, at + index * .025, { velocity: .6, source: 'native-budget' });
      const nativeBudget = { active: [...native.environment.voices].filter(voice => !voice.stolen).length, stolen: native.environment.stolen };
      await native.dispose(); await engine.dispose();
      return { one, two, revisedPitch, nativeBudget };
    });
    assert.equal(results.one.distinctSnapshots, 20, 'The real adapter still reads independent public snapshots');
    assert.equal(results.one.active, 6, 'Dense hosted hits share one lane budget');
    assert.equal(results.one.stolen, 14); assert.deepEqual(results.one.keys, ['voice-0']); assert(results.one.untouched, 'Scheduling does not change musical state');
    assert.deepEqual(results.two, { active: 12, lane0: 6, lane1: 6, stolen: 8 }, 'Independent lanes each retain six voices');
    assert(Math.abs(results.revisedPitch - 330) < 1e-9, 'Fresh synthesis edits reach subsequent notes');
    assert.deepEqual(results.nativeBudget, { active: 6, stolen: 14 }, 'Standalone object identity remains compatible');

    // Identity metadata must not alter the sound of a non-stolen voice.
    const render = async (page, keyed) => page.evaluate(async keyed => {
      const state = JSON.parse(JSON.stringify(TINE_PRESETS[0])); state.master = .78; state.stepCount = 16; const track = state.tracks[0];
      Object.assign(track, { decay: .5, variation: 0, pitchHz: 110, mallet: .8, noise: .1 });
      const event = { voice: 0, at: .1, velocity: .7, pitch: 0, ...(keyed ? { voiceKey: 'voice-0' } : {}) };
      const result = await new TineEngine().renderNativeEvents(state, [event], { durationSeconds: .5, tailSeconds: .8 });
      return [...new Uint8Array(await result.blob.arrayBuffer())];
    }, keyed);
    const current = Buffer.from(await render(page, true));
    const reference = Buffer.from(await render(page, false));
    assert.equal(current.length, reference.length); let maximum = 0;
    for (let at = 44; at < current.length; at += 2) maximum = Math.max(maximum, Math.abs(current.readInt16LE(at) - reference.readInt16LE(at)));
    assert(maximum <= 3, 'Lane identity metadata does not change an ordinary modal hit');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: ['Fresh adapter snapshots keep a six-voice lane budget', 'Independent lanes retain separate budgets', 'Synthesis edits remain live and project state is untouched', 'Standalone direct calls retain their budget', 'Lane identity metadata leaves ordinary native WAV unchanged'], metrics: results, maximumPcmDifference: maximum }, null, 2));
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
