/* Exercise the actual LEAVEN/MARINADE ScriptProcessor callback and native note
 * queue with a deterministic browser callback clock. The callback's playback
 * time is the output block origin, even when currentTime was read later.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = fs.existsSync(path.join(__dirname, 'timing-fixtures')) ? path.join(__dirname, 'timing-fixtures') : path.resolve(__dirname, '..');
function load(id, rate, initialTime) {
  class Context {
    constructor() { this.sampleRate = rate; this.currentTime = initialTime; this.state = 'running'; this.destination = {}; }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createScriptProcessor(size) { return { bufferSize: size, connect() {}, disconnect() {}, onaudioprocess: null }; }
  }
  const scope = { console, Blob, URL, DOMException, AbortController, TextEncoder, TextDecoder, Float32Array, Float64Array, Uint8Array, Int16Array, ArrayBuffer,
    setTimeout, clearTimeout, performance, AudioContext: Context,
    location: { protocol: 'file:' }, navigator: {}, addEventListener() {}, removeEventListener() {} };
  scope.window = scope; scope.self = scope; vm.createContext(scope);
  const files = id === 'proof' ? ['shared/pattern-schema.js', 'proof/schema.js', 'proof/arp.js', 'proof/audio-engine.js'] :
    ['shared/pattern-schema.js', 'marinade/analysis.js', 'marinade/sources.js', 'marinade/schema.js', 'marinade/sequence.js', 'marinade/audio-engine.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
  return scope;
}
(async () => {
  let checked = 0;
  for (const id of ['proof', 'marinade']) for (const rate of [44100, 48000, 96000]) for (const ahead of [false, true]) {
    const scope = load(id, rate, 1), name = id === 'proof' ? 'Proof' : 'Marinade';
    const state = scope[name + 'Schema'].defaultState(), Engine = scope[name + 'Audio'];
    const engine = new Engine(state); await engine.init();
    assert.equal(engine.mode, 'fallback');
    const core = engine.core, block = engine.node.bufferSize;
    const requestedFrame = Math.round(1.15 * rate), blockStart = Math.round((ahead ? .992 : 1.008) * rate);
    let playbackFrame = blockStart, callbackCoreFrame, events = [], heard = false;
    const note = core._note, processBlock = core.processBlock;
    core._note = function(event) {
      events.push({ scheduled: event.frame, rendered: playbackFrame + this.frame - callbackCoreFrame });
      return note.call(this, event);
    };
    core.processBlock = function(left, right) { callbackCoreFrame = this.frame; return processBlock.call(this, left, right); };
    engine.scheduleNote({ note: 60, voiceId: 'synth', velocity: .8, when: requestedFrame / rate, durationSeconds: .15, source: 'timing-fixture' });
    const callbacks = Math.ceil((requestedFrame + rate * .1 - blockStart) / block);
    for (let at = 0; at < callbacks; at++) {
      playbackFrame = blockStart + at * block;
      const left = new Float32Array(block), right = new Float32Array(block);
      engine.node.onaudioprocess({ playbackTime: playbackFrame / rate, outputBuffer: { getChannelData: channel => channel ? right : left } });
      assert.equal(core.frame, playbackFrame + block, id + ' anchors every buffer to its actual playback origin');
      for (let frame = 0; frame < block; frame++) {
        const amplitude = Math.max(Math.abs(left[frame]), Math.abs(right[frame]));
        assert(Number.isFinite(amplitude));
        if (playbackFrame + frame < requestedFrame) assert.equal(amplitude, 0, id + ' emits no audio before the scheduled context frame');
        else if (amplitude > 1e-6) heard = true;
      }
    }
    assert.equal(events.length, 1, id + ' schedules exactly one native note');
    assert.equal(events[0].scheduled, requestedFrame);
    assert.equal(events[0].rendered, requestedFrame, id + ' preserves absolute scheduling even when the inherited core clock was ahead');
    assert(heard, id + ' renders the actual native voice after its scheduled frame');
    engine.dispose(); checked++;
  }
  console.log('PASS tonal fallback clock: ' + checked + ' actual engine callback cases at44.1/48/96kHz, both context-ahead and callback-ahead block origins, exact note frames and silent leading audio.');
})().catch(error => { console.error(error); process.exitCode = 1; });
