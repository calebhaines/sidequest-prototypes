'use strict';
// Exercise the real musical-clock interpolation with future render anchors.
// No audio DSP is replaced: this fixture instantiates only LoomAudio's clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { Math, Number, Object, Map, Set, Float32Array, Float64Array, Uint8Array, Uint32Array, Promise, createLoomEffectsDSP: () => ({}) };
scope.window = scope; vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'audio-engine.js'), 'utf8'), scope, { filename: 'audio-engine.js' });
function fixture() {
  const state = { tempo: 120, lengthBars: 4, loopEnabled: false, loopStart: 0, loopEnd: 8, tracks: [] };
  const audio = new scope.LoomAudio(state);
  audio.context = { currentTime: 10, sampleRate: 48000 };
  audio._transportEpoch = 7; audio._meters = { playing: true, beat: 4, countInBeatsRemaining: 0 };
  audio._countInOrigin = { revision: 7, beat: 4 };
  return audio;
}
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-10, message + ': ' + actual + ' != ' + expected);
const audio = fixture();
// The current browser time is 50ms before an anchor still in count-in.
audio._clockAnchor = { beat: 4, time: 10, cycle: 0, countIn: .5 };
let clock = audio.getTransport(9.95);
near(clock.beat, 4, 'Count-in holds the nonzero starting position');
near(clock.countInBeatsRemaining, .6, 'Signed interpolation restores time before the anchor');
near(clock.contextTime + clock.countInBeatsRemaining * 60 / clock.tempo, 10.25, 'The count-in boundary stays at its actual context time');
// The first completed block may already report zero remaining while the main
// thread's currentTime still precedes the boundary inside that output block.
audio._clockAnchor = { beat: 4.01, time: 10.005, cycle: 0, countIn: 0 };
clock = audio.getTransport(9.99);
near(clock.beat, 4, 'A post-boundary anchor cannot move the playhead before its starting beat');
near(clock.countInBeatsRemaining, .02, 'The remaining fraction survives the first zero-countdown anchor');
near(clock.contextTime + clock.countInBeatsRemaining * .5, 10, 'Both anchor sides identify the same boundary');
clock = audio.getTransport(10.01);
near(clock.beat, 4.02, 'Playback advances normally after the boundary');
near(clock.countInBeatsRemaining, 0, 'No count-in is invented after it ends');
// Ordinary future render anchors keep signed beat interpolation, with no hold.
audio._countInOrigin = null;
clock = audio.getTransport(9.99);
near(clock.beat, 3.98, 'An ordinary playing clock is free to interpolate backward');
near(clock.countInBeatsRemaining, 0, 'Ordinary playback does not become a count-in');
// A later loop wrap must not be mistaken for the recording's initial hold.
audio._countInOrigin = { revision: 7, beat: 4 };
audio._clockConfiguration.loopEnabled = true;
audio._clockAnchor = { beat: .01, time: 10.005, cycle: 1, countIn: 0 };
clock = audio.getTransport(9.99);
near(clock.beat, 7.98, 'A future loop anchor interpolates into the preceding cycle');
assert.equal(clock.cycle, 0); near(clock.countInBeatsRemaining, 0, 'A later loop has no original count-in');
// Origin metadata belongs only to the recording epoch that created it.
audio._clockConfiguration.loopEnabled = false;
audio._clockAnchor = { beat: 4.01, time: 10.005, cycle: 0, countIn: 0 };
audio._transportEpoch = 8;
near(audio.getTransport(9.99).beat, 3.98, 'A stale recording origin never constrains a new transport');
for (const type of ['play', 'stop', 'seek', 'panic', 'recordStop', 'recordCancel', 'serviceStart', 'serviceStop']) {
  const fresh = fixture(); fresh._send({ type }); assert.equal(fresh._countInOrigin, null, type + ' clears count-in origin');
}
const fresh = fixture(); fresh._recordTimelineStartBeat = 6; fresh._send({ type: 'recordStart', schedule: { countInBeats: 4 } });
assert.equal(fresh._countInOrigin.beat, 6); assert.equal(fresh._countInOrigin.revision, fresh._transportEpoch);
fresh._send({ type: 'recordStart', schedule: { countInBeats: 0 } }); assert.equal(fresh._countInOrigin, null);
console.log('PASS signed count-in interpolation, nonzero starts, boundary crossing, ordinary playback, loop wraps and transport-epoch isolation.');
