'use strict';
// Browser-free lifecycle checks: no audio rendering, benchmark or wall-clock waits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }

class Element {
  constructor() { this.listeners = new Map(); this.fields = new Map(); this.dataset = {}; this.style = {}; this.attributes = new Map(); this.classList = { add() {}, toggle() {} }; this.isConnected = true; this.open = false; this.children = []; this.textContent = ''; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) { for (const listener of [...(this.listeners.get(type) || [])]) listener({ target: this, ...event }); }
  querySelector(selector) { if (!this.fields.has(selector)) this.fields.set(selector, new Element()); return this.fields.get(selector); }
  querySelectorAll() { return []; }
  contains() { return false; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) || null; }
  getBoundingClientRect() { return { width: 100, height: 100, top: 0, bottom: 100 }; }
}

function uiFixture({ intersection = true } = {}) {
  const document = new Element(); document.hidden = false; document.activeElement = null;
  const timers = new Map(), frames = new Map(), intersections = [], observers = []; let next = 0;
  const schedule = (map, callback, type) => { const id = ++next; map.set(id, { callback, type }); return id; };
  const sandbox = { document, innerHeight: 800, performance: { now: () => 100 },
    setInterval: callback => schedule(timers, callback, 'interval'), clearInterval: id => timers.delete(id),
    setTimeout: callback => schedule(timers, callback, 'timeout'), clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => schedule(frames, callback, 'frame'), cancelAnimationFrame: id => frames.delete(id),
    URL: { revokeObjectURL() {} },
    PerformanceObserver: class { static supportedEntryTypes = ['longtask']; constructor(callback) { this.callback = callback; observers.push(this); } observe() { this.connected = true; } disconnect() { this.connected = false; } }
  };
  sandbox.window = sandbox; sandbox.listeners = new Element(); sandbox.addEventListener = (...args) => sandbox.listeners.addEventListener(...args); sandbox.removeEventListener = (...args) => sandbox.listeners.removeEventListener(...args);
  if (intersection) sandbox.IntersectionObserver = class { constructor(callback) { this.callback = callback; intersections.push(this); } observe() { this.connected = true; } disconnect() { this.connected = false; } send(visible) { this.callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'cpu-ui.js'), 'utf8'), sandbox);
  const element = new Element(), calls = []; let reads = 0;
  const snapshot = { enabled: true, mode: 'light', revision: 1, reportRevision: 1, status: 'collecting', available: true, sampledBlocks: 0, processedBlocks: 0, rows: [], total: { samples: 0 }, clock: { coarse: true, resolutionMs: 1 } };
  const engine = { context: null, setDiagnostics: config => calls.push(config), getDiagnostics: () => { reads++; return snapshot; }, getAudioDiagnostics: () => ({ active: false }) };
  const inspector = new sandbox.LoomCPUInspector({ element, engine, getState: () => ({ tracks: [], returns: [], master: { id: 'master', effects: [] } }) });
  return { inspector, element, engine, document, timers, frames, intersections, observers, calls, sandbox, snapshot, reads: () => reads };
}

check('Collapsed inspector never requests a snapshot or installs active listeners/observers', () => {
  const f = uiFixture(); for (let index = 0; index < 10; index++) { f.inspector.render(); f.inspector.setVisible(index % 2 === 0); }
  assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.intersections.length, 0); assert.equal(f.document.listeners.get('visibilitychange')?.size || 0, 0);
  assert.equal(f.element.listeners.get('click')?.size || 0, 0); assert.equal(f.element.listeners.get('change')?.size || 0, 0); assert.equal(f.element.listeners.get('toggle').size, 1);
});

check('Closing releases diagnostics, histories and monitors; stale observer events stay cold', () => {
  const f = uiFixture(); f.element.open = true; f.inspector.sync(); const observer = f.intersections.at(-1); observer.send(true);
  assert.equal(f.inspector.active, true); assert.equal(f.timers.size, 1); assert.equal(f.inspector.listening, true);
  f.inspector.monitorUI = true; f.inspector.startBrowserMonitor(); assert.equal(f.frames.size, 1); assert.equal(f.observers.at(-1).connected, true);
  f.inspector.history.push({ time: 100, value: 40 }); const before = f.reads(); f.element.open = false; f.inspector.sync();
  assert.equal(f.calls.at(-1).release, true); assert.equal(f.calls.at(-1).enabled, false); assert.equal(f.reads(), before); assert.equal(f.inspector.history.length, 0); assert.equal(f.inspector.observer, null); assert.equal(f.inspector.longTaskObserver, null); assert.equal(f.inspector.listening, false);
  assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.document.listeners.get('visibilitychange').size, 0);
  observer.send(false); observer.send(true); f.inspector.scrollChanged(); f.observers.at(-1).callback({ getEntries: () => [{ duration: 90 }] });
  assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.reads(), before); assert.equal(f.inspector.uiStats.longTasks, 0); assert.equal(f.inspector.active, false);
});

