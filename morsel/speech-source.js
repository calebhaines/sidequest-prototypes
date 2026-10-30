/* MORSEL speech source · GNU GPL v3. See vendor/COPYING and vendor/README.md. */
(function (scope) {
  'use strict';
  const VOICES = ['alto', 'tenor', 'bass', 'robot'];
  const MAX_CACHE_BYTES = 24 * 1024 * 1024;
  const cache = new Map(), pending = new Map();
  let cacheBytes = 0, worker = null, workerURL = null, preparing = null, boot = null, ready = false, ordinal = 0;
  const aborted = () => new DOMException('Voice preparation cancelled.', 'AbortError');
  const copy = value => ({ ...value, left: value.left.slice() });

  function workerProgram() {
    const assets = scope.MorselSpeechAssets;
    if (!assets || typeof assets.core !== 'string' || !assets.english?.voice) throw Error('MORSEL’s offline voice sources are missing. Reopen the complete instrument HTML.');
    // meSpeak's unchanged core receives an in-memory request implementation.
    // Its voice modules never fetch a URL, even when opened as a local file.
    const head = `const english=${JSON.stringify(assets.english)};\nconst voiceFiles=new Map();\nclass MemoryRequest{open(method,path){this.path=path;}send(){if(!voiceFiles.has(this.path))throw Error('Unknown offline voice module');this.responseText=voiceFiles.get(this.path);this.status=200;this.readyState=4;this.onreadystatechange();}}\nconst core=(function(XMLHttpRequest,importScripts,WorkerGlobalScope){\n`;
    return head + assets.core + '\nreturn meSpeakCore;})(MemoryRequest,undefined,undefined);\n(' + runWorker.toString() + ')(core,english,voiceFiles);';
  }

  function runWorker(core, english, voiceFiles) {
    'use strict';
    const loaded = new Set();
    const base = atob(english.voice);
    const sounds = { ah: 'A:', ee: 'i:', oo: 'u:', oh: 'oU', mm: 'm:', sh: 'S:', sss: 's:', la: 'la:', na: 'na:', da: 'da:' };
    // These profiles alter vocal-tract formants and excitation at the same
    // fundamental pitch. They are distinct voices, not transposed samples.
    const profiles = {
      alto: 'gender female\nformant 0 105 80 150\nformant 1 110 80 160\nformant 2 110 70 150\nformant 3 110 70 150\nformant 4 115 80 150\nformant 5 115 80 150\nformant 6 110 70 150\nformant 7 110 70 150\nformant 8 110 70 150\nbreath 0 2 3 3 3 3 3 2\nconsonants 125 125\n',
      tenor: 'gender male\nformant 0 98 100 100\nformant 1 97 100 100\nformant 2 97 95 100\nformant 3 97 95 100\nformant 4 97 85 100\nformant 5 105 80 100\nformant 6 95 80 100\nformant 7 100 100 100\nformant 8 100 100 100\nconsonants 100 110\n',
      bass: 'gender male\nformant 0 86 100 115\nformant 1 86 100 125\nformant 2 84 95 120\nformant 3 90 95 115\nformant 4 90 90 115\nformant 5 95 90 115\nformant 6 95 80 110\nformant 7 95 80 110\nformant 8 95 80 110\nvoicing 115\nconsonants 110 110\n',
      robot: 'gender male\nklatt 3\nformant 0 100 100 115\nformant 1 100 100 115\nformant 2 100 100 115\nformant 3 100 100 115\nformant 4 100 100 115\nconsonants 120 120\nvoicing 110\n'
    };

    function loadVoice(voice, pitch) {
      const id = 'morsel/' + voice + '-' + pitch;
      const hz = 440 * Math.pow(2, (pitch - 69) / 12);
      // eSpeak's fixed base is approximately nine Hz below its voice-file
      // number at neutral pitch. The measured returned pitch is authoritative.
      const number = Math.round(Math.max(50, Math.min(1800, hz + 9)));
      if (loaded.has(id)) return { id, expectedHz: number - 9 };
      const data = { ...english, voice_id: id, voice_encoding: 'text', voice: base + '\n' + profiles[voice] + '\npitch ' + number + ' ' + number + '\nflutter 0\nroughness 0\nintonation 1\n' };
      voiceFiles.set(id, JSON.stringify(data));
      let okay = false;
      core.loadVoice(id, success => { okay = success; });
      if (!okay) throw Error('Could not prepare the offline ' + voice + ' voice.');
      loaded.add(id); return { id, expectedHz: number - 9 };
    }

    function decodeWav(buffer) {
      const data = new DataView(buffer);
      if (data.byteLength < 44 || data.getUint32(0, false) !== 0x52494646 || data.getUint32(8, false) !== 0x57415645) throw Error('The speech engine returned invalid audio.');
      let at = 12, rate = 0, channels = 0, bits = 0, format = 0, start = -1, size = 0;
      while (at + 8 <= data.byteLength) {
        const id = data.getUint32(at, false), bytes = data.getUint32(at + 4, true);
        if (bytes > data.byteLength - at - 8) throw Error('The speech engine returned incomplete audio.');
        if (id === 0x666d7420 && bytes >= 16) { format = data.getUint16(at + 8, true); channels = data.getUint16(at + 10, true); rate = data.getUint32(at + 12, true); bits = data.getUint16(at + 22, true); }
        if (id === 0x64617461) { start = at + 8; size = bytes; }
        at += 8 + bytes + (bytes % 2);
      }
      if (format !== 1 || channels !== 1 || bits !== 16 || rate !== 22050 || start < 0 || size % 2 || size / 2 > rate * 30) throw Error('This phrase could not be rendered. Try a shorter word or a faster articulation.');
      const left = new Float32Array(size / 2); let peak = 0;
      for (let frame = 0; frame < left.length; frame++) { left[frame] = data.getInt16(start + frame * 2, true) / 32768; peak = Math.max(peak, Math.abs(left[frame])); }
      let onsetFrame = 0, endFrame = left.length;
      const threshold = Math.max(1 / 32768, peak * .0002);
      while (onsetFrame < endFrame && Math.abs(left[onsetFrame]) <= threshold) onsetFrame++;
      while (endFrame > onsetFrame && Math.abs(left[endFrame - 1]) <= threshold) endFrame--;
      return { left, sampleRate: rate, onsetFrame, endFrame };
    }

    function measurePitch(left, rate, expected) {
      const minimum = Math.max(3, Math.floor(rate / (expected * 1.2))), maximum = Math.min(Math.floor(rate / 20), Math.ceil(rate / (expected * .8)));
      if (minimum >= maximum || left.length < maximum * 4) return { pitchHz: expected, pitchConfidence: 0 };
      const count = Math.min(left.length - maximum, Math.max(768, maximum * 5)), windows = [];
      for (let at = 0; at + count + maximum <= left.length; at += Math.max(128, Math.floor(count / 2))) {
        let power = 0; for (let i = at; i < at + count; i++) power += left[i] * left[i];
        windows.push({ at, power });
      }
      windows.sort((a, b) => b.power - a.power);
      let winner = { hz: expected, correlation: 0 };
      for (const { at, power } of windows.slice(0, 6)) {
        if (power < .00001) continue;
        const values = [];
        for (let lag = minimum; lag <= maximum; lag++) {
          let sum = 0, a = 0, b = 0;
          for (let frame = at; frame < at + count; frame++) { const x = left[frame], y = left[frame + lag]; sum += x * y; a += x * x; b += y * y; }
          values.push(sum / Math.max(1e-12, Math.sqrt(a * b)));
        }
        let best = 0; for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
        if (values[best] > winner.correlation) {
          const before = values[best - 1] ?? values[best], after = values[best + 1] ?? values[best], denominator = before - 2 * values[best] + after;
          const fraction = denominator ? Math.max(-.5, Math.min(.5, .5 * (before - after) / denominator)) : 0;
          winner = { hz: rate / (minimum + best + fraction), correlation: values[best] };
        }
      }
      return { pitchHz: winner.correlation > .55 ? winner.hz : expected, pitchConfidence: winner.correlation };
    }

    self.onmessage = event => {
      const job = event.data;
      try {
        const prepared = loadVoice(job.voice, job.pitch), id = prepared.id;
        const source = sounds[job.text.toLowerCase()] ? '[[' + sounds[job.text.toLowerCase()] + ']]' : job.text;
        const wav = core.speak(['-w', 'wav.wav', '-a', '100', '-g', '0', '-p', '50', '-s', String(job.speed), '-b', '1', '-v', id, '-z', '--path=/espeak', '--', source]);
        const result = decodeWav(wav), requestedPitchHz = 440 * Math.pow(2, (job.pitch - 69) / 12);
        // Report actual source F0 so the musical renderer can fit pitch and
        // duration independently without moving the speaker's formants.
        const pitch = measurePitch(result.left, result.sampleRate, prepared.expectedHz);
        self.postMessage({ id: job.id, result: { ...result, ...pitch, requestedPitchHz, voice: job.voice, text: job.text } }, [result.left.buffer]);
      } catch (error) { self.postMessage({ id: job.id, error: error?.message || String(error) }); }
    };
    self.postMessage({ ready: true });
  }

  function clearWorker(error) {
    if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); } worker = null; ready = false; preparing = null;
    if (boot) { clearTimeout(boot.timer); boot.reject(error); boot = null; }
    if (workerURL) URL.revokeObjectURL(workerURL); workerURL = null;
    for (const job of pending.values()) { job.cleanup(); job.reject(error); }
    pending.clear();
  }

  function prepare() {
    if (ready) return Promise.resolve();
    if (preparing) return preparing;
    if (typeof scope.Worker !== 'function') return Promise.reject(Error('MORSEL needs a browser with Web Worker support to prepare its voices.'));
    const preparation = new Promise((resolve, reject) => {
      try {
        workerURL = URL.createObjectURL(new Blob([workerProgram()], { type: 'application/javascript' }));
        worker = new scope.Worker(workerURL);
        boot = { reject, timer: setTimeout(() => { const error = Error('MORSEL’s voices took too long to prepare. Reopen the instrument and try again.'); clearWorker(error); }, 30000) };
        worker.onmessage = event => {
          const message = event.data;
          if (message.ready) { if (boot) clearTimeout(boot.timer); boot = null; ready = true; if (workerURL) URL.revokeObjectURL(workerURL); workerURL = null; resolve(); return; }
          const job = pending.get(message.id); if (!job) return;
          pending.delete(message.id); job.cleanup();
          if (message.error) { job.reject(Error(message.error)); return; }
          const result = message.result;
          if (!(result?.left instanceof Float32Array) || result.sampleRate !== 22050) { job.reject(Error('MORSEL received invalid prepared speech.')); return; }
          const stored = copy(result); if (cache.has(job.key)) cacheBytes -= cache.get(job.key).left.byteLength; cache.set(job.key, stored); cacheBytes += stored.left.byteLength;
          while (cacheBytes > MAX_CACHE_BYTES && cache.size) { const key = cache.keys().next().value; cacheBytes -= cache.get(key).left.byteLength; cache.delete(key); }
          job.resolve(copy(result));
        };
        worker.onerror = event => { const error = Error(event.message || 'MORSEL could not prepare its offline voices.'); clearWorker(error); reject(error); };
        worker.onmessageerror = () => { const error = Error('MORSEL could not receive its prepared voice audio.'); clearWorker(error); reject(error); };
      } catch (error) { clearWorker(error); reject(error); }
    });
    preparing = preparation;
    preparation.catch(() => { if (preparing === preparation) preparing = null; });
    return preparation;
  }

  async function render(text, options = {}) {
    if (typeof text !== 'string' || !text.trim() || text.length > 160 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw Error('Enter a word or short phrase, up to 160 characters.');
    const voice = options.voice ?? 'alto', pitch = options.pitch ?? 57, speed = options.speed ?? 175;
    if (!VOICES.includes(voice)) throw Error('Choose Alto, Tenor, Bass or Robot.');
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw Error('Choose a MIDI note between 0 and 127.');
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 80 || speed > 450) throw Error('Articulation must be between 80 and 450 words per minute.');
    if (options.signal?.aborted) throw aborted();
    const normalized = text.trim().replace(/\s+/g, ' '), key = JSON.stringify([normalized, voice, pitch, speed]);
    if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return copy(value); }
    await prepare(); if (options.signal?.aborted) throw aborted();
    return new Promise((resolve, reject) => {
      const id = ++ordinal;
      const abort = () => { const job = pending.get(id); if (job) { pending.delete(id); job.cleanup(); reject(aborted()); } };
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const timer = setTimeout(() => { if (!pending.has(id)) return; pending.delete(id); cleanup(); reject(Error('That word took too long to prepare. Try a shorter phrase.')); }, 30000);
      pending.set(id, { key, resolve, reject, cleanup }); options.signal?.addEventListener('abort', abort, { once: true });
      try { worker.postMessage({ id, text: normalized, voice, pitch, speed }); }
      catch (error) { pending.delete(id); cleanup(); reject(error); }
    });
  }

  function dispose() {
    clearWorker(aborted()); cache.clear(); cacheBytes = 0;
  }
  scope.MorselSpeech = Object.freeze({ prepare, render, dispose, clearCache() { cache.clear(); cacheBytes = 0; }, get ready() { return ready; }, voices: Object.freeze(VOICES.slice()) });
})(window);
