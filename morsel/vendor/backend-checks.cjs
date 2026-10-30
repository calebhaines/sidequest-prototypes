'use strict';
// Execute the unchanged speech core in actual worker_threads. The small browser
// adapter only supplies Blob URLs and event shapes; synthesis is production code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker } = require('node:worker_threads');
const directory = path.resolve(__dirname, '..');
const blobs = new Map(); let ordinal = 0;
class BrowserWorker {
  constructor(url) {
    const blob = blobs.get(url); this.closed = false;
    this.initialized = blob.text().then(source => {
      if (this.closed) return;
      const bridge = "const{parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.location={href:'blob:http://local/offline'};globalThis.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer);parentPort.on('message',data=>globalThis.onmessage({data}));\n";
      this.thread = new Worker(bridge + source, { eval: true });
      this.thread.on('message', data => this.onmessage?.({ data }));
      this.thread.on('error', error => this.onerror?.({ message: error.message }));
    });
  }
  postMessage(message) { this.initialized.then(() => { if (!this.closed) this.thread.postMessage(message); }); }
  terminate() { this.closed = true; this.thread?.terminate(); }
}
const scope = { window: null, console, Blob, Float32Array, DOMException, setTimeout, clearTimeout, Worker: BrowserWorker,
  URL: { createObjectURL(blob) { const id = 'blob:voice-check-' + ++ordinal; blobs.set(id, blob); return id; }, revokeObjectURL(id) { blobs.delete(id); } } };
scope.window = scope; vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(directory, 'vendor/speech-assets.js'), 'utf8'), scope);
vm.runInContext(fs.readFileSync(path.join(directory, 'speech-source.js'), 'utf8'), scope);
const speech = scope.MorselSpeech;
function metrics(audio) {
  assert(audio.left.length > 100 && audio.left.length < audio.sampleRate * 30);
  let power = 0, peak = 0; for (const value of audio.left) { assert(Number.isFinite(value)); power += value * value; peak = Math.max(peak, Math.abs(value)); }
  assert(peak > .01 && peak <= 1); assert(power > .1); assert.equal(audio.sampleRate, 22050);
  assert(audio.onsetFrame >= 0 && audio.endFrame > audio.onsetFrame && audio.endFrame <= audio.left.length);
  return { rms: Math.sqrt(power / audio.left.length), length: audio.left.length };
}
(async () => {
  try {
    const opening = speech.prepare(); assert.equal(opening, speech.prepare()); await opening; assert(speech.ready);
    const voices = [];
    for (const voice of ['alto', 'tenor', 'bass', 'robot']) {
      const audio = await speech.render('hello kitchen', { voice, pitch: 57, speed: 175 }); metrics(audio);
      assert(audio.pitchConfidence > .75); assert(Math.abs(audio.pitchHz - 220) < 15, voice + ' has a measured flat musical source');
      voices.push(audio);
    }
    for (let a = 0; a < voices.length; a++) for (let b = a + 1; b < voices.length; b++) assert.notDeepEqual(voices[a].left, voices[b].left, 'Every pair uses a distinct actual vocal tract');
    console.log('PASS four real profiles render finite English speech and measured reference pitch in a production worker');

    const soundPrints = new Set();
    for (const text of ['ah', 'ee', 'oo', 'mm', 'sh']) {
      const audio = await speech.render(text, { voice: 'alto', pitch: 57 }); const measured = metrics(audio);
      soundPrints.add(measured.length + ':' + measured.rms.toFixed(8));
      if (text !== 'sh') assert(audio.pitchConfidence > .75, text + ' is a voiced sound');
    }
    assert.equal(soundPrints.size, 5);
    console.log('PASS quick vowels, hum and sh sound are distinct actual phonemes rather than spoken abbreviations');

    const first = await speech.render('hello kitchen', { voice: 'alto', pitch: 57 });
    const before = first.left.slice(); first.left.fill(0);
    const second = await speech.render('hello kitchen', { voice: 'alto', pitch: 57 }); assert.deepEqual(second.left, before);
    const low = await speech.render('ah', { voice: 'alto', pitch: 48 }); const high = await speech.render('ah', { voice: 'alto', pitch: 72 });
    metrics(low); metrics(high); assert(low.pitchHz < 150 && high.pitchHz > 480);
    console.log('PASS cached PCM is detached and pitch changes have independent flat reference measurements');

    for (let n = 0; n < 81; n++) metrics(await speech.render('word ' + n, { voice: 'tenor', pitch: 57, speed: 300 }));
    metrics(await speech.render('still speaking after many words', { voice: 'bass', pitch: 57 }));
    console.log('PASS the upstream eightieth-call memory reset retains installed offline voices and subsequent speech');

    const controller = new AbortController(); controller.abort();
    await assert.rejects(speech.render('hello', { signal: controller.signal }), error => error.name === 'AbortError');
    const during = new AbortController(), request = speech.render('a phrase to cancel', { signal: during.signal }); await Promise.resolve(); during.abort();
    await assert.rejects(request, error => error.name === 'AbortError');
    for (const [text, options] of [['', {}], ['x'.repeat(161), {}], ['hi', { voice: 'other' }], ['hi', { pitch: NaN }], ['hi', { speed: 0 }]]) await assert.rejects(speech.render(text, options));
    const unfinished = speech.render('a running phrase to dispose'); await Promise.resolve(); speech.dispose(); await assert.rejects(unfinished, error => error.name === 'AbortError'); assert(!speech.ready);
    const preparing = speech.prepare(); speech.dispose(); await assert.rejects(preparing, error => error.name === 'AbortError');
    await speech.prepare(); metrics(await speech.render('ready again', { voice: 'robot', pitch: 57 }));
    console.log('PASS invalid and cancelled preparations reject cleanly; disposal releases workers and preparation can restart');
  } finally { speech.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
