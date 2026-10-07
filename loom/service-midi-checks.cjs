'use strict';

// A real controller is optional: exercise the Web MIDI boundary, held-control
// safety and explicit permission lifecycle with deterministic fake ports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const passed = [];
const plain = value => JSON.parse(JSON.stringify(value));

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) { for (const callback of Array.from(this.listeners.get(name) || [])) callback(event); }
  count(name) { return this.listeners.get(name)?.size || 0; }
}
class Input extends Target {
  constructor(id) { super(); this.id = id; this.type = 'input'; this.name = 'Controller ' + id; this.manufacturer = 'Fixture'; this.state = 'connected'; this.connection = 'open'; }
  send(...data) { this.emit('midimessage', { data: new Uint8Array(data), receivedTime: 123 }); }
  raw(data) { this.emit('midimessage', { data, receivedTime: 123 }); }
}
function binding(target, options = {}) { return { id: 'binding-' + target, inputId: '*', channel: null, type: 'note', number: 60, target, ...options }; }
function fixture(options = {}) {
  const scope = new Target(), document = new Target(), access = new Target();
  document.visibilityState = 'visible';
  const first = new Input('first'), second = new Input('second');
  access.inputs = new Map([[first.id, first]]);
  let bindings = options.bindings || [], requestCount = 0, requestOptions = null;
  const actions = [], statuses = [], saves = [], control = { error: null, deferred: null };
  Object.assign(scope, { document, console, Map, Set, Date, Number, Math, Promise, isSecureContext: options.insecure ? false : true,
    navigator: options.unsupported ? {} : { requestMIDIAccess: async settings => {
      requestCount++; requestOptions = settings;
      if (control.deferred) await new Promise(resolve => { control.deferred.resolve = resolve; });
      if (control.error) throw control.error;
      return access;
    } }
  });
  scope.window = scope;
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'service-midi.js'), 'utf8'), scope, { filename: 'service-midi.js' });
  const midi = new scope.LoomServiceMidi({ getBindings: () => bindings, setBindings: value => { bindings = plain(value); saves.push(bindings); },
    onAction: (target, value, meta) => actions.push({ target, value, meta: plain(meta) }), onStatus: message => statuses.push(message) });
  return { midi, scope, document, access, first, second, actions, statuses, saves, control,
    bindings: () => bindings, setBindings: value => { bindings = value; }, requests: () => requestCount, requestOptions: () => plain(requestOptions),
    connect(input = second) { access.inputs.set(input.id, input); access.emit('statechange', { port: input }); },
    disconnect(input = first) { input.state = 'disconnected'; access.emit('statechange', { port: input }); },
    async start() { midi.setActive(true); assert.equal(await midi.enable(), true); }
  };
}
async function check(name, run) { await run(); passed.push(name); }

