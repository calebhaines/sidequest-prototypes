#!/usr/bin/env node
/* Reproducible native resources from the canonical Kitchen web sources. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'), repository = path.dirname(root);
const generated = path.join(root, 'generated');
const requirePlugin = createRequire(path.join(root, 'package.json'));
let esbuild;
try { esbuild = requirePlugin('esbuild'); }
catch { esbuild = createRequire(path.join(repository, 'package.json'))('esbuild'); }
const instruments = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel', 'fable', 'roux', 'batter', 'proof', 'marinade', 'picnic', 'morsel', 'heirloom', 'brine', 'citrus'];
const inserts = ['prism', 'velvet', 'cinder', 'undertow', 'parallax', 'vestige', 'halo', 'tremor', 'broiler', 'glaze', 'scales', 'strainer', 'swirl', 'crumble', 'saute', 'preserve', 'tinpan', 'ferment', 'sunday', 'cellar', 'board', 'cupboard'];
const allowIncomplete = process.argv.includes('--allow-incomplete');
const read = name => fs.readFileSync(path.join(repository, name), 'utf8');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const mkdir = name => fs.mkdirSync(name, { recursive: true });
mkdir(generated); mkdir(path.join(generated, 'ui')); mkdir(path.join(generated, 'assets'));

function manifest(name, optional = false) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) { if (optional) return null; throw Error('Missing adapter manifest: ' + name); }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const effectManifest = manifest('effects-manifest.json');
const adapterManifests = ['core-instruments-manifest.json', 'webaudio-instruments-manifest.json', 'morsel-manifest.json'].map(name => ({ name, data: manifest(name, allowIncomplete) })).filter(item => item.data);
function entries(data) {
  if (Array.isArray(data)) return data;
  if (data.instruments) return data.instruments;
  if (data.products) return data.products;
  if (data.instrument) return [data.instrument];
  if (data.id) return [data];
  throw Error('Adapter manifest has no products');
}
const instrumentEntries = adapterManifests.flatMap(item => entries(item.data).map(value => ({ ...value, manifest: item.name })));
for (const id of instruments) if (!instrumentEntries.some(value => value.id === id) && !allowIncomplete) throw Error('Missing native instrument adapter: ' + id);

const sourceNames = [], sourceHashes = [];
const add = name => { if (!sourceNames.includes(name)) sourceNames.push(name); };
add('plugins/js/environment.js');
add('plugins/js/vendor-entry.js');
for (const name of [...effectManifest.catalogSources, ...effectManifest.dspSources]) add(name.includes('/') ? name : 'loom/' + name);
for (const entry of instrumentEntries) for (const name of [...(entry.nativeDependencies || []), ...(entry.sourceFiles || entry.sources || [])]) add(typeof name === 'string' ? name : name.path);
add('plugins/js/effects.js');
const bundles = new Set(['plugins/js/vendor-entry.js', 'plugins/js/hotplate-entry.js']);
const bundleOptions = new Map([['plugins/js/hotplate-entry.js', { globalName: 'KitchenHotplateAudio' }]]);
for (const item of adapterManifests) for (const value of item.data.bundles || []) {
  const entry = typeof value === 'string' ? value : value.entry || value.entryPoint || value.source;
  if (!entry) throw Error('A native bundle needs its source entry');
  add(entry); bundles.add(entry); bundleOptions.set(entry, typeof value === 'object' && value.globalName ? { globalName: value.globalName } : {});
}
for (const item of adapterManifests) for (const name of item.data.bundleEntries || []) { add(name); bundles.add(name); }
for (const entry of instrumentEntries) for (const name of entry.bundleEntries || []) { add(name); bundles.add(name); }

async function source(name) {
  if (!fs.existsSync(path.join(repository, name))) throw Error('Missing canonical native dependency: ' + name);
  const raw = fs.readFileSync(path.join(repository, name)); sourceHashes.push({ path: name, bytes: raw.length, sha256: digest(raw) });
  let code = raw.toString('utf8');
  if (bundles.has(name) || name.endsWith('.ts')) {
    const output = await esbuild.build({ entryPoints: [path.join(repository, name)], bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', legalComments: 'inline', define: { 'process.env.NODE_ENV': '"production"' }, ...bundleOptions.get(name) });
    code = output.outputFiles[0].text;
  }
  return '\n;/* Canonical source: ' + name.replace(/\*\//g, '') + ' */\n' + code + '\n';
}
let code = '';
for (const name of sourceNames) code += await source(name);

