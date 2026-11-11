'use strict';
// Actual original Kitchen pages under the native editor bridge. No native or
// physical audio device is used; the real AudioContext constructor is counted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..'), web = path.join(root, 'plugins/web');
const output = process.env.KITCHEN_EDITOR_QA_DIR || '/tmp/kitchen-plugin-editors';
const ids = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel', 'fable', 'roux', 'batter', 'proof', 'marinade', 'picnic', 'morsel', 'heirloom', 'brine', 'citrus'];
const names = ['SIZZLE', 'HOTPLATE', 'CLATTER', 'REDUCE', 'ROTISSERIE', 'STEAM', 'SKEWER', 'DICER', 'STOCK', 'ROUX', 'BATTER', 'LEAVEN', 'MARINADE', 'PICNIC', 'MORSEL', 'HEIRLOOM', 'BRINE', 'CITRUS'];
const facades = ['GrainApp', 'FormApp', 'TineApp', 'MireApp', 'SpoolApp', 'HazeApp', 'BowerApp', 'RavelApp', 'FableApp', 'RouxApp', 'BatterApp', 'ProofApp', 'MarinadeApp', 'PicnicApp', 'MorselApp', 'HeirloomApp', 'BrineApp', 'CitrusApp'];
const bridge = fs.readFileSync(path.join(web, 'editor-bridge.js'), 'utf8');
const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
const report = { passed: [], pageErrors: [], external: [] };
fs.mkdirSync(output, { recursive: true });
let server, browser, current = 'startup';
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function check(name, run) { current = name; const at = Date.now(), evidence = await run(); report.passed.push({ name, milliseconds: Date.now() - at, evidence }); save(); console.log('PASS', name, JSON.stringify(evidence)); }
function effectDefinitions() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins/effects-manifest.json'), 'utf8'));
  const scope = { console, crypto: webcrypto, Blob, performance, btoa, atob }; scope.window = scope; scope.globalThis = scope; vm.createContext(scope);
  for (const file of [...manifest.catalogSources, ...manifest.dspSources, manifest.adapter]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
  return JSON.parse(JSON.stringify(scope.KitchenEffectPlugins.definitions()));
}
const effects = effectDefinitions();
function instrumentDefinitions() {
  const result = new Map();
  for (const file of ['core-instruments-manifest.json', 'webaudio-instruments-manifest.json']) {
    const value = JSON.parse(fs.readFileSync(path.join(root, 'plugins', file), 'utf8'));
    for (const item of value.instruments) result.set(item.id, item);
  }
  const scope = { console }; scope.window = scope; vm.createContext(scope);
  for (const file of ['morsel/schema.js', 'plugins/js/morsel.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
  for (const item of scope.KitchenMorselPlugin.definitions()) result.set(item.id, item);
  return result;
}
const instruments = instrumentDefinitions();
function instrumentHTML(id) {
  if (process.env.KITCHEN_EDITOR_GENERATED) return fs.readFileSync(path.join(root, 'plugins/generated/ui', id + '.html'), 'utf8');
  const file = path.join(root, id === 'form' ? 'music/form/index.html' : id + '/index.html'); let html = fs.readFileSync(file, 'utf8');
  if (id === 'form' && !html.includes('FormApp')) {
    const marker = 'We.current={project:f,masterVolume:Te,solo:ae};'; assert(html.includes(marker), 'HOTPLATE facade injection needs its current reducer signature');
    const expose = 'window.FormApp={getState:()=>pn(We.current.project),getProject:()=>pn(We.current.project),isPlaying:()=>q,get engine(){return Ge.current},prepare:()=>il().preload(We.current.project.sounds),play:()=>_(!0),stop:()=>{_(!1);Ge.current?.stopAll()},panic:()=>{_(!1);Ge.current?.stopAll()},setTempo:value=>c({type:"change",update:p=>({...p,bpm:Math.max(40,Math.min(240,Number(value)||120))})}),loadState:value=>{const p=value?.project||value;if(!sf(p))throw Error("Invalid HOTPLATE project.");_(!1);Ge.current?.stopAll();c({type:"load",project:{...p,sounds:p.sounds.map(Ll)}});S(0);ce(null)}};';
    html = html.replace(marker, marker + expose);
  }
  const sourceParameters = [...(instruments.get(id)?.parameters || [])];
  if (['mire', 'spool'].includes(id) && !sourceParameters.some(value => value.path === '_nativeInput')) sourceParameters.push({ path: '_nativeInput', type: 'boolean', default: false }, ...(id === 'mire' ? [{ path: '_nativeInputDestination', type: 'range', min: 0, max: 3, step: 1, default: 0 }] : []));
  const parameters = [...(sourceParameters.some(value => value.path === 'followHost' || value.path === '_nativeSequence') ? [] : [{ path: '_nativeSequence', type: 'boolean', default: true }]), ...sourceParameters].map(value => ({ ...value, type: value.type === 'number' ? 'range' : value.type, path: value.path || value.id || value.key, options: value.options || value.values?.map(option => ({ value: option, label: String(option) })) }));
  const descriptor = { id: 'instrument-' + id, sourceId: id, kind: 'instrument', name: names[ids.indexOf(id)], parameters };
  html = html.replace(/<head(?:\s[^>]*)?>/i, match => match + script('window.KitchenPluginDescriptor=' + JSON.stringify(descriptor)) + script(bridge));
  if (id === 'morsel') html = html.replace(/<\/body>/i, script(fs.readFileSync(path.join(root, 'plugins/js/morsel-preparation.js'), 'utf8')) + '</body>');
  return html;
}
function effectHTML(definition) {
  if (process.env.KITCHEN_EDITOR_GENERATED) return fs.readFileSync(path.join(root, 'plugins/generated/ui', definition.id + '.html'), 'utf8');
  const descriptor = { id: 'effect-' + definition.id, sourceId: definition.id, kind: 'effect', name: definition.name, definition, parameters: definition.parameters, defaultState: definition.defaults };
  const styles = ['plugins/web/effect-editor.css', 'loom/deluxe.css', 'loom/svt.css', 'loom/guitar-pedals.css', 'loom/cabinet.css', 'loom/pedal-midi.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const code = [bridge, ...['loom/deluxe-ui.js', 'loom/svt-ui.js', 'loom/guitar-pedals-ui.js', 'loom/cabinet-ui.js', 'loom/pedal-midi.js', 'loom/pedal-midi-ui.js', 'plugins/web/effect-editor.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8'))].join('\n');
  return fs.readFileSync(path.join(web, 'effect-editor.html'), 'utf8').replace('<!-- KITCHEN_PLUGIN_DESCRIPTOR -->', script('window.KitchenPluginDescriptor=' + JSON.stringify(descriptor))).replace('<!-- KITCHEN_EFFECT_STYLES -->', '<style>' + styles + '</style>').replace('<!-- KITCHEN_EFFECT_SCRIPTS -->', script(code));
}
async function serve() {
  server = http.createServer((request, response) => {
    try {
      const parsed = new URL(request.url, 'http://localhost'), parts = parsed.pathname.split('/').filter(Boolean);
      if (parsed.pathname === '/favicon.ico') { response.writeHead(204); return response.end(); }
      if (parts[0] === 'instrument' && ids.includes(parts[1])) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return response.end(instrumentHTML(parts[1])); }
      if (parts[0] === 'effect') { const definition = effects.find(value => value.id === parts[1]); if (definition) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return response.end(effectHTML(definition)); } }
      const file = path.resolve(root, '.' + parsed.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); return response.end(); }
      response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(response);
    } catch (error) { response.writeHead(500); response.end(error.stack); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port;
}
async function pageFor(base, route) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__nativeMessages = []; window.__nativeAudioContexts = 0; window.__offlineRenders = 0; window.__editorWorkers = 0;
    const Original = window.AudioContext;
    if (Original) { function Counted(...args) { window.__nativeAudioContexts++; return new Original(...args); } Counted.prototype = Original.prototype; window.AudioContext = Counted; window.webkitAudioContext = Counted; }
    const WorkerConstructor = window.Worker;
    if (WorkerConstructor) { function CountedWorker(...args) { window.__editorWorkers++; return new WorkerConstructor(...args); } CountedWorker.prototype = WorkerConstructor.prototype; window.Worker = CountedWorker; }
    if (window.OfflineAudioContext) { const start = OfflineAudioContext.prototype.startRendering; OfflineAudioContext.prototype.startRendering = function (...args) { window.__offlineRenders++; return start.apply(this, args); }; }
    const listeners = new Map(); let serial = 0;
    window.__nativeDeliver = (type, value) => { for (const record of listeners.values()) if (record.type === type) record.callback(value); };
    window.__JUCE__ = { backend: {
      addEventListener(type, callback) { const id = ++serial; listeners.set(id, { type, callback }); return id; },
      removeEventListener(id) { listeners.delete(id); },
      emitEvent(type, payload) {
        window.__nativeMessages.push({ type, payload });
        if (type === 'kitchenCapture') queueMicrotask(() => {
          if (payload.action === 'start') window.__captureTake = { token: 'native-test-take', capturing: true, sampleRate: 48000, tempo: 120, frames: 0, notes: [] };
          else if (payload.action === 'stop') { const count = window.__captureTestNotes || 1; window.__captureTake = { ...window.__captureTake, capturing: false, frames: count * 4800 + 4800, notes: Array.from({ length: count }, (_, index) => ({ pitch: 57 + index % 12, velocity: .8, startFrame: index * 4800 + 240, endFrame: index * 4800 + 2400 })) }; }
          else if (payload.action === 'clear') window.__captureTake = null;
          const take = window.__captureTake, offset = payload.afterNote || 0, maxNotes = payload.maxNotes ?? 64;
          window.__nativeDeliver('kitchenCapture', { requestId: payload.requestId, ok: true, take: take ? { ...take, notes: take.notes.slice(offset, offset + maxNotes), notesOffset: offset, noteCount: take.notes.length, moreNotes: offset + maxNotes < take.notes.length } : null });
        });
      }
    } };
  });
  await context.route('**/*', route => { const address = route.request().url(); if (/^(data:|blob:|about:)/.test(address) || new URL(address).origin === base) return route.continue(); report.external.push({ current, address }); return route.abort(); });
  const page = await context.newPage(); page.setDefaultTimeout(45000); page.on('pageerror', error => report.pageErrors.push({ current, message: error.message, stack: error.stack }));
  await page.goto(base + route, { waitUntil: 'load', timeout: 120000 }); return { context, page };
}
async function instrumentCheck(base, id) {
  const { context, page } = await pageFor(base, '/instrument/' + id + '/');
  try {
    await page.waitForFunction(() => KitchenNativeEditor.diagnostics.attached);
    const evidence = await page.evaluate(async ({ facade, id }) => {
      const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
      const app = window[facade], raw = await KitchenNativeEditor.getProject(), saved = JSON.stringify(stable(raw));
      await KitchenNativeEditor.receive('kitchenReady', { state: raw });
      if (!KitchenNativeEditor.diagnostics.restored) throw Error('Native state was not restored for ' + id + ': ' + JSON.stringify(KitchenNativeEditor.diagnostics));
      const after = await KitchenNativeEditor.getProject();
      if (JSON.stringify(stable(after)) !== saved) {
        const paths = [], visit = (a, b, at) => { if (paths.length > 8) return; if (JSON.stringify(stable(a)) === JSON.stringify(stable(b))) return; if (!a || !b || typeof a !== 'object' || typeof b !== 'object') { paths.push({ path: at, before: a, after: b }); return; } for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) visit(a[key], b[key], at + '.' + key); };
        visit(raw, after, 'project'); throw Error('Native state restore changed the original recipe for ' + id + ': ' + JSON.stringify(paths));
      }
      const at = (state, path) => { for (const source of [state, state?.state, state?.project, state?.recipe]) for (const candidate of [path, path.replace(/^(?:recipe|state|project)\./, '')]) { let value = source; for (const key of candidate.split('.')) value = value?.[key]; if (value !== undefined) return value; } };
      const descriptor = KitchenNativeEditor.descriptor;
      const index = descriptor.parameters.findIndex(value => value.type === 'range' && typeof at(raw, value.path) === 'number' && value.max > value.min);
      let automation = null;
      if (index >= 0) {
        const d = descriptor.parameters[index], original = at(raw, d.path), ratio = KitchenNativeEditor.normalized(d, original) > .5 ? .25 : .75, expected = KitchenNativeEditor.actual(d, ratio), list = [];
        list[index] = ratio; await KitchenNativeEditor.receive('kitchenParameters', list);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const automated = at(await KitchenNativeEditor.getProject(), d.path);
        if (!Number.isFinite(automated) || Math.abs(automated - expected) > 1e-6) throw Error(id + ' host automation did not reach original controls: ' + JSON.stringify({ path: d.path, expected, automated, diagnostics: KitchenNativeEditor.diagnostics }));
        const changed = await KitchenNativeEditor.getProject(); let found = false;
        for (const source of [changed, changed?.state, changed?.project, changed?.recipe]) {
          for (const candidate of [d.path, d.path.replace(/^(?:recipe|state|project)\./, '')]) {
            const keys = candidate.split('.'); let object = source; for (const key of keys.slice(0, -1)) object = object?.[key];
            if (object && Object.hasOwn(object, keys.at(-1))) { object[keys.at(-1)] = original; found = true; break; }
          }
          if (found) break;
        }
        const before = __nativeMessages.length;
        if (id === 'form' && d.path === 'masterVolume') { const field = document.querySelector('input[aria-label="Master playback volume"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, String(original)); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); }
        else await (app.loadState || app.setState).call(app, changed);
        await new Promise(resolve => requestAnimationFrame(resolve)); (document.getElementById('kitchenNativeSequence') || document.getElementById('kitchenNativeClock')).dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 650));
        const messages = __nativeMessages.slice(before), parameters = messages.filter(value => value.type === 'kitchenSetParameter'), recipes = messages.filter(value => value.type === 'kitchenSetState');
        if (!parameters.some(value => value.payload.index === index)) throw Error(id + ' original control edit did not reach its native parameter');
        if (recipes.length) throw Error(id + ' parameter-only edit rebuilt the full native recipe');
        automation = { path: d.path, restored: automated, parameterMessages: parameters.length, fullRecipeMessages: recipes.length };
      }
      let preparation = null;
      if (id === 'morsel') {
        const recipe = await app.getState(); let hydrations = 0, preparedOptions;
        window.KitchenMorselPreparation = {
          async hydrateBank() { hydrations++; await new Promise(resolve => setTimeout(resolve, 20)); },
          signature: value => JSON.stringify(value),
          async prepareBank(options) { preparedOptions = options; options.onProgress(2, 4); if (!document.getElementById('kitchenNativeStatus').textContent.includes('50%')) throw Error('MORSEL preparation progress is wrong'); return { key: 'prepared-test-bank' }; }
        };
        const state = { recipe, bank: { key: 'restored-test-bank' } };
        await Promise.all([KitchenNativeEditor.receive('kitchenReady', { state }), KitchenNativeEditor.receive('kitchenState', { state })]);
        if (hydrations !== 1) throw Error('A duplicate native snapshot restored MORSEL ' + hydrations + ' times');
        await app.engine.prepareNotes({ state: recipe, events: [] });
        await window.MorselController.preview({ pitch: 64, voice: recipe.voice, lyric: recipe.lyric, velocity: .7, durationSeconds: .1 });
        if (__editorWorkers) throw Error('Ordinary MORSEL control/preview started duplicate neural workers');
        const beforeCustomStep = __nativeMessages.length; await app.engine.preview({ pitch: 64, voice: 'bass', lyric: 'different custom step word', velocity: .7, durationSeconds: .1 });
        if (__nativeMessages.slice(beforeCustomStep).some(value => value.type === 'kitchenMidi') || !document.getElementById('kitchenNativeStatus').textContent.includes('assigned word and voice')) throw Error('MORSEL custom step preview substituted the keyboard word');
        const before = __nativeMessages.length; await KitchenNativeEditor.prepareVoices();
        const messages = __nativeMessages.slice(before).filter(value => value.type === 'kitchenSetState');
        if (messages.length !== 1 || messages[0].payload.state.bank.key !== 'prepared-test-bank') throw Error('MORSEL did not commit one complete prepared bank');
        if (preparedOptions.voices.length !== 4 || preparedOptions.pitches.length !== 49) throw Error('MORSEL preparation omits voices or keyboard pitches');
        KitchenMorselPreparation.prepareBank = options => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
        const beforeCancel = __nativeMessages.length, pending = KitchenNativeEditor.prepareVoices(); await new Promise(resolve => setTimeout(resolve, 0)); document.getElementById('kitchenCancelVoices').click(); await pending;
        if (__nativeMessages.slice(beforeCancel).some(value => value.type === 'kitchenSetState')) throw Error('MORSEL cancel replaced the usable native bank');
        preparation = { hydrations, voices: preparedOptions.voices.length, pitches: preparedOptions.pitches.length, workerCount: __editorWorkers, fullBankMessages: messages.length, cancellationRetainsBank: true };
      }
      __nativeDeliver('kitchenClock', { tempo: 137, beat: 9.25, playing: true, sampleRate: 48000, samplePosition: 194400, revision: 2 });
      const context = new AudioContext(), rate = context.sampleRate;
      await context.resume(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.start();
      await context.close();
      const before = __nativeMessages.length;
      if (id === 'batter') await app.engine.trigger((await app.getState()).lanes[0].id, .75);
      else if (app.engine?.noteOn) { app.engine.noteOn({ id: 'editor-note', pitch: 60, note: 60, velocity: .75 }); app.engine.noteOff?.({ id: 'editor-note', pitch: 60, note: 60 }); }
      else if (id === 'grain' || id === 'tine') await app.engine.preview((await app.getState()).tracks[0]);
      else if (id === 'mire') { await app.engine.trigger(2, .75); await app.engine.triggerNode(2); }
      else if (id === 'ravel') await app.engine.triggerSlice(3);
      else if (id === 'bower') await app.engine.pluck(2, 0, .75);
      else if (id === 'haze') app.engine.scheduleNote({ voiceId: '0', velocity: .75, durationSeconds: .1 });
      else if (id === 'roux') await app.engine.liveNote(48, .75, .1);
      else if (id === 'proof' || id === 'marinade') { await app.engine.trigger(60, .75, .1); app.engine.release(60); }
      else if (id === 'picnic') app.engine.scheduleNote({ pitch: 60, voice: 'chords', velocity: .75, durationSeconds: .1 });
      else if (id === 'morsel') await app.engine.preview({ pitch: 60, velocity: .75, durationSeconds: .1 });
      const midi = __nativeMessages.slice(before).filter(value => value.type === 'kitchenMidi').map(value => value.payload);
      if (midi.some(value => ['on', 'off'].includes(value.type) && (!Number.isInteger(value.nativeId) || value.nativeId < 0x80000001 || value.nativeId > 0xffffffff))) throw Error('Editor note escaped the owned native ID namespace');
      if (id !== 'form' && !midi.some(value => value.type === 'on')) throw Error('No native audition note for ' + id);
      if (id === 'ravel' && !midi.some(value => value.pitch === 60 && value.channel === 4)) throw Error('DICER audition selected the wrong slice or pitch');
      if (id === 'mire' && !midi.some(value => value.channel === 15)) throw Error('REDUCE node audition did not use its native node channel');
      if (id === 'bower' && !midi.some(value => value.channel === 3)) throw Error('SKEWER audition selected the wrong string');
      if (id === 'picnic') {
        app.engine.scheduleNote({ id: 'source-a', source: 'source-a', pitch: 60, velocity: .8, durationSeconds: 1 }); app.engine.scheduleNote({ id: 'source-b', source: 'source-b', pitch: 64, velocity: .8, durationSeconds: 1 });
        const atCancel = __nativeMessages.length; app.engine.cancelNotes({ source: 'source-a' });
        const cancelled = __nativeMessages.slice(atCancel).filter(value => value.type === 'kitchenMidi' && value.payload.type === 'off');
        if (cancelled.length !== 1 || cancelled[0].payload.pitch !== 60) throw Error('PICNIC released an unrelated held source');
      }
      if (id === 'proof') {
        const beforeRetrigger = __nativeMessages.length; await app.engine.trigger(60, .8, 1, 'native-retrigger'); await app.engine.trigger(60, .8, 1, 'native-retrigger'); app.engine.release(60, 'native-retrigger');
        const messages = __nativeMessages.slice(beforeRetrigger).filter(value => value.type === 'kitchenMidi').map(value => value.payload);
        if (messages.map(value => value.type).join(',') !== 'on,off,on,off' || messages[0].nativeId !== messages[1].nativeId || messages[2].nativeId !== messages[3].nativeId || messages[0].nativeId === messages[2].nativeId) throw Error('Rapid source retrigger left a native note held or reused its identity: ' + JSON.stringify(messages));
        const unowned = __nativeMessages.length; app.engine.release(99, 'not-an-owned-source'); if (__nativeMessages.length !== unowned) throw Error('An unowned editor key-up could release a DAW note');
      }
      if (id === 'batter') {
        const beforeCatalog = __nativeMessages.length; await app.engine.trigger((await app.getState()).lanes[0].id, .8, { sampleId: 'unassigned-catalog-preview' });
        if (__nativeMessages.slice(beforeCatalog).some(value => value.type === 'kitchenMidi') || !document.getElementById('kitchenNativeStatus').textContent.includes('Use this sample first')) throw Error('BATTER catalog preview played the wrong assigned lane');
      }
      let nativeInput = null;
      if (['mire', 'spool'].includes(id)) {
        const parameters = KitchenNativeEditor.descriptor.parameters, input = parameters.findIndex(value => value.path === '_nativeInput'), destination = parameters.findIndex(value => value.path === '_nativeInputDestination'), before = __nativeMessages.length;
        await app.engine.setMic(true, 2);
        const messages = __nativeMessages.slice(before).filter(value => value.type === 'kitchenSetParameter');
        if (!messages.some(value => value.payload.index === input && value.payload.normalized === 1) || !app.engine.micEnabled) throw Error('Original mic button did not enable native DAW input');
        if (destination >= 0 && !messages.some(value => value.payload.index === destination && value.payload.normalized === 2 / 3)) throw Error('REDUCE live input targeted the wrong node');
        const native = []; native[input] = 0; if (destination >= 0) native[destination] = 1 / 3;
        const beforeRestore = __nativeMessages.length; await KitchenNativeEditor.receive('kitchenParameters', native);
        if (app.engine.micEnabled || document.getElementById('mic-button').getAttribute('aria-pressed') !== 'false' || __nativeMessages.slice(beforeRestore).some(value => value.type === 'kitchenSetParameter')) throw Error('Native input restore changed the host or did not update original controls');
        if (id === 'spool') { let message = ''; try { await app.engine.startDeckRecording(0); } catch (error) { message = error.message; } if (!message.includes('Record audio in your DAW')) throw Error('ROTISSERIE attempted unsupported browser deck recording'); }
        nativeInput = { enabledThroughNativeParameter: true, destination: destination >= 0 ? 2 : null, restoredWithoutEcho: true };
      }
      return { id, facade, restoredExact: true, automation, preparation, nativeInput, clock: document.getElementById('kitchenNativeClock').textContent, nativeAudioContexts: __nativeAudioContexts, offlineRenders: __offlineRenders, workletUnavailable: context.audioWorklet === undefined, editorRate: rate, nativeMidiMessages: midi.length, diagnostics: KitchenNativeEditor.diagnostics };
    }, { facade: facades[ids.indexOf(id)], id });
    assert.equal(evidence.nativeAudioContexts, 0); assert.equal(evidence.offlineRenders, 0); assert.equal(evidence.workletUnavailable, true); assert.match(evidence.clock, /137 BPM.*Playing/); assert.deepEqual(evidence.diagnostics.errors, []);
    if (id === 'form') {
      const before = await page.evaluate(() => __nativeMessages.length); await page.locator('.track-play').first().click();
      await page.waitForFunction(before => __nativeMessages.slice(before).some(value => value.type === 'kitchenMidi' && value.payload.type === 'on'), before);
      evidence.originalPadAudition = true;
    }
    if (id === 'brine') {
      await page.locator('#saveButton').click(); await page.waitForFunction(() => __nativeMessages.some(value => value.type === 'kitchenDownload' && value.payload.filename.endsWith('.json')));
      await page.locator('#exportScope').selectOption('note');
      await page.locator('#wavButton').evaluate(element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; });
      await page.locator('#wavButton').click(); await page.waitForFunction(() => __nativeMessages.some(value => value.type === 'kitchenDownload' && value.payload.filename.endsWith('.wav')));
      evidence.exports = await page.evaluate(async () => {
        const recipe = __nativeMessages.find(value => value.type === 'kitchenDownload' && value.payload.filename.endsWith('.json')).payload, wav = __nativeMessages.find(value => value.type === 'kitchenDownload' && value.payload.filename.endsWith('.wav')).payload;
        const link = document.createElement('a'), url = URL.createObjectURL(new Blob(['detached-export'], { type: 'text/plain' })); link.href = url; link.download = 'detached.txt'; link.click(); URL.revokeObjectURL(url);
        await new Promise(resolve => setTimeout(resolve, 50));
        const detached = __nativeMessages.filter(value => value.type === 'kitchenDownload' && value.payload.filename === 'detached.txt');
        const context = new OfflineAudioContext(1, 128, 48000), oscillator = context.createOscillator(); oscillator.connect(context.destination); oscillator.start(); const rendered = await context.startRendering();
        return { recipeName: JSON.parse(atob(recipe.base64)).state.name, wavHeader: atob(wav.base64).slice(0, 4), detachedCount: detached.length, detachedText: detached.length ? atob(detached[0].payload.base64) : '', explicitOfflineAudible: rendered.getChannelData(0).some(value => value !== 0), nativeAudioContexts: __nativeAudioContexts };
      }); assert.equal(evidence.exports.wavHeader, 'RIFF'); assert.equal(evidence.exports.detachedCount, 1); assert.equal(evidence.exports.detachedText, 'detached-export'); assert(evidence.exports.explicitOfflineAudible); assert.equal(evidence.exports.nativeAudioContexts, 0);
    }
    const postAudition = await page.evaluate(() => ({ nativeAudioContexts: __nativeAudioContexts, errors: KitchenNativeEditor.diagnostics.errors })); assert.equal(postAudition.nativeAudioContexts, 0); assert.deepEqual(postAudition.errors, []);
    if (['form', 'brine', 'morsel'].includes(id)) { evidence.nativeSmoke = await page.evaluate(() => KitchenNativeEditor.runSmokeTest()); assert.equal(evidence.nativeSmoke.pass, true, JSON.stringify(evidence.nativeSmoke)); }
    const button = page.locator('button#playButton,button#play-button,button#play').first();
    if (await button.count()) { await button.click({ force: true }); assert.match(await page.locator('#kitchenNativeStatus').textContent(), /DAW/); }
    if (id === 'marinade') { await page.locator('#auditionA').click(); assert.match(await page.locator('#kitchenNativeStatus').textContent(), /Source-only previews/); }
    if (id === 'proof') {
      evidence.uiOwnership = await page.evaluate(async () => {
        await ProofApp.engine.trigger(60, .8, 20, 'close-owned'); const on = __nativeMessages.filter(value => value.type === 'kitchenMidi' && value.payload.type === 'on').at(-1).payload;
        const before = __nativeMessages.length; KitchenNativeEditor.dispose(); const messages = __nativeMessages.slice(before).filter(value => value.type === 'kitchenMidi').map(value => value.payload);
        if (messages.length !== 1 || messages[0].type !== 'off' || messages[0].nativeId !== on.nativeId) throw Error('Closing the editor did not release only its owned native note');
        return { ownedNamespace: on.nativeId >= 0x80000001, closeOffs: messages.length, globalOffs: messages.filter(value => value.type === 'allOff').length, pairedIdentity: on.nativeId === messages[0].nativeId };
      });
    }
    return evidence;
  } finally { await context.close(); }
}
async function neuralCheck(base) {
  const { context, page } = await pageFor(base, '/instrument/morsel/');
  try {
    await page.waitForFunction(() => KitchenNativeEditor.diagnostics.attached);
    const result = await page.evaluate(async () => {
      await KitchenNativeEditor.receive('kitchenReady', { state: await KitchenNativeEditor.getProject() });
      const before = __nativeMessages.length, result = await KitchenNativeEditor.runNeuralSmokeTest();
      return { ...result, nativeStateMessages: __nativeMessages.slice(before).filter(value => value.type === 'kitchenSetState').length, nativeAudioContexts: __nativeAudioContexts, workerCount: __editorWorkers };
    });
    assert.equal(result.pass, true, JSON.stringify(result)); assert.equal(result.nativeStateMessages, 0); assert.equal(result.nativeAudioContexts, 0); assert(result.workersCreated >= 2); assert.equal(result.word, 'zucchini'); assert.equal(result.signalsmith.fitCalls, 1); return result;
  } finally { await context.close(); }
}
async function effectCheck(base, definition) {
  const { context, page } = await pageFor(base, '/effect/' + definition.id + '/');
  try {
    await page.waitForFunction(() => !!window.KitchenEffectEditor);
    const evidence = await page.evaluate(async () => {
      const descriptor = KitchenNativeEditor.descriptor, original = JSON.parse(JSON.stringify(descriptor.defaultState));
      await KitchenNativeEditor.receive('kitchenReady', { descriptor, state: original });
      const controls = document.querySelectorAll('[data-control]').length;
      const select = document.querySelector('select[data-select]') || document.querySelector('#pluginSpecialEditor select');
      if (select) { select.click(); if (!select.isConnected) throw Error('A native select was replaced on opening'); select.blur(); }
      const input = document.getElementById('pluginBypass'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
      const bypass = __nativeMessages.filter(value => value.type === 'kitchenSetParameter').at(-1);
      __nativeDeliver('kitchenClock', { tempo: 143, beat: 4, playing: true });
      return { id: descriptor.sourceId, controls, parameters: descriptor.parameters.length, bypass, title: document.getElementById('pluginName').textContent, clock: document.getElementById('pluginClock').textContent, nativeAudioContexts: __nativeAudioContexts, special: !document.getElementById('pluginSpecialEditor').matches(':empty') };
    });
    assert(evidence.parameters > 0); assert(evidence.controls > 0); assert(evidence.bypass && evidence.bypass.payload.normalized === 1); assert.equal(evidence.nativeAudioContexts, 0); assert.match(evidence.clock, /143 BPM/);
    const automation = await page.evaluate(async () => {
      const parameters = KitchenNativeEditor.descriptor.parameters, index = parameters.findIndex(value => ['range', 'number'].includes(value.type));
      if (index < 0) return null;
      const d = parameters[index], list = []; list[index] = .375;
      await KitchenNativeEditor.receive('kitchenParameters', list);
      const key = d.key || d.path.replace(/^params\./, ''), actual = KitchenEffectEditor.state.params[key], expected = KitchenNativeEditor.actual(d, .375);
      if (actual !== expected) throw Error('Native effect automation did not reach the visible editor for ' + key);
      const before = __nativeMessages.length; KitchenEffectEditor.emit({ [key]: KitchenNativeEditor.actual(d, .625) });
      const parameter = __nativeMessages.slice(before).find(value => value.type === 'kitchenSetParameter');
      if (!parameter || parameter.payload.index !== index || __nativeMessages.slice(before).some(value => value.type === 'kitchenSetState')) throw Error('Effect parameter edits do not use native atomics');
      return { path: d.path, normalized: parameter.payload.normalized };
    }); evidence.automation = automation;
    const select = page.locator('select[data-select],#pluginSpecialEditor select').first();
    if (await select.count()) { const handle = await select.elementHandle(); await handle.evaluate(element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; }); await select.click(); assert(await handle.evaluate(element => element.isConnected && document.activeElement === element)); await page.keyboard.press('Escape'); }
    if (definition.id === 'ferment') {
      evidence.pagedRestoreBlocksExport = await page.evaluate(() => {
        const notes = Array.from({ length: 130 }, (_, index) => ({ pitch: 57 + index % 12, velocity: .8, startFrame: index * 4800 + 240, endFrame: index * 4800 + 2400 }));
        window.__captureTake = { token: 'restored-take', capturing: false, sampleRate: 48000, tempo: 120, frames: 130 * 4800 + 4800, notes };
        __nativeDeliver('kitchenCapture', { requestId: 'initial-restore', ok: true, take: { ...__captureTake, notes: notes.slice(0, 64), notesOffset: 0, noteCount: 130, moreNotes: true } });
        return document.getElementById('fermentMidiSave').disabled;
      }); assert.equal(evidence.pagedRestoreBlocksExport, true);
      await page.waitForFunction(() => document.getElementById('fermentMidiCount').textContent === '130' && !document.getElementById('fermentMidiSave').disabled);
      await page.evaluate(() => window.__captureTestNotes = 130);
      await page.locator('#fermentMidiPanel').evaluate(element => element.open = true);
      await page.locator('#fermentMidiStart').click(); await page.waitForFunction(() => !document.getElementById('fermentMidiStop').disabled);
      await page.locator('#fermentMidiStop').click(); await page.waitForFunction(() => !document.getElementById('fermentMidiSave').disabled);
      await page.locator('#fermentMidiSave').click(); await page.waitForFunction(() => __nativeMessages.some(value => value.type === 'kitchenDownload'));
      evidence.capture = await page.evaluate(() => {
        const file = __nativeMessages.find(value => value.type === 'kitchenDownload').payload;
        return { count: document.getElementById('fermentMidiCount').textContent, filename: file.filename, midiHeader: atob(file.base64).slice(0, 4), actions: __nativeMessages.filter(value => value.type === 'kitchenCapture').map(value => value.payload.action) };
      }); assert.equal(evidence.capture.count, '130'); assert.equal(evidence.capture.midiHeader, 'MThd'); assert.match(evidence.capture.filename, /\.mid$/);
    }
    if (definition.id === 'sunday') { evidence.nativeSmoke = await page.evaluate(() => KitchenNativeEditor.runSmokeTest()); assert.equal(evidence.nativeSmoke.pass, true, JSON.stringify(evidence.nativeSmoke)); }
    if (['broiler', 'cellar', 'cupboard'].includes(definition.id)) { await page.screenshot({ path: path.join(output, definition.id + '-desktop.png'), fullPage: true }); await page.setViewportSize({ width: 390, height: 1000 }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false); await page.screenshot({ path: path.join(output, definition.id + '-mobile.png'), fullPage: true }); }
    return evidence;
  } finally { await context.close(); }
}
(async () => {
  try {
    const base = await serve(); browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    if (process.env.KITCHEN_EDITOR_NEURAL_SMOKE) { await check('MORSEL real neural word and Signalsmith note', () => neuralCheck(base)); assert.deepEqual(report.pageErrors, []); save(); return; }
    for (const id of ids) if (!process.env.KITCHEN_EDITOR_FILTER || new RegExp(process.env.KITCHEN_EDITOR_FILTER).test(id)) await check('Original instrument editor / ' + id, () => instrumentCheck(base, id));
    for (const definition of effects) if (!process.env.KITCHEN_EDITOR_FILTER || new RegExp(process.env.KITCHEN_EDITOR_FILTER).test(definition.id)) await check('Native effect editor / ' + definition.id, () => effectCheck(base, definition));
    assert.deepEqual(report.pageErrors, [], 'No hidden editor errors'); save(); console.log('Kitchen plugin editors:', report.passed.length, 'groups passed.');
  } catch (error) { report.failure = { current, message: error.stack || String(error) }; console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); }
})();
