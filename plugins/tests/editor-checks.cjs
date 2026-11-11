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
  const file = path.join(root, id === 'form' ? 'music/form/index.html' : id + '/index.html'); let html = fs.readFileSync(file, 'utf8');
  if (id === 'form' && !html.includes('FormApp')) {
    const marker = 'We.current={project:f,masterVolume:Te,solo:ae};'; assert(html.includes(marker), 'HOTPLATE facade injection needs its current reducer signature');
    const expose = 'window.FormApp={getState:()=>pn(We.current.project),getProject:()=>pn(We.current.project),isPlaying:()=>q,get engine(){return Ge.current},prepare:()=>il().preload(We.current.project.sounds),play:()=>_(!0),stop:()=>{_(!1);Ge.current?.stopAll()},panic:()=>{_(!1);Ge.current?.stopAll()},setTempo:value=>c({type:"change",update:p=>({...p,bpm:Math.max(40,Math.min(240,Number(value)||120))})}),loadState:value=>{const p=value?.project||value;if(!sf(p))throw Error("Invalid HOTPLATE project.");_(!1);Ge.current?.stopAll();c({type:"load",project:{...p,sounds:p.sounds.map(Ll)}});S(0);ce(null)}};';
    html = html.replace(marker, marker + expose);
  }
  const parameters = [{ path: '_nativeSequence', type: 'boolean', default: true }, ...(instruments.get(id)?.parameters || [])].map(value => ({ ...value, type: value.type === 'number' ? 'range' : value.type, path: value.path || value.id || value.key, options: value.options || value.values?.map(option => ({ value: option, label: String(option) })) }));
  const descriptor = { id: 'instrument-' + id, sourceId: id, kind: 'instrument', name: names[ids.indexOf(id)], parameters };
  return html.replace(/<head(?:\s[^>]*)?>/i, match => match + script('window.KitchenPluginDescriptor=' + JSON.stringify(descriptor)) + script(bridge));
}
function effectHTML(definition) {
  const descriptor = { id: 'effect-' + definition.id, sourceId: definition.id, kind: 'effect', name: definition.name, definition, parameters: definition.parameters, defaultState: definition.defaults };
  const styles = ['plugins/web/effect-editor.css', 'loom/deluxe.css', 'loom/svt.css', 'loom/guitar-pedals.css', 'loom/cabinet.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const code = [bridge, ...['loom/deluxe-ui.js', 'loom/svt-ui.js', 'loom/guitar-pedals-ui.js', 'loom/cabinet-ui.js', 'plugins/web/effect-editor.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8'))].join('\n');
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
    window.__nativeMessages = []; window.__nativeAudioContexts = 0; window.__offlineRenders = 0;
    const Original = window.AudioContext;
    if (Original) { function Counted(...args) { window.__nativeAudioContexts++; return new Original(...args); } Counted.prototype = Original.prototype; window.AudioContext = Counted; window.webkitAudioContext = Counted; }
    if (window.OfflineAudioContext) { const start = OfflineAudioContext.prototype.startRendering; OfflineAudioContext.prototype.startRendering = function (...args) { window.__offlineRenders++; return start.apply(this, args); }; }
    const listeners = new Map(); let serial = 0;
    window.__nativeDeliver = (type, value) => { for (const record of listeners.values()) if (record.type === type) record.callback(value); };
    window.__JUCE__ = { backend: {
      addEventListener(type, callback) { const id = ++serial; listeners.set(id, { type, callback }); return id; },
      removeEventListener(id) { listeners.delete(id); },
      emitEvent(type, payload) { window.__nativeMessages.push({ type, payload }); }
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
        if (Math.abs(automated - expected) > 1e-6) throw Error(id + ' host automation did not reach original controls: ' + JSON.stringify({ path: d.path, expected, automated, diagnostics: KitchenNativeEditor.diagnostics }));
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
        await new Promise(resolve => requestAnimationFrame(resolve)); document.getElementById('kitchenNativeSequence').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 650));
        const messages = __nativeMessages.slice(before), parameters = messages.filter(value => value.type === 'kitchenSetParameter'), recipes = messages.filter(value => value.type === 'kitchenSetState');
        if (!parameters.some(value => value.payload.index === index)) throw Error(id + ' original control edit did not reach its native parameter');
        if (recipes.length) throw Error(id + ' parameter-only edit rebuilt the full native recipe');
        automation = { path: d.path, restored: automated, parameterMessages: parameters.length, fullRecipeMessages: recipes.length };
      }
      __nativeDeliver('kitchenClock', { tempo: 137, beat: 9.25, playing: true, sampleRate: 48000, samplePosition: 194400, revision: 2 });
      const context = new AudioContext(), rate = context.sampleRate;
      await context.resume(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.start();
      await context.close();
      const before = __nativeMessages.length;
      if (app.engine?.noteOn) { app.engine.noteOn({ id: 'editor-note', pitch: 60, note: 60, velocity: .75 }); app.engine.noteOff?.({ id: 'editor-note', pitch: 60, note: 60 }); }
      const midi = __nativeMessages.slice(before).filter(value => value.type === 'kitchenMidi').map(value => value.payload);
      return { id, facade, restoredExact: true, automation, clock: document.getElementById('kitchenNativeClock').textContent, nativeAudioContexts: __nativeAudioContexts, offlineRenders: __offlineRenders, workletUnavailable: context.audioWorklet === undefined, editorRate: rate, nativeMidiMessages: midi.length, diagnostics: KitchenNativeEditor.diagnostics };
    }, { facade: facades[ids.indexOf(id)], id });
    assert.equal(evidence.nativeAudioContexts, 0); assert.equal(evidence.offlineRenders, 0); assert.equal(evidence.workletUnavailable, true); assert.match(evidence.clock, /137 BPM.*Playing/); assert.deepEqual(evidence.diagnostics.errors, []);
    const button = page.locator('button#playButton,button#play-button,button#play').first();
    if (await button.count()) { await button.click({ force: true }); assert.match(await page.locator('#kitchenNativeStatus').textContent(), /DAW/); }
    return evidence;
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
    const select = page.locator('select[data-select],#pluginSpecialEditor select').first();
    if (await select.count()) { const handle = await select.elementHandle(); await handle.evaluate(element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; }); await select.click(); assert(await handle.evaluate(element => element.isConnected && document.activeElement === element)); await page.keyboard.press('Escape'); }
    if (['broiler', 'cellar', 'cupboard'].includes(definition.id)) { await page.screenshot({ path: path.join(output, definition.id + '-desktop.png'), fullPage: true }); await page.setViewportSize({ width: 390, height: 1000 }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false); await page.screenshot({ path: path.join(output, definition.id + '-mobile.png'), fullPage: true }); }
    return evidence;
  } finally { await context.close(); }
}
(async () => {
  try {
    const base = await serve(); browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    for (const id of ids) if (!process.env.KITCHEN_EDITOR_FILTER || new RegExp(process.env.KITCHEN_EDITOR_FILTER).test(id)) await check('Original instrument editor / ' + id, () => instrumentCheck(base, id));
    for (const definition of effects) if (!process.env.KITCHEN_EDITOR_FILTER || new RegExp(process.env.KITCHEN_EDITOR_FILTER).test(definition.id)) await check('Native effect editor / ' + definition.id, () => effectCheck(base, definition));
    assert.deepEqual(report.pageErrors, [], 'No hidden editor errors'); save(); console.log('Kitchen plugin editors:', report.passed.length, 'groups passed.');
  } catch (error) { report.failure = { current, message: error.stack || String(error) }; console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); }
})();
