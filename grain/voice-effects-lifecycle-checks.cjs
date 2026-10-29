'use strict';
// Verify the actual engine's cancellation/transport boundary decisions without
// a browser clock. Browser QA additionally probes the resulting delay audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { Math, Number, Map, Set, Array, Object, Float32Array, Float64Array, Uint8Array, Blob, DOMException, console };
scope.window = scope;
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'audio-engine.js'), 'utf8'), scope, { filename: 'audio-engine.js' });
function fixture() {
  const context = { currentTime: 1, sampleRate: 48000 }, input = {}, processed = {}, resets = [], clocks = [];
  const bank = { input: index => index === 1 ? input : processed, reset: (index, time) => resets.push({ index, time }), setClock: clock => clocks.push(clock) };
  function hit(index, source, fadeAt) {
    const values = [], stops = [], node = { stop: time => stops.push(time) };
    const gain = { cancelScheduledValues: time => values.push(['cancel', time]), setValueAtTime: (value, time) => values.push(['set', value, time]), exponentialRampToValueAtTime: (value, time) => values.push(['fade', value, time]) };
    const voice = { voiceIndex: index, scopeSource: source, startTime: .5, stopTime: 10, volume: .6, bus: { gain }, sources: [node], sourceEnds: new Map([[node, 10]]), disposed: false, stolen: false, track: { galleyFx: [null, null] } };
    if (fadeAt !== undefined) voice.fadeAt = fadeAt;
    return { voice, values, stops };
  }
  const old = hit(0, 'old'), direct = hit(1, 'old'), unrelated = hit(0, 'other'), future = hit(2, 'future', 1.5);
  const engine = new scope.NoiseEngine(); engine.context = context; engine.environment = { context, graph: { input }, voiceBank: bank, voices: new Set([old.voice, direct.voice, unrelated.voice, future.voice]) };
  return { engine, old, direct, unrelated, future, resets, clocks };
}
for (const mode of ['stop', 'seek']) {
  const f = fixture();
  f.engine.followTransport({ tempo: 120, beat: 2, when: 1, playing: true, revision: 1 });
  f.engine.cancelNativeNotes({ source: 'old' });
  assert.equal(f.resets.length, 0, 'A source-scoped cancellation does not clear shared voice histories');
  assert(f.old.stops.at(-1) > 1, 'Ordinary source cancellation retains its gentle release');
  const directStops = f.direct.stops.slice(), directGain = f.direct.values.slice();
  f.engine.followTransport({ tempo: 120, beat: mode === 'seek' ? 8 : 2, when: 1, playing: mode === 'seek', revision: 2 });
  assert.equal(f.old.stops.at(-1), 1, mode + ': cancelled FX sources cannot refill freshly reset histories');
  assert(f.old.values.some(value => value[0] === 'set' && value[1] === 0 && value[2] === 1), mode + ': cancelled input gate is zero at the boundary');
  assert.deepEqual(f.direct.stops, directStops, mode + ': never-active empty racks preserve original source stopping');
  assert.deepEqual(f.direct.values, directGain, mode + ': never-active empty gain envelopes are unchanged');
  assert.equal(f.unrelated.stops.length, 0, mode + ': unrelated uncancelled sources survive');
  assert.equal(f.unrelated.values.length, 0, mode + ': unrelated gain envelopes survive');
  assert.equal(f.future.stops.length, 0, mode + ': independently scheduled future cancellation is not pulled earlier');
  assert.equal(f.resets.length, 1); assert.equal(f.resets[0].time, 1);
  console.log('PASS global ' + mode + ' finalizes only cancelled FX-routed sources before the rack reset');
}
console.log('2 SIZZLE voice-FX lifecycle groups passed.');
