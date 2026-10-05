'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const scope = {
  console, Float32Array, Uint8Array, ArrayBuffer, DataView, Math, Number,
  JSON, Map, Set, DOMException, atob, btoa, Blob, setTimeout,
};
scope.window = scope;
vm.createContext(scope);
for (const file of ['shared/pattern-schema.js', 'ravel/schema.js', 'ravel/audio-engine.js', 'spool/schema.js', 'spool/audio-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope);
}
const peak = audio => Math.max(...audio.map(Math.abs));
const sampleRate = 48000;
const pcm = new Float32Array(sampleRate * 2);
for (let frame = 0; frame < sampleRate; frame++) {
  pcm[frame * 2] = pcm[frame * 2 + 1] = Math.sin(frame / sampleRate * 440 * Math.PI * 2) * .5;
}

const ravel = scope.RavelSchema.defaultState();
ravel.sample.fade = 0;
ravel.master.echo = ravel.master.space = 0;
ravel.boundaries = Array.from({ length: 17 }, (_, index) => index / 16);
let core = scope.RavelDSP.createCore(ravel, { pcm, sampleRate }, sampleRate);
core.queueSlice(0, { velocity: 1, pitch: 0, duration: .2 }, 2000);
let left = new Float32Array(4000), right = new Float32Array(4000);
core.processBlock(left, right);
assert.equal(peak(left.slice(0, 2000)), 0, 'RAVEL must remain silent before the scheduled frame');
assert(peak(left.slice(2000)) > .02, 'RAVEL must play its actual slice after the scheduled frame');
core.clearExternalNotes();
assert.equal(core.externalEvents.length, 0, 'RAVEL cancellation removes pending events');

const spool = scope.SpoolSchema.defaultState();
spool.source.monitor = false;
spool.master.echo = spool.master.space = 0;
for (const deck of spool.decks) {
  Object.assign(deck, {
    sync: false, rate: 1, level: 1, pan: 0, saturation: 0, wear: 0, wow: 0,
    flutter: 0, hiss: 0, dropouts: 0, tone: 18000, highpass: 10,
    start: 0, end: 1, phase: 0, solo: false, mute: false,
  });
}
core = new scope.SpoolDSP(sampleRate, spool);
core.setSample(0, pcm, sampleRate);
core.queueDeck(0, { velocity: .9, pitch: 12, duration: .04 }, 2000);
left = new Float32Array(8000); right = new Float32Array(8000);
core.processBlock(left, right);
assert.equal(peak(left.slice(0, 2000)), 0, 'SPOOL must remain silent before the scheduled frame');
assert(peak(left.slice(2000, 4000)) > .02, 'SPOOL must play the native tape signal');
assert.equal(core.deckGates[0], null, 'SPOOL notes release after their specified gate');
assert(peak(left.slice(7900)) < .001, 'SPOOL release settles to silence');
core.queueClock(8, 120, true, core.frame + 2000);
core.clearClockEvents();
assert.equal(core.events.length, 0, 'A canceled future loop seek must never restart playback');
core.clockSeek(7, 120, true);
assert.equal(core.transportFrames, 7 * .5 * sampleRate, 'SPOOL follows the shared beat position');
assert.equal(core.tempo, 120);
core.setState({ ...spool, tempo: 80 });
assert.equal(core.tempo, 120, 'Patch edits retain the shared clock tempo');
core.stop();
assert.equal(core.events.length, 0);
assert.equal(core.followingClock, null);
console.log('RAVEL and SPOOL: exact queued audio onset, finite gates, cancellation and clock/seek checks passed.');

// Future cancellation retains earlier notes and other sources on the same instrument.
core = scope.RavelDSP.createCore(ravel, { pcm, sampleRate }, sampleRate);
core.queueSlice(0, { velocity: 1, pitch: 0, duration: .2, source: 'loom-live:track-1:old' }, 1000);
core.queueSlice(0, { velocity: 1, pitch: 0, duration: .2, source: 'loom-live:track-1:old' }, 5000);
core.queueSlice(1, { velocity: 1, pitch: 0, duration: .2, source: 'loom' }, 5000);
core.clearExternalNotes('loom-live:track-1:old', 3000, true);
assert(core.externalEvents.some(event => event.options?.source === 'loom-live:track-1:old' && event.frame === 1000));
assert(!core.externalEvents.some(event => event.options?.source === 'loom-live:track-1:old' && event.frame === 5000));
assert(core.externalEvents.some(event => event.options?.source === 'loom' && event.frame === 5000));
left = new Float32Array(2500); right = new Float32Array(2500); core.processBlock(left, right);
assert(core.voices.some(voice => voice.source === 'loom-live:track-1:old' && voice.release === Infinity), 'Future cancel must not release a voice early');
left = new Float32Array(4000); right = new Float32Array(4000); core.processBlock(left, right);
assert(!core.voices.some(voice => voice.source === 'loom-live:track-1:old'), 'Old Live voices end at the queued boundary');
assert(core.voices.some(voice => voice.source === 'loom'), 'Arranged notes survive Live source cancellation');

core = new scope.SpoolDSP(sampleRate, spool); core.setSample(0, pcm, sampleRate); core.setSample(1, pcm, sampleRate);
core.queueDeck(0, { velocity: 1, pitch: 0, duration: .2, source: 'loom-live:track-1:old' }, 1000);
core.queueDeck(0, { velocity: 1, pitch: 0, duration: .2, source: 'loom-live:track-1:old' }, 5000);
core.queueDeck(1, { velocity: 1, pitch: 0, duration: .2, source: 'loom' }, 5000);
core.clearPatternNotes('loom-live:track-1:old', 3000, true);
left = new Float32Array(2500); right = new Float32Array(2500); core.processBlock(left, right);
assert.equal(core.deckGates[0]?.source, 'loom-live:track-1:old', 'SPOOL keeps old Live tape until its boundary');
left = new Float32Array(4000); right = new Float32Array(4000); core.processBlock(left, right);
assert.equal(core.deckGates[0], null, 'SPOOL cancels only the old Live gate');
assert.equal(core.deckGates[1]?.source, 'loom', 'SPOOL preserves separately arranged tape notes');
console.log('Scoped future cancellation preserves earlier notes and independent sources in both native DSP engines.');

core.clearPatternNotes('loom-live:track-1:old', core.frame, false);
core.queueDeck(0, { velocity: 1, pitch: 0, duration: .2, source: 'loom-live:track-1:old' }, core.frame + 1000);
assert(core.events.some(event => event.type === 'deckOn' && event.source === 'loom-live:track-1:old'), 'Immediate cancellation allows a fresh note with the same source');
core = scope.RavelDSP.createCore(ravel, { pcm, sampleRate }, sampleRate);
core.clearExternalNotes('loom', 3000, true);
core.clearExternalNotes('loom', 0, false);
core.queueSlice(0, { velocity: 1, pitch: 0, duration: .2, source: 'loom' }, 5000);
assert(core.externalEvents.some(event => event.options?.source === 'loom' && event.frame === 5000), 'RAVEL immediate cancellation allows the same source to resume');
assert(!core.externalEvents.some(event => event.type === 'cancel' && event.frame === 3000), 'RAVEL discards obsolete future cancellations when resetting the source');

core = new scope.SpoolDSP(sampleRate, spool);
core.setSample(0, pcm, sampleRate); core.setSample(1, pcm, sampleRate);
core.clockSeek(0, 120, true);
core.queueDeck(0, { velocity: .8, pitch: 0, duration: .2, source: 'loom' }, 1000);
core.clearPatternNotes('loom', 3000, true);
left = new Float32Array(6500); right = new Float32Array(6500); core.processBlock(left, right);
assert(core.decks[1].rms > .001, 'SPOOL keeps continuous playback on unrelated decks during gated notes');
assert(core.decks[0].targetGain > 0, 'SPOOL returns a gated deck to continuous playback after scoped release');
