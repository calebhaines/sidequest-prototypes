import assert from 'node:assert/strict';
import { AudioEngine } from '../public/ear-training/audio.js';

const oscillators = [];
class Param {
  constructor() { this.value = 0; this.calls = []; }
  setValueAtTime(...args) { this.calls.push(['set', ...args]); }
  linearRampToValueAtTime(...args) { this.calls.push(['linear', ...args]); }
  exponentialRampToValueAtTime(...args) { this.calls.push(['exponential', ...args]); }
  setTargetAtTime(...args) { this.calls.push(['target', ...args]); }
  cancelAndHoldAtTime(...args) { this.calls.push(['hold', ...args]); }
}
class Node {
  connect(target) { this.connected = target; }
  disconnect() { this.disconnected = true; }
}
class Context {
  constructor() { this.state = 'suspended'; this.currentTime = 10; this.destination = {}; }
  async resume() { this.state = 'running'; }
  createGain() { return Object.assign(new Node(), { gain: new Param() }); }
  createDynamicsCompressor() {
    const node = new Node();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Param();
    return node;
  }
  createOscillator() {
    const oscillator = Object.assign(new Node(), {
      frequency: new Param(), stops: [],
      start(time) { this.started = time; },
      stop(time) { this.stops.push(time); },
    });
    oscillators.push(oscillator);
    return oscillator;
  }
}
globalThis.AudioContext = Context;
const engine = new AudioEngine();
assert.equal(engine.available, true);
assert.equal(engine.initialized, false);
engine.volume = 100;
assert.equal(engine.volume, 1);
engine.volume = -100;
assert.equal(engine.volume, 0);
engine.volume = Number.NaN;
assert.equal(engine.volume, 0);
engine.volume = 0.7;
await engine.ensure();
assert.equal(engine.initialized, true);
assert.equal(engine._context.state, 'running');
assert.equal(engine._master.gain.value, 0.42);

const states = [];
engine.onStateChange = state => states.push(state);
const first = engine.play([{ at: 20, duration: 2, notes: [60, 64, 67] }]);
await Promise.resolve();
assert.equal(engine.playing, true);
assert.equal(oscillators.length, 9, 'warm triad has three controlled partials per note');
assert.equal(oscillators[0].frequency.value, 261.6255653005986);
assert(Math.abs(oscillators[0].started - 30.06) < 1e-10);
const previous = oscillators.slice();
const second = engine.preview(69, 0.04);
assert.deepEqual(await first, { cancelled: true });
await Promise.resolve();
assert(previous.every(osc => osc.stops.at(-1) === 10.025), 'future notes stop before their scheduled start');
assert.equal(oscillators.at(-3).frequency.value, 440);
engine.stop();
assert.deepEqual(await second, { cancelled: true });
assert.equal(engine.playing, false);
assert.deepEqual(states, [true, false, true, false]);

const before = oscillators.length;
const cancelledBeforeUnlock = engine.play([{ at: 0, duration: 0.03, notes: [60] }]);
engine.stop();
assert.deepEqual(await cancelledBeforeUnlock, { cancelled: true });
assert.equal(oscillators.length, before, 'stopped pending requests do not schedule notes after unlock');

engine.timbre = 'sine';
engine.timbre = 'unknown';
assert.equal(engine.timbre, 'sine');
assert.deepEqual(await engine.play([{ at: -1, duration: 1, notes: [60] }, { at: 0, duration: 1, notes: [NaN, 999] }]), { cancelled: false });
assert.equal(oscillators.length, before, 'invalid events never reach the audio graph');
const natural = engine.play([{ at: 0, duration: 0.02, notes: [69] }], { leadIn: 0.025 });
await Promise.resolve();
assert.equal(oscillators.length, before + 1, 'sine timbre uses only a fundamental');
assert.deepEqual(await natural, { cancelled: false });
assert.equal(engine.playing, false);
assert.equal(engine._finish, null);
// A lead follows the selected timbre while accompaniment can choose its own.
// All tracks must share one scheduling origin and one cancellation boundary.
engine.timbre = 'sine';
const mixedStart = oscillators.length;
const mixed = engine.play([
  { at: 0, duration: 1, notes: [48, 52, 55], voice: 'warm', velocity: 0.3 },
  { at: 0, duration: 0.4, notes: [72], velocity: 0.8 },
  { at: 0.6, duration: 0.4, notes: [74], voice: 'piano', velocity: 0.8 },
  { at: 0.6, duration: 0.4, notes: [76], voice: 'unknown' },
  { at: 1.2, duration: 0.4, notes: [77], voice: 'sine' },
  { at: 1.2, duration: 0.4, notes: [88], voice: 'click' },
]);
await Promise.resolve();
const mixedNodes = oscillators.slice(mixedStart);
assert.equal(mixedNodes.length, 17, 'warm chord 9 + global sine lead 1 + piano 3 + fallback sine 1 + explicit sine 1 + click 2');
assert(mixedNodes.slice(0, 10).every(osc => osc.started === mixedNodes[0].started), 'chord and lead use the same audio clock');
assert(Math.abs(mixedNodes[10].started - mixedNodes[0].started - 0.6) < 1e-10);
assert.equal(mixedNodes[9].frequency.value, 440 * 2 ** ((72 - 69) / 12), 'lead preserves its high-register pitch');
assert.equal(mixedNodes[10].frequency.value, 440 * 2 ** ((74 - 69) / 12));
assert.equal(mixedNodes[11].frequency.value, mixedNodes[10].frequency.value * 2);
assert.equal(mixedNodes[12].frequency.value, mixedNodes[10].frequency.value * 3);
assert.equal(mixedNodes[13].frequency.value, 440 * 2 ** ((76 - 69) / 12), 'unknown voice falls back to the selected sine timbre');
assert.equal(mixedNodes[14].frequency.value, 440 * 2 ** ((77 - 69) / 12));
const chordEnvelope = mixedNodes[0].connected.gain.calls;
const leadEnvelope = mixedNodes[9].connected.gain.calls;
assert(chordEnvelope.find(call => call[0] === 'linear')[1] < leadEnvelope.find(call => call[0] === 'linear')[1] * 0.3, 'low-velocity chord accompaniment stays below the lead');
assert.equal(chordEnvelope.filter(call => call[0] === 'exponential').length, 1, 'warm accompaniment holds before its release');
assert.equal(mixedNodes[10].connected.gain.calls.filter(call => call[0] === 'exponential').length, 2, 'piano override includes its characteristic decay and release');
assert.equal(engine.timbre, 'sine', 'event overrides do not change the selected timbre');
engine.stop();
assert.deepEqual(await mixed, { cancelled: true });
assert(mixedNodes.every(osc => osc.stops.at(-1) === 10.025), 'one stop cancels accompaniment and all future lead notes');
assert.equal(engine._nodes.size, 0);

