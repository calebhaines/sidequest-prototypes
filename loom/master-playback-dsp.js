/* GALLEY master playback. Signalsmith Stretch is loaded lazily from the existing
   MORSEL bundle; its MIT notice accompanies the app. No processing at neutral. */
(function (scope) {
  'use strict';
  const MAX_PCM_BYTES = 384 * 1024 * 1024;
  const abortError = message => Object.assign(new Error(message || 'Master preparation cancelled.'), { name: 'AbortError' });
  const finite = (v, fallback) => (typeof v === 'number' || typeof v === 'string' && v.trim()) && Number.isFinite(Number(v)) ? Number(v) : fallback;
  function normalize(value) {
    const s = value && typeof value === 'object' ? value : {};
    return { speed: Math.max(.25, Math.min(2, finite(s.speed, 1))), pitch: Math.max(-24, Math.min(24, finite(s.pitch, 0))), preservePitch: typeof s.preservePitch === 'boolean' ? s.preservePitch : true };
  }
  function pitchSemitones(value) { const s = normalize(value); return s.pitch + (s.preservePitch ? 0 : 12 * Math.log2(s.speed)); }
  function isNeutral(value) { const s = normalize(value); return s.speed === 1 && s.pitch === 0; }
  function durationFrames(frames, value) {
    if (!Number.isSafeInteger(frames) || frames < 0) throw new RangeError('Invalid master frame count.');
    const count = Math.round(frames / normalize(value).speed);
    if (!Number.isSafeInteger(count)) throw new RangeError('Master output is too long.');
    return count;
  }
  function embeddedAssets() {
    const html = scope.LoomEmbeddedInstruments && scope.LoomEmbeddedInstruments.morsel;
    if (typeof html !== 'string') throw new Error('The bundled MORSEL stretch engine is unavailable. Open the complete GALLEY app.');
    const marker = 'window.MorselStretchAssets=';
    const at = html.indexOf(marker);
    if (at < 0) throw new Error('The bundled stretch engine was not found.');
    let start = at + marker.length, end = start, depth = 0, quoted = false, escaped = false;
    while (/\s/.test(html[start] || '') && start < html.length) ++start;
    if (html[start] !== '{') throw new Error('The bundled stretch engine is invalid.');
    for (; end < html.length; ++end) {
      const c = html[end];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{') ++depth;
      else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, end + 1));
    }
    throw new Error('The bundled stretch engine is incomplete.');
  }
  function workerProgram() {
    'use strict';
    let module, busy = false;
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    const send = (type, id, extra, transfer) => self.postMessage(Object.assign({ type, id }, extra), transfer || []);
    self.onmessage = async event => {
      const data = event.data;
      if (data.type === 'boot') {
        try {
          const factory = new Function(data.core + '\nreturn SignalsmithStretch;')();
          module = await factory(); module._main(); send('ready', 0);
        } catch (error) { send('error', 0, { message: error.message || String(error) }); }
        return;
      }
      if (data.type !== 'process' || busy) return;
      busy = true;
      const id = data.id;
      try {
        const left = new Float32Array(data.left), right = new Float32Array(data.right);
        const frames = data.frames, sampleRate = data.sampleRate, inputFrames = left.length;
        for (let offset = 0; offset < inputFrames; offset += 262144) {
          const end = Math.min(inputFrames, offset + 262144);
          for (let i = offset; i < end; ++i) if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('Master audio contains non-finite samples.');
          if (end < inputFrames) await pause();
        }
        module._presetDefault(2, sampleRate); module._reset();
        module._setTransposeSemitones(data.pitch, 0); module._setFormantSemitones(0, false);
        const inputLatency = module._inputLatency(), outputLatency = module._outputLatency();
        const block = 1024, capacity = Math.max(inputLatency, outputLatency, block * 2 + 2);
        const pointer = module._setBuffers(2, capacity);
        let heap, memory;
        function refresh() {
          const next = module.HEAP8.buffer;
          if (memory !== next) { memory = next; heap = new Float32Array(next, pointer, capacity * 4); }
        }
        function load(offset, count) {
          refresh(); heap.fill(0, 0, capacity * 2);
          if (offset < inputFrames) {
            const end = Math.min(inputFrames, offset + count);
            heap.set(left.subarray(offset, end), 0); heap.set(right.subarray(offset, end), capacity);
          }
        }
        const outL = new Float32Array(frames), outR = new Float32Array(frames);
        const preL = new Float32Array(outputLatency), preR = new Float32Array(outputLatency);
        // This follows Signalsmith's exact() offline boundary treatment: prime,
        // reflect the discarded beginning, trim latency, and flush the ending.
        function collect(position, count, reflect) {
          refresh();
          for (let i = 0; i < count; ++i) {
            const source = position + i, target = source - outputLatency;
            let l = heap[capacity * 2 + i], r = heap[capacity * 3 + i];
            if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error('The stretch engine produced invalid audio.');
            if (source < outputLatency) { preL[source] = l; preR[source] = r; }
            if (target >= 0 && target < frames) {
              if (reflect && target < outputLatency) { l -= preL[outputLatency - 1 - target]; r -= preR[outputLatency - 1 - target]; }
              outL[target] = l; outR[target] = r;
            }
          }
        }
        load(0, inputLatency); module._seek(inputLatency, inputFrames / frames);
        let done = 0, consumed = 0, batch = 0;
        while (done < frames) {
          const count = Math.min(block, frames - done), next = Math.round((done + count) * inputFrames / frames);
          const inputCount = next - consumed;
          load(inputLatency + consumed, inputCount); module._process(inputCount, count);
          collect(done, count, true); done += count; consumed = next;
          if (++batch === 12 || done === frames) { batch = 0; send('progress', id, { progress: Math.min(.99, done / frames) }); await pause(); }
        }
        module._flush(outputLatency);
        // flush() already handles its own ending boundary. Do not reflect twice.
        collect(frames, outputLatency, false);
        send('result', id, { left: outL.buffer, right: outR.buffer, sampleRate, frames }, [outL.buffer, outR.buffer]);
      } catch (error) { send('error', id, { message: error.message || String(error) }); }
      finally { busy = false; }
    };
  }
  class Processor {
    constructor(options) {
      const o = options || {};
      this._assets = o.assets || null; this._workerFactory = o.workerFactory || null;
      this._maxBytes = Math.min(MAX_PCM_BYTES, Math.max(0, finite(o.maxPcmBytes, MAX_PCM_BYTES)));
      this._worker = null; this._boot = null; this._job = null; this._serial = 0; this._disposed = false;
    }
    _finish(error, result) {
      const job = this._job;
      if (!job) return;
      this._job = null;
      if (job.signal) job.signal.removeEventListener('abort', job.abort);
      if (error) job.reject(error); else { if (job.onProgress) { try { job.onProgress(1); } catch (_) {} } job.resolve(result); }
    }
    _stop(error) {
      if (this._worker) { this._worker.terminate(); this._worker = null; }
      if (this._boot) { clearTimeout(this._boot.timer); if (this._boot.url) URL.revokeObjectURL(this._boot.url); this._boot.reject(error); this._boot = null; }
      this._finish(error);
    }
    _ensureWorker() {
      if (this._boot) return this._boot.promise;
      if (this._worker) return Promise.resolve();
      const assets = this._assets || embeddedAssets();
      if (!assets || typeof assets.core !== 'string' || !assets.core.includes('SignalsmithStretch') || !assets.core.includes('WebAssembly')) throw new Error('The bundled Signalsmith engine is invalid.');
      const source = '(' + workerProgram.toString() + ')();';
      let url = null, worker;
      if (this._workerFactory) worker = this._workerFactory(source);
      else { url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })); try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; } }
      this._worker = worker;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const boot = this._boot = { promise, resolve, reject, url, timer: null };
      boot.timer = setTimeout(() => this._stop(new Error('The stretch engine could not start.')), 30000);
      worker.onmessage = event => {
        if (this._worker !== worker) return;
        const d = event.data;
        if (d.type === 'ready') {
          clearTimeout(boot.timer); if (boot.url) URL.revokeObjectURL(boot.url);
          this._boot = null; boot.resolve(); return;
        }
        if (d.type === 'error' && !d.id) { this._stop(new Error(d.message)); return; }
        const job = this._job;
        if (!job || d.id !== job.id) return;
        if (d.type === 'progress') { if (job.onProgress) { try { job.onProgress(d.progress); } catch (_) {} } }
        else if (d.type === 'error') this._finish(new Error(d.message));
        else if (d.type === 'result') {
          const left = new Float32Array(d.left), right = new Float32Array(d.right);
          if (left.length !== job.frames || right.length !== job.frames || d.frames !== job.frames) this._finish(new Error('The stretch engine returned incomplete audio.'));
          else this._finish(null, { left, right, sampleRate: d.sampleRate, frames: d.frames });
        }
      };
      worker.onerror = event => { if (this._worker === worker) this._stop(new Error(event.message || 'The master playback worker failed.')); };
      try { worker.postMessage({ type: 'boot', core: assets.core }); } catch (error) { this._stop(error); }
      return promise;
    }
    async process(input, value, options) {
      if (this._disposed) throw abortError('The master processor has been disposed.');
      const o = options || {}, signal = o.signal, s = normalize(value);
      if (signal && signal.aborted) throw abortError();
      if (!input || Object.prototype.toString.call(input.left) !== '[object Float32Array]' || Object.prototype.toString.call(input.right) !== '[object Float32Array]' || input.left.length !== input.right.length) throw new TypeError('Master audio must have two equally sized Float32 channels.');
      const sampleRate = input.sampleRate;
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported master sample rate.');
      const frames = durationFrames(input.left.length, s), neutral = isNeutral(s);
      const inputBytes = input.left.length * 8, bytes = neutral ? inputBytes : inputBytes * 2 + frames * 8;
      if (bytes > this._maxBytes) throw new RangeError('Master speed preparation exceeds the 384 MiB PCM budget. Use a shorter song or render range.');
      if (this._job) this._stop(abortError('A newer master preparation replaced this one.'));
      if (neutral || !input.left.length) {
        for (let start = 0; start < input.left.length; start += 262144) {
          const end = Math.min(input.left.length, start + 262144);
          for (let i = start; i < end; ++i) if (!Number.isFinite(input.left[i]) || !Number.isFinite(input.right[i])) throw new Error('Master audio contains non-finite samples.');
          if (signal && signal.aborted) throw abortError();
          if (end < input.left.length) await new Promise(resolve => setTimeout(resolve, 0));
          if (this._disposed) throw abortError();
        }
        if (o.onProgress) { try { o.onProgress(1); } catch (_) {} }
        return { left: input.left, right: input.right, sampleRate, frames };
      }
      return new Promise((resolve, reject) => {
        const job = this._job = { id: ++this._serial, frames, resolve, reject, signal, onProgress: o.onProgress, abort: () => this._stop(abortError()) };
        if (signal) signal.addEventListener('abort', job.abort, { once: true });
        (async () => {
          try {
            await this._ensureWorker();
            if (this._job !== job) return;
            if (signal && signal.aborted) { this._stop(abortError()); return; }
            const left = input.left.slice(), right = input.right.slice();
            this._worker.postMessage({ type: 'process', id: job.id, left: left.buffer, right: right.buffer, frames, sampleRate, pitch: pitchSemitones(s) }, [left.buffer, right.buffer]);
          } catch (error) { if (this._job === job) this._stop(error); }
        })();
      });
    }
    dispose() { this._disposed = true; this._stop(abortError('The master processor has been disposed.')); this._assets = null; this._workerFactory = null; }
  }
  scope.LoomMasterTransform = Object.freeze({ normalize, isNeutral, durationFrames, pitchSemitones, Processor, MAX_PCM_BYTES });
})(typeof window !== 'undefined' ? window : globalThis);