(async () => {
  await check('MIDI never requests permission implicitly and never acts in Arrange', async () => {
    const f = fixture({ bindings: [binding('control:play')] });
    assert.equal(f.requests(), 0); assert.equal(f.statuses.length, 0);
    assert.equal(f.midi.learn('control:play'), false); assert.equal(f.requests(), 0);
    await f.midi.enable(); assert.deepEqual(f.requestOptions(), { sysex: false });
    f.first.send(0x90, 60, 100); assert.equal(f.actions.length, 0);
    assert.equal(f.midi.learn('control:play'), false);
    f.midi.setActive(true); f.first.send(0x90, 60, 100); assert.equal(f.actions.length, 1);
    f.midi.setActive(false); f.first.send(0x80, 60, 0); f.first.send(0x90, 60, 100); assert.equal(f.actions.length, 1);
    f.midi.destroy();
  });
  await check('Unsupported, insecure and denied MIDI are graceful and explicit', async () => {
    for (const options of [{ unsupported: true }, { insecure: true }]) {
      const f = fixture(options); assert.equal(f.statuses.length, 0); assert.equal(await f.midi.enable(), false); assert.equal(f.requests(), 0);
      assert.match(f.midi.getSnapshot().status, /unavailable|HTTPS/); f.midi.destroy();
    }
    const f = fixture(); f.control.error = Object.assign(Error('denied'), { name: 'NotAllowedError' });
    assert.equal(await f.midi.enable(), false); assert.equal(f.midi.getSnapshot().pending, false); assert.match(f.midi.getSnapshot().status, /permission/i);
    f.control.error = null; assert.equal(await f.midi.enable(), true); assert.equal(f.requests(), 2); f.midi.destroy();
  });
  await check('Concurrent enables share one permission request and a late permission grant cannot revive a closed controller', async () => {
    const f = fixture(); f.control.deferred = {};
    const first = f.midi.enable(), second = f.midi.enable(); assert.equal(first, second); assert.equal(f.requests(), 1); assert.equal(f.midi.getSnapshot().pending, true);
    f.midi.destroy(); f.control.deferred.resolve(); assert.equal(await first, false);
    assert.equal(f.first.count('midimessage'), 0); assert.equal(f.access.count('statechange'), 0); assert.equal(await f.midi.enable(), false);
  });
  await check('Synchronous browser denials release the retry latch and keep the user gesture call stack', async () => {
    const f = fixture(); let called = false;
    f.scope.navigator.requestMIDIAccess = () => { called = true; throw Object.assign(Error('denied'), { name: 'SecurityError' }); };
    const failed = f.midi.enable(); assert.equal(called, true); assert.equal(await failed, false); assert.equal(f.midi.getSnapshot().pending, false);
    f.scope.navigator.requestMIDIAccess = () => Promise.resolve(f.access);
    assert.equal(await f.midi.enable(), true); assert.equal(f.first.count('midimessage'), 1); f.midi.destroy();
  });
  await check('Note/channel matching, wildcard inputs and velocity-zero note-off preserve momentary controls', async () => {
    const f = fixture({ bindings: [binding('pad:stutter', { channel: 2 })] }); await f.start();
    f.first.send(0x91, 60, 127); f.first.send(0x92, 61, 127); assert.equal(f.actions.length, 0);
    f.first.send(0x92, 60, 90); f.first.send(0x92, 60, 90); assert.deepEqual(f.actions.map(a => [a.target, a.value]), [['pad:stutter', 1]]);
    f.first.send(0x92, 60, 0); assert.equal(f.actions[1].value, 0); assert.equal(f.actions[1].meta.release, true);
    f.first.send(0x92, 60, 127); f.first.send(0x82, 60, 20); assert.equal(f.actions.length, 4); assert.equal(f.actions[3].value, 0);
    f.midi.destroy();
  });
  await check('CC macros retain all 128 values without thresholding or changing their range', async () => {
    const f = fixture({ bindings: [binding('macro:macro-1', { type: 'cc', number: 74, inputId: 'first', channel: 0 })] }); await f.start();
    for (let value = 0; value < 128; value++) f.first.send(0xb0, 74, value);
    assert.equal(f.actions.length, 128); assert.equal(f.actions[0].value, 0); assert.equal(f.actions[127].value, 1);
    for (let value = 0; value < 128; value++) assert.equal(f.actions[value].value, value / 127);
    f.first.send(0xb1, 74, 127); f.first.send(0xb0, 73, 127); assert.equal(f.actions.length, 128); f.midi.destroy();
  });
  await check('Scene and transport triggers require a fresh rising edge, including CC thresholds', async () => {
    const f = fixture({ bindings: [binding('scene:scene-1'), binding('control:stop', { type: 'cc', number: 20 })] }); await f.start();
    f.first.send(0x90, 60, 127); f.first.send(0x90, 60, 110); f.first.send(0x80, 60, 0); f.first.send(0x90, 60, 100);
    assert.deepEqual(f.actions.map(a => a.target), ['scene:scene-1', 'scene:scene-1']);
    for (const value of [0, 63, 64, 90, 127, 1, 64]) f.first.send(0xb0, 20, value);
    assert.equal(f.actions.filter(a => a.target === 'control:stop').length, 2); f.midi.destroy();
  });
  await check('Learn consumes the first note or CC and suppresses held repeats until release', async () => {
    const f = fixture({ bindings: [binding('control:play')] }); await f.start();
    assert.equal(f.midi.learn('pad:fill'), true); f.first.send(0x80, 50, 0); assert.equal(f.midi.getSnapshot().learningTarget, 'pad:fill');
    f.first.send(0x94, 50, 90); assert.equal(f.actions.length, 0); assert.equal(f.bindings().length, 2);
    assert.deepEqual(f.bindings()[1], { id: f.bindings()[1].id, inputId: 'first', channel: 4, type: 'note', number: 50, target: 'pad:fill' });
    f.first.send(0x94, 50, 100); f.first.send(0x84, 50, 0); assert.equal(f.actions.length, 0);
    f.first.send(0x94, 50, 90); f.first.send(0x84, 50, 0); assert.deepEqual(f.actions.map(a => a.value), [1, 0]);
    f.midi.learn('scene:scene-2'); f.first.send(0xb0, 21, 127); f.first.send(0xb0, 21, 127); assert.equal(f.actions.length, 2);
    f.first.send(0xb0, 21, 0); f.first.send(0xb0, 21, 127); assert.equal(f.actions[2].target, 'scene:scene-2'); f.midi.destroy();
  });
  await check('Relearning replaces an overlapping control and the target’s previous assignment, without colliding other channels', async () => {
    const f = fixture({ bindings: [binding('control:play'), binding('macro:macro-1', { id: 'old-macro', type: 'cc', number: 10 }), binding('control:stop', { id: 'other-channel', inputId: 'first', channel: 3 })] }); await f.start();
    f.midi.learn('macro:macro-1'); f.first.send(0x92, 60, 127);
    assert.equal(f.bindings().length, 2); assert(f.bindings().some(b => b.id === 'other-channel')); assert(!f.bindings().some(b => b.target === 'control:play')); assert(!f.bindings().some(b => b.id === 'old-macro'));
    f.first.send(0x82, 60, 0); f.first.send(0x92, 60, 64); assert.equal(f.actions[0].value, 64 / 127); f.midi.destroy();
  });
  await check('CC pads are momentary at 64 and release when the controller falls below that threshold', async () => {
    const f = fixture({ bindings: [binding('pad:drop', { type: 'cc', number: 12 })] }); await f.start();
    for (const value of [0, 63, 64, 100, 127, 63, 0]) f.first.send(0xb0, 12, value);
    assert.deepEqual(f.actions.map(a => a.value), [1, 0]); f.midi.destroy();
  });
  await check('Two controllers holding one wildcard pad cannot release each other’s performance gesture', async () => {
    const f = fixture({ bindings: [binding('pad:fill')] }); await f.start(); f.connect();
    f.first.send(0x90, 60, 127); f.second.send(0x90, 60, 127); f.first.send(0x80, 60, 0);
    assert.deepEqual(f.actions.map(a => a.value), [1]); f.second.send(0x80, 60, 0); assert.deepEqual(f.actions.map(a => a.value), [1, 0]); f.midi.destroy();
  });
  await check('Input hotplug attaches once and disconnection safely releases only the disconnected input', async () => {
    const f = fixture({ bindings: [binding('pad:stutter'), binding('pad:drop', { id: 'second-pad', inputId: 'second', number: 61 })] }); await f.start(); f.connect(); f.connect();
    assert.equal(f.second.count('midimessage'), 1); assert.equal(f.midi.getSnapshot().inputs.length, 2);
    f.first.send(0x90, 60, 100); f.second.send(0x90, 61, 100); f.disconnect();
    assert.equal(f.first.count('midimessage'), 0); assert.equal(f.actions[2].target, 'pad:stutter'); assert.equal(f.actions[2].value, 0); assert.equal(f.actions[2].meta.reason, 'disconnect');
    f.second.send(0x80, 61, 0); assert.equal(f.actions[3].target, 'pad:drop');
    f.first.state = 'connected'; f.connect(f.first); f.first.send(0x90, 60, 100); assert.equal(f.actions[4].value, 1); f.midi.destroy();
  });
  await check('Blur, hidden tabs, deactivation and close release held pads and cannot leave stuck effects', async () => {
    for (const reason of ['blur', 'hidden', 'pagehide', 'deactivate', 'close']) {
      const f = fixture({ bindings: [binding('pad:stutter')] }); await f.start(); f.first.send(0x90, 60, 127); f.midi.learn('macro:macro-2');
      if (reason === 'blur') f.scope.emit('blur');
      if (reason === 'hidden') { f.document.visibilityState = 'hidden'; f.document.emit('visibilitychange'); }
      if (reason === 'pagehide') f.scope.emit('pagehide');
      if (reason === 'deactivate') f.midi.setActive(false);
      if (reason === 'close') f.midi.destroy();
      assert.deepEqual(f.actions.map(a => a.value), [1, 0]); assert.equal(f.actions[1].meta.reason, reason);
      assert.equal(f.midi.getSnapshot().learningTarget, null); f.first.send(0x90, 60, 127); assert.equal(f.actions.length, 2);
      f.midi.destroy();
    }
    const f = fixture({ bindings: [binding('pad:fill')] }); await f.start(); f.first.send(0x90, 60, 100); f.scope.emit('blur');
    f.scope.emit('focus'); f.first.send(0x90, 60, 100); assert.equal(f.actions[2].value, 1); f.midi.destroy();
  });
  await check('Clearing by target, ID or all releases removed pads and preserves unrelated bindings', async () => {
    const f = fixture({ bindings: [binding('pad:fill'), binding('control:stop', { number: 61 })] }); await f.start(); f.first.send(0x90, 60, 127);
    assert.equal(f.midi.clear('pad:fill'), 1); assert.equal(f.actions[1].value, 0); assert.equal(f.actions[1].meta.reason, 'assignment');
    assert.equal(f.bindings().length, 1); assert.equal(f.midi.clear('missing'), 0); assert.equal(f.midi.clear(f.bindings()[0].id), 1); assert.equal(f.bindings().length, 0);
    f.setBindings([binding('control:play')]); assert.equal(f.midi.clear(), 1); assert.equal(f.bindings().length, 0); f.midi.destroy();
  });
  await check('Malformed packets, realtime clocks, SysEx and untrusted binding shapes never dispatch', async () => {
    const f = fixture({ bindings: [binding('control:play'), binding('pad:fill', { id: 'bad-channel', channel: 16 }), binding('pad:drop', { id: 'bad-number', number: -1 }), binding('invented:target', { id: 'bad-target' }), null] }); await f.start();
    for (const packet of [[0xf8], [0xf0, 1, 0xf7], [0xc0, 60], [0x90, 60], [0x90, 60, 128], [0x90, 60, 100, 0], [0x10, 60, 100], [0xa0, 60, 127], [0xe0, 60, 127], [0x90, 60, NaN], [0x90, 60, 1.5]]) f.first.raw(packet);
    assert.equal(f.actions.length, 0); assert.equal(f.midi.getSnapshot().bindings.length, 1); assert.equal(f.midi.learn('invented:target'), false);
    f.first.send(0x90, 60, 127); assert.equal(f.actions.length, 1); f.midi.destroy();
  });
  await check('Snapshots and subscriptions are copies, and destruction removes every listener', async () => {
    const f = fixture({ bindings: [binding('control:play')] }), snapshots = [];
    const unsubscribe = f.midi.subscribe(value => snapshots.push(plain(value))); assert.equal(snapshots.length, 1);
    await f.start(); const snapshot = f.midi.getSnapshot(); snapshot.bindings[0].number = 1; snapshot.inputs[0].name = 'Changed';
    assert.equal(f.bindings()[0].number, 60); assert.notEqual(f.first.name, 'Changed');
    unsubscribe(); const before = snapshots.length; f.midi.setActive(false); assert.equal(snapshots.length, before);
    f.midi.destroy(); f.midi.destroy(); assert.equal(f.access.count('statechange'), 0); assert.equal(f.first.count('midimessage'), 0);
    for (const name of ['blur', 'focus', 'pagehide', 'pageshow']) assert.equal(f.scope.count(name), 0); assert.equal(f.document.count('visibilitychange'), 0);
  });
  for (const name of passed) console.log('PASS', name);
  console.log(`SERVICE MIDI: ${passed.length} checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