// Metadata generation does not run an audio context or instrument performance.
// Seed incidental project IDs so rebuilding the same checkout is reproducible.
let seed = 0x4b697463;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
const math = Object.create(Math); math.random = () => next() / 4294967296;
const sandbox = { console, Math: math, TextEncoder, TextDecoder, URL, Blob,
  crypto: { getRandomValues(array) { for (let i = 0; i < array.length; i++) array[i] = next(); return array; }, randomUUID() { return Array.from({ length: 4 }, () => next().toString(16).padStart(8, '0')).join('-'); } },
  btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
sandbox.window = sandbox; sandbox.self = sandbox; vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'kitchen-native-sources.js', timeout: 60000 });
const effects = sandbox.KitchenEffectPlugins?.definitions();
if (!effects || inserts.some(id => !effects.some(value => value.id === id))) throw Error('The generated effect backend does not cover every GALLEY insert');
const dynamicDefinitions = new Map();
for (const namespace of ['KitchenCoreInstruments', 'KitchenWebAudioInstruments', 'KitchenMorselPlugin']) {
  const adapter = sandbox[namespace];
  if (adapter?.definitions) for (const value of adapter.definitions()) dynamicDefinitions.set(value.id, value);
}
for (const id of instruments) if (!dynamicDefinitions.has(id) && !allowIncomplete) throw Error('No functioning native adapter namespace for ' + id);

function parameter(value) {
  const item = { ...value };
  item.path ||= item.id || item.key;
  if (!item.path) throw Error('A native parameter needs a stable path');
  item.id = item.path; item.name = item.label || item.name || item.path; item.label = item.name;
  item.type = item.type === 'number' ? 'range' : item.type || 'range';
  if (item.type === 'select') {
    const raw = item.options || item.values || [];
    item.options = raw.map(value => typeof value === 'object' ? { value: value.value ?? value.id, label: value.label ?? value.name ?? String(value.value ?? value.id) } : { value, label: String(value) });
    if (!item.options.length) throw Error('An enum parameter needs actual options: ' + item.path);
    item.choices = item.options.map(value => value.label); item.min = 0; item.max = item.options.length - 1; item.step = 1;
    item.defaultNormalized = item.max ? Math.max(0, item.options.findIndex(value => value.value === item.default)) / item.max : 0;
  } else if (item.type === 'boolean') {
    item.min = 0; item.max = 1; item.step = 1; item.defaultNormalized = item.default ? 1 : 0;
  } else {
    if (![item.min, item.max, item.default].every(Number.isFinite) || item.max < item.min) throw Error('Invalid canonical parameter bounds: ' + item.path);
    item.defaultNormalized = item.max === item.min ? 0 : Math.max(0, Math.min(1, (item.default - item.min) / (item.max - item.min)));
  }
  item.normalization = 'linear'; item.normalizedDefault = item.defaultNormalized; item.unit ||= '';
  return item;
}
function codeFor(id) { return Array.from(crypto.createHash('sha256').update('sidequest-kitchen-vst3:' + id).digest().subarray(0, 4), value => String.fromCharCode(65 + value % 26)).join(''); }
const products = [];
for (const entry of instrumentEntries) {
  const dynamic = dynamicDefinitions.get(entry.id) || {};
  products.push({ ...dynamic, ...entry, kind: 'instrument', sourceId: entry.id, definition: { ...dynamic, ...entry } });
}
for (const effect of effects) products.push({ ...effect, sourceId: effect.id, definition: effect });
const codes = new Set();
for (const product of products) {
  product.code = codeFor(product.id); if (codes.has(product.code)) throw Error('Native plugin code collision: ' + product.id); codes.add(product.code);
  product.bundleId = 'com.sidequest.kitchen.' + product.id; product.version = '1.0.0';
  product.parameters = (product.parameters || []).map(parameter);
  if (new Set(product.parameters.map(value => value.path)).size !== product.parameters.length) throw Error('Duplicate native parameter IDs: ' + product.id);
  product.defaultState = product.defaultState ?? product.defaults ?? null;
  if (product.kind === 'instrument' && !product.parameters.some(value => value.path === '_nativeSequence' || value.path === 'followHost')) product.parameters.unshift(parameter({ path: '_nativeSequence', name: 'Follow DAW pattern', type: 'boolean', default: true }));
  product.acceptsMidi = product.kind === 'instrument' || product.acceptsMidi === true;
  product.producesMidi = product.producesMidi === true;
  product.latencySamples ||= product.runtime === 'web-audio-graph' ? 128 : 0;
  product.definition.parameters = product.parameters;
  product.definition.defaultState = product.defaultState;
  // Large factory/sample states belong only to the selected product's assets.
  if (JSON.stringify(product.defaultState).length > 65536) {
    const relative = 'assets/' + product.id + '/default-state.json'; mkdir(path.dirname(path.join(generated, relative)));
    fs.writeFileSync(path.join(generated, relative + '.gz'), zlib.gzipSync(Buffer.from(JSON.stringify(product.defaultState)), { level: 9, mtime: 0 }));
    product.defaultStateResource = 'default-state.json'; product.defaultState = null;
    product.definition.defaultState = null; delete product.definition.defaults; delete product.defaults;
  }
  for (const asset of product.assets || []) {
    const from = path.resolve(repository, asset.source), target = path.join(generated, 'assets', product.id, asset.target || path.basename(from));
    if (!from.startsWith(repository + path.sep)) throw Error('Resource source is outside the repository');
    mkdir(path.dirname(target)); const bytes = fs.readFileSync(from);
    if (asset.gzip || target.endsWith('.gz') && !from.endsWith('.gz')) fs.writeFileSync(target.endsWith('.gz') ? target : target + '.gz', zlib.gzipSync(bytes, { level: 9, mtime: 0 }));
    else fs.writeFileSync(target, bytes);
  }
  if (product.defaultBankResource && !(product.assets || []).some(asset => (asset.target || '').replace(/\.gz$/, '') === product.defaultBankResource) && !allowIncomplete) throw Error('Missing prepared default bank resource: ' + product.id);
}
const expected = instruments.length + inserts.length + 2;
if (!allowIncomplete && products.length !== expected) throw Error('Expected all ' + expected + ' native products; generated ' + products.length);
const manifestValue = { format: 'kitchen-native-products', version: 1, products };
fs.writeFileSync(path.join(generated, 'products.json'), JSON.stringify(manifestValue, null, 2) + '\n');
fs.writeFileSync(path.join(generated, 'products.cmake'), products.map(value => 'kitchen_add_product(' + value.id + ' ' + JSON.stringify(value.name) + ' ' + value.code + ' ' + value.kind + ')').join('\n') + '\n');