// The same fallback rule also works when the global voice has harmonics.
engine.timbre = 'piano';
const fallbackStart = oscillators.length;
const fallback = engine.play([
  { at: 0, duration: 0.4, notes: [60] },
  { at: 0, duration: 0.4, notes: [64], voice: null },
  { at: 0, duration: 0.4, notes: [67], voice: 'not-a-voice' },
  { at: 0, duration: 0.4, notes: [72], voice: 'sine' },
]);
await Promise.resolve();
assert.equal(oscillators.length - fallbackStart, 10, 'undefined/null/unknown voices use global piano; explicit sine uses one partial');
engine.stop();
assert.deepEqual(await fallback, { cancelled: true });
// Inspect scheduled clock lengths directly, avoiding wall-clock timing flakes.
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timers = [];
globalThis.setTimeout = (callback, milliseconds) => {
  const timer = { callback, milliseconds, cancelled: false };
  timers.push(timer);
  return timer;
};
globalThis.clearTimeout = timer => { if (timer) timer.cancelled = true; };
try {
  const silenceStart = oscillators.length;
  const silence = engine.play([], { leadIn: 0.025, duration: 2 });
  await Promise.resolve();
  const silenceTimer = timers.at(-1);
  assert.equal(silenceTimer.milliseconds, 2025, 'empty previews hold their requested clock length after lead-in');
  assert.equal(engine.playing, true);
  assert.equal(oscillators.length, silenceStart, 'silent preview clocks create no audible nodes');
  engine.stop();
  assert.deepEqual(await silence, { cancelled: true });
  assert.equal(silenceTimer.cancelled, true);
  assert.equal(engine.playing, false);

  const short = engine.play([{ at: 0.1, duration: 0.2, notes: [72] }], { leadIn: 0.025, duration: 2 });
  await Promise.resolve();
  const shortTimer = timers.at(-1);
  assert.equal(shortTimer.milliseconds, 2025, 'short notes preserve trailing blank slots');
  assert(oscillators.at(-1).stops[0] < 11, 'clock extension does not stretch the audible note');
  shortTimer.callback();
  assert.deepEqual(await short, { cancelled: false });
  assert.equal(engine.playing, false);
  engine.stop();

  const long = engine.play([{ at: 1, duration: 0.5, notes: [74] }], { leadIn: 0.025, duration: 0.1 });
  await Promise.resolve();
  const longTimer = timers.at(-1);
  assert(longTimer.milliseconds >= 1615 && longTimer.milliseconds <= 1616, 'longer actual events and their release outlast the requested minimum');
  longTimer.callback();
  assert.deepEqual(await long, { cancelled: false });
  engine.stop();

  const priorTimers = timers.length;
  for (const duration of [undefined, 0, -1, NaN, Infinity]) {
    assert.deepEqual(await engine.play([], { duration }), { cancelled: false });
  }
  assert.equal(timers.length, priorTimers, 'empty previews without a positive finite minimum return immediately');
  assert.equal(engine.playing, false);
} finally {
  engine.stop();
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log('Ear-training audio checks passed: unlock, gain bounds, pitch, event validation, cancellation, stale requests, completion, mixed event voices, shared timing, all-track cancellation, and minimum/silent playback clocks.');
