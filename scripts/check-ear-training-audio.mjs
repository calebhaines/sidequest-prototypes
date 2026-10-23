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
  connect() {}
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
console.log('Ear-training audio checks passed: unlock, gain bounds, pitch, event validation, cancellation, stale requests, and completion.');