const bridge = read('plugins/web/editor-bridge.js');
const closeScript = value => value.replace(/<\/script/gi, '<\\/script');
for (const product of products) {
  const descriptor = '<script>window.KitchenPluginDescriptor=' + json(product) + ';window.KitchenPluginNative=true;</script>';
  let html;
  if (product.kind === 'instrument') {
    const name = product.id === 'form' ? 'music/form/index.html' : product.id + '/index.html';
    html = read(name);
    if (product.id === 'form' && !/\b\w+\.FormApp\s*=/.test(html)) {
      const host = read('loom/instrument-host.js'), match = host.match(/const expose = ('(?:[^'\\]|\\.)*');/);
      if (!match) throw Error('HOTPLATE canonical facade exposure was not found');
      const expose = vm.runInNewContext(match[1]);
      const signature = 'We.current={project:f,masterVolume:Te,solo:ae};';
      if (!html.includes(signature)) throw Error('This HOTPLATE version needs an updated host adapter');
      html = html.replace(signature, signature + expose);
    }
    html = html.replace(/<head([^>]*)>/i, '<head$1>' + descriptor + '<script>' + closeScript(bridge) + '</script>');
    if (product.id === 'morsel' && fs.existsSync(path.join(root, 'js/morsel-preparation.js'))) html = html.replace(/<\/body>/i, '<script>' + closeScript(read('plugins/js/morsel-preparation.js')) + '</script></body>');
  } else {
    html = read('plugins/web/effect-editor.html');
    const styles = ['plugins/web/effect-editor.css', 'loom/deluxe.css', 'loom/svt.css', 'loom/guitar-pedals.css', 'loom/cabinet.css'].map(read).join('\n');
    const scripts = [bridge, ...['loom/deluxe-ui.js', 'loom/svt-ui.js', 'loom/guitar-pedals-ui.js', 'loom/cabinet-ui.js', 'plugins/web/effect-editor.js'].map(read)].join('\n');
    html = html.replace('<!-- KITCHEN_PLUGIN_DESCRIPTOR -->', descriptor).replace('<!-- KITCHEN_EFFECT_STYLES -->', '<style>' + styles + '</style>').replace('<!-- KITCHEN_EFFECT_SCRIPTS -->', '<script>' + closeScript(scripts) + '</script>');
  }
  fs.writeFileSync(path.join(generated, 'ui', product.id + '.html'), html);
}
// NativeRuntime installs only this instance's descriptor before evaluating DSP.
// Avoid parsing and retaining the other 41 products' recipes in every instance.
code += await source('plugins/js/host-runtime.js');
fs.writeFileSync(path.join(generated, 'runtime.js'), code);
const summary = { version: 1, generatedFromCanonicalSources: true, complete: products.length === expected, instruments: products.filter(value => value.kind === 'instrument').length, effects: products.filter(value => value.kind === 'effect').length, products: products.map(({ id, name, kind, code, parameters }) => ({ id, name, kind, code, parameterCount: parameters.length })), sourceFiles: sourceHashes, runtimeSHA256: digest(code) };
fs.writeFileSync(path.join(generated, 'source-manifest.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ generated, complete: summary.complete, instruments: summary.instruments, effects: summary.effects, runtimeBytes: Buffer.byteLength(code), runtimeSHA256: summary.runtimeSHA256 }));
