/* GALLEY master playback. Signalsmith Stretch is loaded lazily from the existing
   MORSEL bundle; its MIT notice accompanies the app. No processing at neutral. */
(function (scope) {
  'use strict';
  const MAX_PCM_BYTES = 384 * 1024 * 1024;
  const ALGORITHMS = Object.freeze([
    { id: 'signalsmith', name: 'Signalsmith · Original', description: 'Balanced, detailed stretching for complete mixes. The original GALLEY engine.' },
    { id: 'wsola', name: 'Rhythmic · WSOLA', description: 'Stereo-linked waveform alignment keeps rhythmic and percussive material focused.' },
    { id: 'phase-vocoder', name: 'Spectral · Phase vocoder', description: 'Classic frequency-domain stretching for sustained chords, pads and smooth spectral color.' },
    { id: 'granular', name: 'Texture · Granular', description: 'Overlapping short grains add a deliberately grainy, shimmering texture at larger speed changes.' }
  ].map(Object.freeze));
  const algorithmIds = new Set(ALGORITHMS.map(value => value.id));
  const abortError = message => Object.assign(new Error(message || 'Master preparation cancelled.'), { name: 'AbortError' });
  const finite = (v, fallback) => (typeof v === 'number' || typeof v === 'string' && v.trim()) && Number.isFinite(Number(v)) ? Number(v) : fallback;
  function normalize(value) {
    const s = value && typeof value === 'object' ? value : {};
    return { speed: Math.max(.25, Math.min(2, finite(s.speed, 1))), pitch: Math.max(-24, Math.min(24, finite(s.pitch, 0))), preservePitch: typeof s.preservePitch === 'boolean' ? s.preservePitch : true, algorithm: algorithmIds.has(s.algorithm) ? s.algorithm : 'signalsmith' };
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
    // The three JavaScript engines write directly to the final output grid.
    // Pitch is applied while reading virtual grains or FFT analysis windows; no
    // full-length expanded pitch intermediate is allocated.
    function makeReader(left, right, pitch) {
      let l = 0, r = 0;
      const size = left.length, phases = 256;
      const taps = pitch > 1.000001 ? 2 * Math.ceil(12 + 4 * pitch) : 0, half = taps / 2;
      const coefficients = taps ? new Float64Array(phases * taps) : null;
      if (coefficients) for (let phase = 0; phase < phases; phase++) {
        const fraction = phase / phases, cutoff = 1 / pitch; let sum = 0;
        for (let tap = 0; tap < taps; tap++) {
          const x = tap - half + 1 - fraction, angle = Math.PI * cutoff * x;
          const sinc = Math.abs(angle) < 1e-12 ? 1 : Math.sin(angle) / angle;
          const window = .42 + .5 * Math.cos(Math.PI * x / half) + .08 * Math.cos(2 * Math.PI * x / half);
          const value = cutoff * sinc * window;
          coefficients[phase * taps + tap] = value; sum += value;
        }
        for (let tap = 0; tap < taps; tap++) coefficients[phase * taps + tap] /= sum;
      }
      function linear(position) {
        const at = Math.floor(position), fraction = position - at;
        const aL = at >= 0 && at < size ? left[at] : 0, aR = at >= 0 && at < size ? right[at] : 0;
        const bL = at + 1 >= 0 && at + 1 < size ? left[at + 1] : 0, bR = at + 1 >= 0 && at + 1 < size ? right[at + 1] : 0;
        l = aL + (bL - aL) * fraction; r = aR + (bR - aR) * fraction;
      }
      function read(position) {
        if (!coefficients) { linear(position); return; }
        const at = Math.floor(position), phase = Math.min(phases - 1, Math.floor((position - at) * phases));
        const base = phase * taps, first = at - half + 1;
        l = r = 0;
        for (let tap = 0; tap < taps; tap++) {
          const index = first + tap;
          if (index >= 0 && index < size) { const gain = coefficients[base + tap]; l += left[index] * gain; r += right[index] * gain; }
        }
      }
      return { read, linear, get left() { return l; }, get right() { return r; } };
    }
    async function resampled(left, right, frames, pitch, id) {
      const reader = makeReader(left, right, pitch), outL = new Float32Array(frames), outR = new Float32Array(frames);
      const ratio = left.length / frames;
      for (let at = 0; at < frames; at++) {
        reader.read(at * ratio); outL[at] = reader.left; outR[at] = reader.right;
        if (!Number.isFinite(outL[at]) || !Number.isFinite(outR[at])) throw new Error('The stretch engine produced invalid audio.');
        if ((at & 32767) === 32767) { send('progress', id, { progress: Math.min(.99, (at + 1) / frames) }); await pause(); }
      }
      return { left: outL, right: outR };
    }
    function grainWindow(sampleRate, algorithm) {
      const length = Math.max(64, Math.round(sampleRate * (algorithm === 'wsola' ? .04 : .128) / 4) * 4);
      const window = new Float64Array(length);
      for (let j = 0; j < length; j++) window[j] = .5 + .5 * Math.cos(2 * Math.PI * (j - length / 2) / length);
      return window;
    }
    async function grains(left, right, frames, sampleRate, pitch, algorithm, id) {
      const window = grainWindow(sampleRate, algorithm), length = window.length, half = length / 2, hop = algorithm === 'granular' ? length / 2 : length / 4;
      const outL = new Float32Array(frames), outR = new Float32Array(frames), weight = new Float32Array(frames);
      const reader = makeReader(left, right, pitch), ratio = left.length / frames;
      const search = Math.min(hop, Math.round(sampleRate * .008 / Math.max(1, pitch))), stride = Math.max(1, Math.floor(length / 96));
      let center = 0, batch = 0;
      while (true) {
        const nominal = center * ratio; let shift = 0;
        if (algorithm === 'wsola' && center > 0 && center < frames - 1) {
          const first = Math.max(0, center - half), end = Math.min(frames, center), coarse = Math.max(1, Math.floor(search / 32));
          let best = -Infinity, reference = 0;
          for (let at = first; at < end; at += stride) if (weight[at] > 1e-8) { const l = outL[at] / weight[at], r = outR[at] / weight[at]; reference += l * l + r * r; }
          function score(offset) {
            let dot = 0, energy = 0;
            for (let at = first; at < end; at += stride) if (weight[at] > 1e-8) {
              reader.linear(nominal + (at - center + offset) * pitch);
              const l = outL[at] / weight[at], r = outR[at] / weight[at];
              dot += l * reader.left + r * reader.right; energy += reader.left * reader.left + reader.right * reader.right;
            }
            if (energy < 1e-16) return -Infinity;
            return dot / Math.sqrt(energy * reference) - .002 * Math.abs(offset) / Math.max(1, search);
          }
          if (reference > 1e-16) {
            best = score(0);
            for (let candidate = -search; candidate <= search; candidate += coarse) { const value = score(candidate); if (value > best + 1e-12) { best = value; shift = candidate; } }
            const around = shift;
            for (let candidate = Math.max(-search, around - coarse); candidate <= Math.min(search, around + coarse); candidate++) { const value = score(candidate); if (value > best + 1e-12) { best = value; shift = candidate; } }
          }
        }
        const inputCenter = center === frames - 1 ? left.length - 1 : nominal + shift * pitch;
        for (let j = Math.max(0, half - center); j < Math.min(length, frames - center + half); j++) {
          const at = center + j - half, gain = window[j];
          reader.read(inputCenter + (j - half) * pitch);
          outL[at] += reader.left * gain; outR[at] += reader.right * gain; weight[at] += gain;
        }
        if (center === frames - 1) break;
        center = Math.min(frames - 1, center + hop);
        if (++batch === 8) { batch = 0; send('progress', id, { progress: Math.min(.99, center / frames) }); await pause(); }
      }
      for (let at = 0; at < frames; at++) {
        if (weight[at] > 1e-12) { outL[at] /= weight[at]; outR[at] /= weight[at]; }
        if (!Number.isFinite(outL[at]) || !Number.isFinite(outR[at])) throw new Error('The stretch engine produced invalid audio.');
        if ((at & 262143) === 262143) await pause();
      }
      return { left: outL, right: outR };
    }
    function fftPlan(size) {
      const reverse = new Uint32Array(size), cosine = new Float64Array(size / 2), sine = new Float64Array(size / 2);
      let bits = 0; while ((1 << bits) < size) bits++;
      for (let i = 0; i < size; i++) { let x = i, value = 0; for (let bit = 0; bit < bits; bit++) { value = value * 2 + (x & 1); x >>>= 1; } reverse[i] = value; }
      for (let i = 0; i < size / 2; i++) { cosine[i] = Math.cos(2 * Math.PI * i / size); sine[i] = Math.sin(2 * Math.PI * i / size); }
      return function fft(real, imaginary, inverse) {
        for (let i = 0; i < size; i++) if (reverse[i] > i) { const j = reverse[i], re = real[i], im = imaginary[i]; real[i] = real[j]; imaginary[i] = imaginary[j]; real[j] = re; imaginary[j] = im; }
        for (let length = 2; length <= size; length *= 2) {
          const half = length / 2, step = size / length;
          for (let start = 0; start < size; start += length) for (let j = 0; j < half; j++) {
            const angle = j * step, c = cosine[angle], s = inverse ? sine[angle] : -sine[angle];
            const a = start + j, b = a + half, re = real[b] * c - imaginary[b] * s, im = real[b] * s + imaginary[b] * c;
            real[b] = real[a] - re; imaginary[b] = imaginary[a] - im; real[a] += re; imaginary[a] += im;
          }
        }
        if (inverse) for (let i = 0; i < size; i++) { real[i] /= size; imaginary[i] /= size; }
      };
    }
    async function spectral(left, right, frames, sampleRate, pitch, id) {
      let size = 512; while (size < sampleRate * .046 && size < 8192) size *= 2;
      const half = size / 2, bins = half + 1, fft = fftPlan(size), ratio = left.length / frames;
      const hop = Math.max(1, Math.floor(size / 4 * Math.min(1, pitch / ratio)));
      const window = new Float64Array(size), previous = Array.from({ length: 4 }, () => new Float64Array(bins)), rotation = new Float64Array(bins);
      const power = new Float64Array(bins), peaks = new Uint32Array(bins);
      const reL = new Float64Array(size), imL = new Float64Array(size), reR = new Float64Array(size), imR = new Float64Array(size);
      const resultReL = new Float64Array(size), resultImL = new Float64Array(size), resultReR = new Float64Array(size), resultImR = new Float64Array(size);
      const outL = new Float32Array(frames), outR = new Float32Array(frames), weight = new Float32Array(frames), reader = makeReader(left, right, pitch);
      for (let j = 0; j < size; j++) window[j] = Math.sqrt(.5 + .5 * Math.cos(2 * Math.PI * (j - half) / size));
      const principal = angle => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
      let center = 0, previousCenter = 0, first = true, batch = 0;
      while (true) {
        const analysisCenter = center * ratio, advance = (center - previousCenter) * ratio / pitch;
        for (let j = 0; j < size; j++) { reader.read(analysisCenter + (j - half) * pitch); reL[j] = reader.left * window[j]; reR[j] = reader.right * window[j]; imL[j] = imR[j] = 0; }
        fft(reL, imL, false); fft(reR, imR, false);
        resultReL.fill(0); resultImL.fill(0); resultReR.fill(0); resultImR.fill(0);
        for (let k = 0; k < bins; k++) {
          const crossRe = previous[0][k] * reL[k] + previous[1][k] * imL[k] + previous[2][k] * reR[k] + previous[3][k] * imR[k];
          const crossIm = previous[0][k] * imL[k] - previous[1][k] * reL[k] + previous[2][k] * imR[k] - previous[3][k] * reR[k];
          const omega = 2 * Math.PI * k / size;
          if (first) rotation[k] = 0;
          else if (advance > 0 && Math.abs(crossRe) + Math.abs(crossIm) > 1e-20) {
            const expected = omega * advance, delta = expected + principal(Math.atan2(crossIm, crossRe) - expected);
            rotation[k] = principal(rotation[k] + delta * ((center - previousCenter) / advance - 1));
          }
          previous[0][k] = reL[k]; previous[1][k] = imL[k]; previous[2][k] = reR[k]; previous[3][k] = imR[k];
          power[k] = reL[k] * reL[k] + imL[k] * imL[k] + reR[k] * reR[k] + imR[k] * imR[k];
        }
        // Identity phase locking keeps neighboring bins of one partial in
        // phase. The shared rotation still preserves each bin's stereo ratio;
        // summing channel waveforms here would cancel opposite-polarity audio.
        let peakCount = 0;
        for (let k = 0; k < bins; k++) if ((k === 0 || power[k] >= power[k - 1]) && (k === half || power[k] > power[k + 1])) peaks[peakCount++] = k;
        if (!peakCount) peaks[peakCount++] = 0;
        let peakIndex = 0;
        for (let k = 0; k < bins; k++) {
          while (peakIndex + 1 < peakCount && k > (peaks[peakIndex] + peaks[peakIndex + 1]) / 2) peakIndex++;
          const bin = k, angle = rotation[peaks[peakIndex]];
          const c = Math.cos(angle), s = Math.sin(angle), lRe = reL[k] * c - imL[k] * s, lIm = reL[k] * s + imL[k] * c, rRe = reR[k] * c - imR[k] * s, rIm = reR[k] * s + imR[k] * c;
          resultReL[bin] = lRe; resultImL[bin] = lIm; resultReR[bin] = rRe; resultImR[bin] = rIm;
        }
        resultImL[0] = resultImR[0] = resultImL[half] = resultImR[half] = 0;
        for (let k = 1; k < half; k++) { resultReL[size - k] = resultReL[k]; resultImL[size - k] = -resultImL[k]; resultReR[size - k] = resultReR[k]; resultImR[size - k] = -resultImR[k]; }
        fft(resultReL, resultImL, true); fft(resultReR, resultImR, true);
        for (let j = Math.max(0, half - center); j < Math.min(size, frames - center + half); j++) { const at = center + j - half, gain = window[j]; outL[at] += resultReL[j] * gain; outR[at] += resultReR[j] * gain; weight[at] += gain * gain; }
        previousCenter = center; first = false;
        if (center === frames - 1) break;
        center = Math.min(frames - 1, center + hop);
        if (++batch === 8) { batch = 0; send('progress', id, { progress: Math.min(.99, center / frames) }); await pause(); }
      }
      for (let at = 0; at < frames; at++) {
        if (weight[at] > 1e-12) { outL[at] /= weight[at]; outR[at] /= weight[at]; }
        if (!Number.isFinite(outL[at]) || !Number.isFinite(outR[at])) throw new Error('The stretch engine produced invalid audio.');
        if ((at & 262143) === 262143) await pause();
      }
      return { left: outL, right: outR };
    }
    self.onmessage = async event => {
      const data = event.data;
      if (data.type === 'boot') {
        try {
          if (data.core) { const factory = new Function(data.core + '\nreturn SignalsmithStretch;')(); module = await factory(); module._main(); }
          send('ready', 0);
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
        if (data.algorithm && data.algorithm !== 'signalsmith') {
          const pitch = Math.pow(2, data.pitch / 12), ratio = inputFrames / frames;
          let output;
          if (inputFrames < 32 || data.pureTape || Math.abs(pitch - ratio) < 1e-12) output = await resampled(left, right, frames, ratio, id);
          else if (data.algorithm === 'phase-vocoder') output = await spectral(left, right, frames, sampleRate, pitch, id);
          else output = await grains(left, right, frames, sampleRate, pitch, data.algorithm, id);
          send('result', id, { left: output.left.buffer, right: output.right.buffer, sampleRate, frames }, [output.left.buffer, output.right.buffer]);
          return;
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
      this._worker = null; this._workerKind = null; this._boot = null; this._job = null; this._serial = 0; this._disposed = false;
    }
    _finish(error, result) {
      const job = this._job;
      if (!job) return;
      this._job = null;
      if (job.signal) job.signal.removeEventListener('abort', job.abort);
      if (error) job.reject(error); else { if (job.onProgress) { try { job.onProgress(1); } catch (_) {} } job.resolve(result); }
    }
    _stop(error) {
      if (this._worker) { this._worker.terminate(); this._worker = null; this._workerKind = null; }
      if (this._boot) { clearTimeout(this._boot.timer); if (this._boot.url) URL.revokeObjectURL(this._boot.url); this._boot.reject(error); this._boot = null; }
      this._finish(error);
    }
    _ensureWorker(algorithm) {
      const kind = algorithm === 'signalsmith' ? 'signalsmith' : 'javascript';
      if (this._boot) return this._boot.promise;
      if (this._worker) return Promise.resolve();
      const assets = kind === 'signalsmith' ? this._assets || embeddedAssets() : null;
      if (kind === 'signalsmith' && (!assets || typeof assets.core !== 'string' || !assets.core.includes('SignalsmithStretch') || !assets.core.includes('WebAssembly'))) throw new Error('The bundled Signalsmith engine is invalid.');
      const source = '(' + workerProgram.toString() + ')();';
      let url = null, worker;
      if (this._workerFactory) worker = this._workerFactory(source);
      else { url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })); try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; } }
      this._worker = worker; this._workerKind = kind;
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
      try { worker.postMessage({ type: 'boot', core: assets ? assets.core : null }); } catch (error) { this._stop(error); }
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
      const inputBytes = input.left.length * 8, extraBytes = !input.left.length || s.algorithm === 'signalsmith' ? 0 : frames * 4 + 2 * 1024 * 1024;
      const bytes = neutral ? inputBytes : inputBytes * 2 + frames * 8 + extraBytes;
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
      const kind = s.algorithm === 'signalsmith' ? 'signalsmith' : 'javascript';
      if (this._worker && this._workerKind !== kind) this._stop(abortError('A different stretch engine replaced this worker.'));
      return new Promise((resolve, reject) => {
        const job = this._job = { id: ++this._serial, frames, resolve, reject, signal, onProgress: o.onProgress, abort: () => this._stop(abortError()) };
        if (signal) signal.addEventListener('abort', job.abort, { once: true });
        (async () => {
          try {
            await this._ensureWorker(s.algorithm);
            if (this._job !== job) return;
            if (signal && signal.aborted) { this._stop(abortError()); return; }
            const left = input.left.slice(), right = input.right.slice();
            this._worker.postMessage({ type: 'process', id: job.id, left: left.buffer, right: right.buffer, frames, sampleRate, pitch: pitchSemitones(s), algorithm: s.algorithm, pureTape: !s.preservePitch && s.pitch === 0 }, [left.buffer, right.buffer]);
          } catch (error) { if (this._job === job) this._stop(error); }
        })();
      });
    }
    dispose() { this._disposed = true; this._stop(abortError('The master processor has been disposed.')); this._assets = null; this._workerFactory = null; }
  }
  scope.LoomMasterTransform = Object.freeze({ normalize, isNeutral, durationFrames, pitchSemitones, Processor, MAX_PCM_BYTES, ALGORITHMS });
})(typeof window !== 'undefined' ? window : globalThis);