check('Pause retains readings; hiding releases them; disposal does not read another snapshot', () => {
  const f = uiFixture(); f.element.open = true; f.inspector.sync(); f.intersections.at(-1).send(true); f.inspector.history.push({ time: 100, value: 20 });
  f.inspector.paused = true; f.inspector.sync(); assert.equal(f.calls.at(-1).enabled, false); assert.equal(f.calls.at(-1).release, undefined); assert.equal(f.inspector.history.length, 1); assert.equal(f.timers.size, 0);
  f.document.hidden = true; const before = f.reads(); f.document.emit('visibilitychange'); assert.equal(f.calls.at(-1).release, true); assert.equal(f.inspector.history.length, 0); assert.equal(f.reads(), before);
  f.document.hidden = false; f.inspector.paused = false; f.document.emit('visibilitychange'); f.intersections.at(-1).send(true); const beforeDispose = f.reads(); f.inspector.dispose();
  assert.equal(f.reads(), beforeDispose); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.element.listeners.get('toggle').size, 0); assert.equal(f.document.listeners.get('visibilitychange').size, 0);
});

check('Unchanged idle reports do not redraw owner timing rows or history paths', () => {
  const f = uiFixture(); f.element.open = true; f.inspector.sync(); f.intersections.at(-1).send(true);
  let paths = 0; f.inspector.paintHistory = () => paths++;
  const interval = [...f.timers.values()].find(timer => timer.type === 'interval'); interval.callback(); interval.callback(); assert.equal(paths, 0);
  f.snapshot.processedBlocks++; interval.callback(); assert.equal(paths, 1);
  f.inspector.render(); assert.equal(paths, 2, 'Explicit fold/control interactions still paint held readings.'); f.inspector.dispose();
});

check('Fallback scroll guards and their pending offscreen grace timer detach on close', () => {
  const f = uiFixture({ intersection: false }); f.element.open = true; f.inspector.sync(); assert.equal(f.inspector.active, true); assert.equal(f.sandbox.listeners.listeners.get('scroll').size, 1);
  f.element.getBoundingClientRect = () => ({ width: 100, height: 100, top: 900, bottom: 1000 }); f.inspector.scrollChanged(); assert.equal(f.timers.size, 2);
  f.element.open = false; f.inspector.sync(); assert.equal(f.timers.size, 0); assert.equal(f.sandbox.listeners.listeners.get('scroll').size, 0); assert.equal(f.sandbox.listeners.listeners.get('resize').size, 0); assert.equal(f.inspector.offscreenTimer, 0);
});

check('Disabled profiler rows discard previous costs and do not read the timing clock', () => {
  const sandbox = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'cpu-profiler.js'), 'utf8'), sandbox);
  let now = 0, reads = 0; const runtime = new (sandbox.createLoomCPUProfiler().Runtime)(48000, { clock: () => { reads++; return now; } });
  const descriptor = { id: 'track-1:fx:0', kind: 'effect', ownerId: 'track-1', slot: 0, effectType: 'cinder', identity: 'same-patch' };
  runtime.setTopology([descriptor]); runtime.configure({ enabled: true, mode: 'deep' }); runtime.begin(128); let stamp = runtime.start(descriptor.id); now += .5; runtime.endStage(descriptor.id, stamp); runtime.finish(); assert.equal(runtime.getSnapshot().rows[0].meanMs, .5);
  runtime.setTopology([{ ...descriptor, disabled: true }]); assert.equal(runtime.getSnapshot().rows[0].meanMs, null); runtime.begin(128); const before = reads; stamp = runtime.start(descriptor.id); assert(Number.isNaN(stamp)); assert.equal(reads, before); now += .25; runtime.finish();
  const disabled = runtime.getSnapshot().rows[0]; assert.equal(disabled.disabled, true); assert.equal(disabled.active, false); assert.equal(disabled.meanMs, null); assert.equal(disabled.windowCalls, 0);
  assert.equal(disabled.samples, 0); assert.equal(disabled.totalSamples, 0); assert.equal(runtime.rows[0].stats, null); assert.equal(runtime.measuredRows.length, 0); assert.equal(runtime.durations.length, 0); assert.equal(runtime.stageCalls.length, 0); runtime.reset();
  runtime.setTopology([descriptor]); assert.equal(runtime.getSnapshot().rows[0].samples, 0); assert.equal(runtime.getSnapshot().rows[0].disabled, false);
});

check('Compact measurement slots preserve enabled costs and unconditional recent windows', () => {
  const sandbox = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'cpu-profiler.js'), 'utf8'), sandbox);
  let now = 0; const runtime = new (sandbox.createLoomCPUProfiler().Runtime)(48000, { clock: () => now });
  runtime.setTopology([{ id: 'disabled-before', disabled: true }, { id: 'measured' }, { id: 'disabled-after', disabled: true }, { id: 'untouched' }]); runtime.configure({ enabled: true, mode: 'deep' });
  runtime.begin(128); const stamp = runtime.start('measured'); now += .5; runtime.endStage('measured', stamp); runtime.finish();
  runtime.begin(128); now += .25; runtime.finish();
  const rows = new Map(runtime.getSnapshot().rows.map(row => [row.id, row]));
  assert.equal(rows.get('measured').meanMs, .25, 'Unexecuted enabled callbacks remain zero contributions.'); assert.equal(rows.get('measured').samples, 2); assert.equal(rows.get('measured').windowCalls, 1);
  assert.equal(rows.get('untouched').samples, 2); assert.equal(rows.get('untouched').meanMs, null, 'An enabled region with no calls is unmeasured.');
  assert.equal(rows.get('disabled-before').samples, 0); assert.equal(rows.get('disabled-after').samples, 0); assert.equal(runtime.measuredRows.length, 2);
});

console.log('\n' + checks + ' CPU lifecycle checks passed.');
