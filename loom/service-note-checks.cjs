'use strict';
// Decode through the unchanged native renderer, with only Chrome's resampler
// represented by a fake AudioContext. Tests compare actual Float32 sample bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { Blob, DOMException, AbortController, TextEncoder, Float32Array, Uint8Array, DataView, Math, Number, Map, Set, Promise, setTimeout, clearTimeout };
scope.window = scope; vm.createContext(scope);
const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared', 'pattern-schema.js') : path.join(__dirname, '..', 'shared', 'pattern-schema.js');
vm.runInContext(fs.readFileSync(shared, 'utf8'), scope, { filename: 'pattern-schema.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'note-renderer.js'), 'utf8'), scope, { filename: 'note-renderer.js' });
const Native = scope.LoomNoteRenderer, nativeAudio = Native.prototype._audio, nativeRender = Native.prototype._render;
vm.runInContext(fs.readFileSync(path.join(__dirname, 'service.js'), 'utf8'), scope, { filename: 'service.js' });
const Service = scope.LoomServiceNoteRenderer, passed = [], failures = [];
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function wav({ rate = 48000, frames = rate, channels = 2, bits = 16, mutate } = {}) {
  const align = channels * bits / 8, size = frames * align, buffer = new ArrayBuffer(44 + size), view = new DataView(buffer);
  const word = (at, value) => { for (let i = 0; i < 4; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, 36 + size, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * align, true); view.setUint16(32, align, true); view.setUint16(34, bits, true); word(36, 'data'); view.setUint32(40, size, true);
  mutate?.(view); return new Blob([buffer], { type: 'audio/wav' });
}
function fixture(options = {}) {
  const length = options.length ?? 44099, rate = options.rate ?? 44100, channels = options.channels ?? 2;
  const left = Float32Array.from({ length }, (_, i) => Math.fround(.17 * Math.sin(i * .057) + .03 * Math.cos(i * .023)));
  const right = channels === 1 ? left : Float32Array.from({ length }, (_, i) => Math.fround(-.13 * Math.cos(i * .029)));
  const beforeL = Buffer.from(bytes(left)), beforeR = Buffer.from(bytes(right)); let decodes = 0;
  const context = { async decodeAudioData(buffer) {
    decodes++; assert(buffer instanceof ArrayBuffer); if (options.decodeDeferred) await options.decodeDeferred.promise;
    return { sampleRate: rate, length, numberOfChannels: channels, getChannelData: channel => channel === 0 ? left : right };
  } };
  const result = options.result || { blob: options.blob || wav(options.wav), sampleRate: options.sourceRate ?? 48000 };
  const session = { serviceSourceSeconds: options.seconds ?? 1, frame: {}, host: {
    _context: () => context, async load() {}, getPatternAdapter: () => ({ notes: { voices: [{ id: 'keys', name: 'Keys' }] }, renderPattern() {} }),
    capabilities: () => ({ notes: true }), async renderPattern() { return result; }
  } };
  return { renderer: new Service(), native: new Native(), session, result, left, right, beforeL, beforeR, decodes: () => decodes,
    sameSamples(audio, added = 0) {
      assert.equal(audio.sampleRate, rate); assert.equal(audio.left.length, length + added); assert.equal(audio.right.length, length + added);
      assert.equal(Buffer.compare(bytes(audio.left).subarray(0, beforeL.length), beforeL), 0, 'Left decoded samples changed.');
      assert.equal(Buffer.compare(bytes(audio.right).subarray(0, beforeR.length), beforeR), 0, 'Right decoded samples changed.');
      assert.equal(Buffer.compare(bytes(left), beforeL), 0, 'The decoder’s original left buffer changed.'); assert.equal(Buffer.compare(bytes(right), beforeR), 0, 'The decoder’s original right buffer changed.');
      if (added) { assert.equal(audio.left.at(-1), 0); assert.equal(audio.right.at(-1), 0); }
    }
  };
}
function captured() {
  return { instrument: { id: 'fixture', snapshot: { state: { gain: .2 } } }, renderTempo: 120, transpose: 0, tailSeconds: 0, loop: false, voiceMap: {},
    packet: { format: 'musiclab-pattern', version: 1, name: 'One second', sourceApp: 'fixture', tempo: 120, swing: 0, meter: [4, 4], lengthBeats: 2,
      voices: [{ id: 'keys', name: 'Keys' }], notes: [{ id: 'one', voice: 'keys', beat: 0, duration: 1, pitch: 60, velocity: .8, probability: 1 }], seed: 7, tags: [] } };
}
async function check(name, run) { try { await run(); passed.push(name); } catch (error) { failures.push({ name, error }); } }

(async () => {
  await check('The native arrangement renderer and its prototype methods remain unchanged', async () => {
    assert.equal(scope.LoomNoteRenderer, Native); assert.equal(Native.prototype._audio, nativeAudio); assert.equal(Native.prototype._render, nativeRender); assert(Service.prototype instanceof Native);
    const f = fixture(); const audio = await f.native._audio(f.result, f.session); f.sameSamples(audio); await assert.rejects(f.native._render(f.session, captured(), {}), /shorter than the requested pattern/);
  });
  await check('Actual SERVICE render accepts a one-frame cross-rate decoder rounding loss and only appends stereo zero', async () => {
    const f = fixture(); delete f.session.serviceSourceSeconds; const rendered = await f.renderer._render(f.session, captured(), {});
    assert.equal(f.session.serviceSourceSeconds, 1); assert.equal(f.decodes(), 1); f.sameSamples(rendered.audio, 1);
  });
  await check('Valid native mono/stereo 16-, 24- and 32-bit PCM WAVs preserve every decoded sample', async () => {
    for (const channels of [1, 2]) for (const bits of [16, 24, 32]) {
      const f = fixture({ channels, wav: { channels, bits } }); const audio = await f.renderer._audio(f.result, f.session); f.sameSamples(audio, 1);
    }
  });
  await check('A complete or longer render is returned with all existing samples and duration unchanged', async () => {
    for (const length of [44100, 44101, 46000]) { const f = fixture({ length }); f.sameSamples(await f.renderer._audio(f.result, f.session)); }
  });
  await check('A same-rate short render is never repaired', async () => {
    const f = fixture({ rate: 48000, length: 47999 }); f.sameSamples(await f.renderer._audio(f.result, f.session)); await assert.rejects(f.renderer._render(f.session, captured(), {}), /shorter than the requested pattern/);
  });
  await check('A cross-rate render missing two or more frames is never repaired', async () => {
    for (const length of [44098, 44000]) { const f = fixture({ length }); f.sameSamples(await f.renderer._audio(f.result, f.session)); await assert.rejects(f.renderer._render(f.session, captured(), {}), /shorter than the requested pattern/); }
  });
  await check('A genuinely short source WAV cannot be made long enough by the decoder accommodation', async () => {
    const f = fixture({ wav: { frames: 47999 } }); f.sameSamples(await f.renderer._audio(f.result, f.session)); await assert.rejects(f.renderer._render(f.session, captured(), {}), /shorter than the requested pattern/);
  });
  await check('Non-native, invalid or metadata-mismatched WAV headers do not qualify for padding', async () => {
    const mutations = [view => view.setUint8(0, 0), view => view.setUint16(20, 3, true), view => view.setUint16(22, 0, true), view => view.setUint16(22, 3, true),
      view => view.setUint16(34, 8, true), view => view.setUint32(24, 24000, true), view => view.setUint32(40, view.getUint32(40, true) + 8, true), view => view.setUint8(36, 0)];
    for (const mutate of mutations) { const f = fixture({ blob: wav({ mutate }) }); f.sameSamples(await f.renderer._audio(f.result, f.session)); }
    const f = fixture({ blob: new Blob([new Uint8Array(20)]) }); f.sameSamples(await f.renderer._audio(f.result, f.session));
    const missingMetadata = fixture({ result: { blob: wav() } }); missingMetadata.sameSamples(await missingMetadata.renderer._audio(missingMetadata.result, missingMetadata.session));
  });
  await check('Malformed standard PCM geometry does not qualify as a valid native WAV', async () => {
    for (const mutate of [view => view.setUint32(16, 17, true), view => view.setUint32(28, 1, true), view => view.setUint16(32, 1, true), view => view.setUint32(4, 0, true), view => view.setUint32(40, view.getUint32(40, true) - 1, true)]) {
      const f = fixture({ blob: wav({ frames: 48001, mutate }) }); f.sameSamples(await f.renderer._audio(f.result, f.session));
    }
  });
  await check('Stereo Float32 PCM results retain native behavior and are never padded', async () => {
    const pcm = Float32Array.from({ length: 47999 * 2 }, (_, i) => Math.fround(.11 * Math.sin(i * .1))), f = fixture({ result: { pcm, sampleRate: 48000 } });
    const audio = await f.renderer._audio(f.result, f.session); assert.equal(audio.left.length, 47999); assert.equal(audio.right.length, 47999);
    for (let i = 0; i < 47999; i++) { assert.equal(audio.left[i], pcm[i * 2]); assert.equal(audio.right[i], pcm[i * 2 + 1]); }
    assert.equal(f.decodes(), 0); await assert.rejects(f.renderer._render(f.session, captured(), {}), /shorter than the requested pattern/);
  });
  await check('Abort before or during native decoding returns no repaired audio', async () => {
    const before = fixture(), first = new AbortController(); first.abort(); await assert.rejects(before.renderer._audio(before.result, before.session, first.signal), error => error.name === 'AbortError'); assert.equal(before.decodes(), 0);
    const decodeDeferred = deferred(), f = fixture({ decodeDeferred }), controller = new AbortController(), pending = f.renderer._audio(f.result, f.session, controller.signal);
    for (let i = 0; i < 20 && !f.decodes(); i++) await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.decodes(), 1); controller.abort(); decodeDeferred.resolve(); await assert.rejects(pending, error => error.name === 'AbortError');
  });
  await check('Abort during the extra header read cannot return a padded source', async () => {
    const real = wav(), header = deferred(); let reading = false;
    const blob = { size: real.size, arrayBuffer: () => real.arrayBuffer(), slice: (...args) => ({ arrayBuffer: async () => { reading = true; await header.promise; return real.slice(...args).arrayBuffer(); } }) };
    const f = fixture({ blob }), controller = new AbortController(), pending = f.renderer._audio(f.result, f.session, controller.signal);
    for (let i = 0; i < 30 && !reading; i++) await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(reading, true); controller.abort(); header.resolve(); await assert.rejects(pending, error => error.name === 'AbortError');
  });
  for (const name of passed) console.log('PASS', name); for (const { name, error } of failures) console.error('FAIL', name, '\n' + error.stack);
  console.log(`SERVICE note decoding: ${passed.length} passed, ${failures.length} failed.`); if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
