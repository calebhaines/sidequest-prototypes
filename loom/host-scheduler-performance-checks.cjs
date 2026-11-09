'use strict';
// Portable host/scheduler regressions. Capture musical traces only from the
// immutable pre-audit release; ordinary checks do not invoke Git or a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const BASELINE = '5df579ee99caa7a73222f8d6a52268be4cab3c75';
const FROZEN = /* FROZEN-BEGIN */ {
  "steady": {
    "traceSHA256": "f97cb521522bb7da7e840b482bda1788fae95da5b4d09fbab14848b7f1546c9c",
    "events": 14,
    "notes": 9,
    "exports": 60,
    "signatures": 324,
    "prepares": 30
  },
  "edited": {
    "traceSHA256": "8f592c6fba1165d95ccf0127a59283f1b13352df357947091c94f27fb51799e9",
    "events": 33,
    "notes": 7,
    "exports": 56,
    "signatures": 304,
    "prepares": 29
  },
  "legacy": {
    "traceSHA256": "8f592c6fba1165d95ccf0127a59283f1b13352df357947091c94f27fb51799e9",
    "events": 33,
    "notes": 7,
    "exports": 56,
    "signatures": 304,
    "prepares": 29
  }
} /* FROZEN-END */;
const root = path.join(__dirname, '..');
const sourceFile = file => file.startsWith('loom/') ? path.join(__dirname, file.slice(5)) : fs.existsSync(path.join(__dirname, file)) ? path.join(__dirname, file) : path.join(root, file);
const read = file => fs.readFileSync(sourceFile(file), 'utf8');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
function scope() {
  const timers = new Map(); let timer = 0;
  const s = { console, TextEncoder, DOMException, AbortController, URL, Event,
    setTimeout: fn => { const id = ++timer; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => ++timer, clearInterval() {},
  };
  s.window = s; s.__timers = timers; vm.createContext(s);
  vm.runInContext(read('shared/pattern-schema.js'), s); return s;
}
function packet(pitch = 60, lyric = 'ah') {
  return { format: 'musiclab-pattern', version: 1, name: 'Host revision fixture', sourceApp: 'morsel', kind: 'notes', tempo: 120, swing: 0, lengthBeats: 4,
    meter: [4, 4], voices: [{ id: 'tone', name: 'Tone' }], seed: 17, tags: [],
    notes: [{ id: 'n1', pitch, beat: 0, duration: .75, velocity: .8, probability: 1, voice: 'tone', lyric, locks: { cutoff: 1700 } },
      { id: 'n2', pitch: 67, beat: 2, duration: 1, velocity: .6, probability: 1, voice: 'tone', lyric: 'mm' }] };
}
async function settle(playback) {
  for (let i = 0; i < 100; i++) {
    await Promise.resolve();
    if (!playback.refreshing && ![...playback.tracks.values()].some(entry => entry.preparing) && !playback.addingTracks.size) return;
  }
  throw Error('The scheduler fixture did not finish its asynchronous work.');
}
async function scenario(source, name) {
  const s = scope(); vm.runInContext(source, s);
  const revisioned = name !== 'legacy', edited = name !== 'steady';
  let revision = 1, sourcePattern = packet(), fallbackLyric = 'ah', exports = 0, signatures = 0, prepares = 0, changedDuringPrepare = false, loop = true;
  const trace = [], state = { tempo: 120, tracks: [{ id: 'track-1', name: 'Voice', instrument: { id: 'morsel' }, instrumentLive: true, disabled: false, clips: [] }] };
  const clock = { tempo: 120, contextTime: 0, beat: 0, absoluteBeat: 0, playing: false, revision: 1, cycle: 0, loopEnabled: true, loopStart: 0, loopEnd: 16, endBeat: 16, countInBeatsRemaining: 0 };
  const adapter = { notes: { voices: [{ id: 'tone', name: 'Tone' }], pitched: true, scheduledCancel: true }, patternImport: { mode: 'notes' },
    get nativeSequenceLoop() { return loop; }, exportPattern() {}, prepare: async () => {},
    get preparationSignature() { signatures++; return fallbackLyric; },
    async preparePattern() { prepares++; await Promise.resolve(); if (changedDuringPrepare) { changedDuringPrepare = false; sourcePattern = packet(69, 'ee'); fallbackLyric = 'ee'; revision++; } },
    scheduleNote() {},
  };
  const host = { records: new Map([['track-1', { ready: Promise.resolve() }]]),
    getPatternAdapter: () => adapter, getPatternRevision: () => revisioned && !state.tracks[0].disabled ? revision : null,
    async exportPattern() { exports++; await Promise.resolve(); return s.MusicLabPatternSchema.normalize(sourcePattern); },
    command: async () => true, setClockDriven() {}, transportInstrument() {},
    cancelNotes(id, options) { trace.push(['cancel', id, plain(options)]); },
    scheduleNote(id, event) { trace.push(['note', id, plain(event)]); return true; },
  };
  const audio = { getTransport: () => clock, subscribeTransport: () => () => {} };
  const playback = new s.LoomNotePlayback({ audio, host, getState: () => state });
  await playback.prepare(); clock.playing = true; playback.start(); await settle(playback);
  for (let tick = 1; tick <= 320; tick++) {
    clock.contextTime = tick * .025; clock.absoluteBeat += .025 * clock.tempo / 60; clock.cycle = Math.floor(clock.absoluteBeat / 16); clock.beat = clock.absoluteBeat % 16;
    if (edited) {
      if (tick === 30) { sourcePattern = packet(62, 'oo'); fallbackLyric = 'oo'; revision++; }
      if (tick === 70) { loop = false; revision++; }
      if (tick === 100) { sourcePattern = packet(65, 'sh'); fallbackLyric = 'sh'; changedDuringPrepare = true; revision++; }
      if (tick === 130) { state.tempo = clock.tempo = 100; sourcePattern.tempo = 100; revision++; }
      if (tick === 170 || tick === 190) { state.tracks[0].instrumentLive = tick === 190; playback.setState(); }
      if (tick === 210 || tick === 230) { state.tracks[0].disabled = tick === 210; playback.setState(); }
      if (tick === 260) { playback.stop(); await playback.prepare(); playback.start(); }
      if (tick === 280) { clock.revision++; clock.absoluteBeat = clock.beat = clock.cycle = 0; }
    }
    playback._tick(); await settle(playback);
  }
  playback.dispose();
  return { traceSHA256: hash(trace), events: trace.length, notes: trace.filter(row => row[0] === 'note').length, exports, signatures, prepares };
}
async function hostChecks() {
  const s = scope(), embedded = { brine: '<html>bundled</html>', grain: '<html>legacy</html>' };
  s.LoomEmbeddedInstruments = embedded;
  class Frame { constructor() { this.contentWindow = {}; } removeAttribute() {} }
  s.HTMLIFrameElement = Frame; vm.runInContext(read('loom/instrument-host.js'), s);
  const host = new s.LoomInstrumentHost({ baseURL: 'http://localhost/', getTrackInput() {} });
  let adapter = { exportPattern: () => packet(), setState: async () => {} };
  host._load = async record => { record.loaded = record.initialized = true; record.iframe.contentWindow = { MusicLabPatternInstrument: adapter, __LoomBridge: { adapter, mute() {}, setTempo() {}, dispose: async () => {}, storage: {} } }; return true; };
  await host.load('trusted', { id: 'brine' }, new Frame());
  const record = host.records.get('trusted'), before = host.getPatternRevision('trusted');
  assert.equal(typeof before, 'number'); assert.equal(host.getPatternRevision('trusted'), before);
  host._notify(record, 'change', null); assert.notEqual(host.getPatternRevision('trusted'), before, 'Edits invalidate immediately, before the delayed snapshot');
  const value = await host.exportPattern('trusted'); value.notes[0].pitch = 1; value.notes[0].locks.cutoff = 20;
  assert.equal((await host.exportPattern('trusted')).notes[0].pitch, 60, 'Trusted validation still detaches notes');
  assert.equal((await host.exportPattern('trusted')).notes[0].locks.cutoff, 1700, 'Trusted validation still detaches locks');
  const oldRevision = host.getPatternRevision('trusted'); adapter = { ...adapter }; record.iframe.contentWindow.MusicLabPatternInstrument = adapter;
  assert.notEqual(host.getPatternRevision('trusted'), oldRevision, 'Replacing the adapter invalidates its revision');
  adapter.tempo = async () => {}; record.iframe.contentWindow.__LoomBridge.adapter = adapter;
  record.iframe.contentWindow.__LoomBridge.command = (kind, value) => adapter[kind](value);
  const beforeTempo = host.getPatternRevision('trusted'); await host._tempo(record, record.tempo);
  assert.equal(host.getPatternRevision('trusted'), beforeTempo, 'Repeated equal tempo does not dirty every Live pattern');
  await host._tempo(record, 137); assert.notEqual(host.getPatternRevision('trusted'), beforeTempo, 'A real tempo edit invalidates Live patterns');
  let importedStorage = null;
  Object.defineProperty(record.iframe.contentWindow.__LoomBridge, 'storage', { get: () => { if (importedStorage) return importedStorage; const value = { recipe: '{"notes":[60,67]}' }; Object.defineProperty(value, '__proto__', { value: 'stored key', enumerable: true }); return value; } });
  const snapshot = await host._snapshotRecord(record); snapshot.storage.recipe = 'edited';
  assert.equal((await host._snapshotRecord(record)).storage.recipe, '{"notes":[60,67]}', 'The bridge supplies an already detached storage snapshot');
  assert.equal(Object.getPrototypeOf(snapshot.storage), vm.runInContext('Object.prototype', s), 'Stored keys must belong to the parent realm so a closed iframe is not retained');
  assert.equal(Object.getOwnPropertyDescriptor(snapshot.storage, '__proto__').value, 'stored key', 'Storage keys retain ordinary data-property semantics');
  importedStorage = { nested: { value: 1 } }; const nestedSnapshot = await host._snapshotRecord(record); nestedSnapshot.storage.nested.value = 2;
  assert.equal(importedStorage.nested.value, 1, 'Non-string imported storage retains legacy deep-copy isolation');
  assert.equal(Object.getPrototypeOf(nestedSnapshot.storage.nested), vm.runInContext('Object.prototype', s)); importedStorage = null;
  let release; adapter.setState = () => new Promise(resolve => { release = resolve; });
  record.iframe.contentWindow.__LoomBridge.command = (kind, value) => adapter[kind](value);
  const restoring = host._restore(record, {}); assert.equal(host.getPatternRevision('trusted'), null, 'A restore in progress cannot reuse prepared data'); release(); await restoring;
  assert.equal(typeof host.getPatternRevision('trusted'), 'number');
  await host.load('uploaded', { id: 'brine', html: '<html>uploaded</html>' }, new Frame());
  const manifestURL = host.manifest.find(item => item.id === 'brine').url;
  await host.load('manifest-url', { id: 'brine', url: manifestURL }, new Frame());
  assert.equal(typeof host.getPatternRevision('manifest-url'), 'number', 'Real card/saved descriptors retain their manifest URL while loading canonical embedded HTML');
  await host.load('ignored-url', { id: 'brine', url: '/custom.html' }, new Frame());
  assert.equal(typeof host.getPatternRevision('ignored-url'), 'number', 'A URL ignored in favor of canonical embedded HTML does not change its trust');
  const bundledBrine = embedded.brine; delete embedded.brine;
  await host.load('fetched-url', { id: 'brine', url: '/custom.html' }, new Frame()); embedded.brine = bundledBrine;
  await host.load('legacy', { id: 'grain' }, new Frame());
  for (const id of ['uploaded', 'fetched-url', 'legacy']) assert.equal(host.getPatternRevision(id), null, id + ' retains legacy polling');
  adapter.exportPattern = () => ({ toJSON: () => packet(72) });
  assert.equal((await host.exportPattern('uploaded')).notes[0].pitch, 72, 'Custom exports retain JSON/toJSON conversion semantics');
  const other = new s.LoomInstrumentHost({ embedded: { ...embedded }, baseURL: 'http://localhost/', getTrackInput() {} }); other._load = host._load;
  await other.load('override', { id: 'brine' }, new Frame()); assert.equal(other.getPatternRevision('override'), null, 'An externally supplied instrument map keeps polling');
  host.disabledTracks.add('trusted'); assert.equal(host.getPatternRevision('trusted'), null);
  host.disabledTracks.delete('trusted'); await host.unload('trusted'); assert.equal(host.getPatternRevision('trusted'), null);
  host.dispose(); other.dispose(); return 11;
}
function bridgeChecks() {
  const s = scope(), calls = [], listeners = new Map(); let serial = 0;
  class Node {
    constructor() { this.id = ++serial; this.gain = { value: 1, setValueAtTime() {} }; }
    connect(...args) { calls.push(['connect', this.id, args.map(value => value?.id ?? value)]); return args[0]; }
    disconnect(...args) { calls.push(['disconnect', this.id, args.length]); }
    addEventListener(type, fn) { listeners.set(this.id + type, fn); }
    start(...args) { calls.push(['start', this.id, args]); }
    stop(...args) { calls.push(['stop', this.id, args]); }
  }
  const input = new Node(), raw = { state: 'running', currentTime: 1, createGain() { assert.equal(this, raw); return new Node(); }, createOscillator() { assert.equal(this, raw); return new Node(); }, probe(...args) { assert.equal(this, raw); calls.push(['context', args.map(value => value === raw ? 'raw' : value?.id ?? value)]); return 17; } };
  const record = { active: true, soundEnabled: false, storage: { sample: 'sample-data', nested: { value: 1 } }, tempo: 120, trackId: 'track-1', getContext: () => raw, getInput: () => input, notify() {} };
  s.parent = { __LoomHostRegistry: { fixture: record } }; s.navigator = {}; s.document = { addEventListener() {} }; s.addEventListener = () => {};
  vm.runInContext(read('loom/host-bridge.js'), s); vm.runInContext(s.LoomHostBridge.source('fixture'), s);
  vm.runInContext('globalThis.__mapCalls=0;const originalMap=Array.prototype.map;Array.prototype.map=function(...args){globalThis.__mapCalls++;return originalMap.apply(this,args)};', s);
  const context = s.MusicLabHost.context, a = context.createGain(), b = context.createOscillator();
  b.connect(a); a.connect(context.destination); b.start(2); b.stop(3); a.disconnect();
  assert.equal(context.probe(context, a, 5), 17);
  assert.equal(s.__mapCalls, 0, 'Native proxy calls cannot allocate a second mapped argument array');
  assert(calls.some(row => row[0] === 'context' && row[1][0] === 'raw' && typeof row[1][1] === 'number'), 'Proxy context and node arguments still unwrap');
  assert(calls.some(row => row[0] === 'start' && row[2][0] === 2), 'Native start timestamps stay exact');
  const nested = s.__LoomBridge.storage; nested.nested.value = 2;
  assert.equal(record.storage.nested.value, 1, 'Bridge storage keeps deep-copy compatibility for imported non-string values');
  s.localStorage.removeItem('nested'); const strings = s.__LoomBridge.storage; strings.sample = 'edited';
  assert.equal(s.localStorage.getItem('sample'), 'sample-data', 'The fast string map remains a detached snapshot');
  return 3;
}
async function main() {
  const names = ['steady', 'edited', 'legacy'];
  if (process.argv.includes('--record-baseline')) {
    const before = execFileSync('git', ['show', BASELINE + ':loom/note-playback.js'], { cwd: root, encoding: 'utf8' });
    const frozen = {}; for (const name of names) frozen[name] = await scenario(before, name);
    const text = fs.readFileSync(__filename, 'utf8').replace(/\/\* FROZEN-BEGIN \*\/[\s\S]*?\/\* FROZEN-END \*\//, '/* FROZEN-BEGIN */ ' + JSON.stringify(frozen, null, 2) + ' /* FROZEN-END */');
    fs.writeFileSync(__filename, text); console.log('Captured immutable scheduler traces from ' + BASELINE); return;
  }
  assert(FROZEN, 'Capture immutable pre-audit traces first');
  const results = {}; for (const name of names) { const result = results[name] = await scenario(read('loom/note-playback.js'), name); assert.equal(result.traceSHA256, FROZEN[name].traceSHA256, name + ': exact timestamps, cancellations, durations, lyrics and loop transitions'); }
  assert(results.steady.exports < FROZEN.steady.exports / 4, 'Unedited trusted Live patterns avoid repeated exports');
  assert(results.steady.signatures < FROZEN.steady.signatures / 4, 'Unedited trusted speech avoids repeated preparation-signature reads');
  assert.equal(results.legacy.exports, FROZEN.legacy.exports, 'Unrevisioned adapters retain polling');
  assert.equal(results.legacy.signatures, FROZEN.legacy.signatures, 'Unrevisioned preparation signatures retain polling');
  const host = await hostChecks(), bridge = bridgeChecks();
  console.log('PASS 3 immutable scheduler traces, ' + host + ' host invalidation/isolation groups and ' + bridge + ' native bridge argument groups');
  const sourceHashes = Object.fromEntries(['loom/instrument-host.js', 'loom/host-bridge.js', 'loom/note-playback.js', 'loom/host-scheduler-performance-checks.cjs'].map(file => [file, createHash('sha256').update(read(file)).digest('hex')]));
  const report = { baseline: BASELINE, scenarios: results, hostGroups: host, bridgeGroups: bridge, sourceHashes };
  if (process.env.GALLEY_HOST_SCHEDULER_REPORT) fs.writeFileSync(process.env.GALLEY_HOST_SCHEDULER_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
