/* MORSEL natural neural voices. See vendor/neural/README.md for source and licensing. */
(function (scope) {
  'use strict';
  const VOICES = ['alto', 'tenor', 'bass', 'robot'];
  const MAX_CACHE_BYTES = 24 * 1024 * 1024;
  const cache = new Map(), pending = new Map();
  let cacheBytes = 0, worker = null, workerURL = null, preparing = null, boot = null, ready = false, ordinal = 0;
  const aborted = () => new DOMException('Voice preparation cancelled.', 'AbortError');
  const copy = value => ({ ...value, left: value.left.slice() });

  function prepareNeuralText(text, phonemes) {
    const value = text.trim(), prepared = /[.!?,;:]$/.test(value) ? value : value + ',';
    const terminal = prepared.slice(-1), styleIndex = Array.from(prepared).length;
    return { text: prepared, terminal, styleIndex, ...(phonemes === undefined ? {} : { phonemes: /[.!?,;:]$/.test(phonemes) ? phonemes : phonemes + terminal }) };
  }

  function trimNeuralPadding(generated, sampleRate) {
    if (!generated.length) throw Error('This word did not produce audio. Try a word or vowel.');
    if (generated.length > sampleRate * 30) throw Error('Use a shorter phrase for this note.');
    const window = Math.round(sampleRate * .01), powers = new Float64Array(Math.ceil(generated.length / window));
    let peak = 0, maximumPower = 0, totalPower = 0;
    for (let block = 0; block < powers.length; block++) {
      const start = block * window, end = Math.min(generated.length, start + window); let power = 0;
      for (let at = start; at < end; at++) {
        const value = generated[at]; if (!Number.isFinite(value)) throw Error('The voice returned invalid audio.');
        peak = Math.max(peak, Math.abs(value)); power += value * value;
      }
      totalPower += power; powers[block] = power / Math.max(1, end - start); maximumPower = Math.max(maximumPower, powers[block]);
    }
    if (peak < .000001) throw Error('This text did not produce a sound. Try a word or vowel.');
    // A fixed5000-frame cut removes most/all of some real short words. Locate
    // only quiet tail windows, then retain consonants/breath and an8ms margin.
    const floor = Math.max(1e-10, maximumPower * .0004);
    let last = powers.length - 1; while (last > 0 && powers[last] < floor) last--;
    let keep = Math.min(generated.length, (last + 1) * window + Math.ceil(sampleRate * .008)), removedPower = 0;
    for (let at = keep; at < generated.length; at++) removedPower += generated[at] * generated[at];
    // Quiet long tails still must not remove a meaningful share of the word.
    while (keep < generated.length && removedPower > totalPower * .001) {
      const end = Math.min(generated.length, keep + window);
      for (let at = keep; at < end; at++) removedPower -= generated[at] * generated[at];
      keep = end;
    }
    return { left: generated.slice(0, keep), peak, sourceFrames: generated.length, trimmedFrames: generated.length - keep, trimmedEnergyFraction: Math.max(0, removedPower / totalPower) };
  }

  function workerProgram() {
    const assets = scope.MorselSpeechAssets;
    if (assets?.backend !== 'kitten-tts-nano-0.8-int8') throw Error('MORSEL’s natural voice pack is missing. Reopen the complete instrument HTML.');
    return 'const trimNeuralPadding=' + trimNeuralPadding.toString() + ';\nconst prepareNeuralText=' + prepareNeuralText.toString() + ';\n(' + runWorker.toString() + ')(' + JSON.stringify(assets) + ');';
  }

  function runWorker(assets) {
    'use strict';
    let session, phonemize, styles;
    const urls = [], symbols = '$' + ';:,.!?¡¿—…"«»"" ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' + "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
    const dictionary = Object.fromEntries(Array.from(symbols, (char, index) => [char, index]));
    const sounds = { ah: 'ˈɑː', ee: 'ˈiː', oo: 'ˈuː', oh: 'ˈoʊ', mm: 'mː', sh: 'ʃː', sss: 'sː', la: 'lˈɑː', na: 'nˈɑː', da: 'dˈɑː' };
    async function unpack(encoded) {
      if (typeof DecompressionStream !== 'function') throw Error('Update your browser to prepare MORSEL’s natural voices.');
      const text = atob(encoded), bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
    function url(data, type) { const value = URL.createObjectURL(new Blob([data], { type })); urls.push(value); return value; }
    const initialized = (async () => {
      const [runtime, module, wasm, model, voices, phones] = await Promise.all(['runtime', 'module', 'wasm', 'model', 'styles', 'phonemizer'].map(key => unpack(assets[key])));
      importScripts(url(runtime, 'application/javascript'));
      phonemize = (await import(url(phones, 'application/javascript'))).phonemize;
      ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { mjs: url(module, 'application/javascript'), wasm: url(wasm, 'application/wasm') };
      session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      styles = new Float32Array(voices.buffer, voices.byteOffset, voices.byteLength / 4);
      assets = { profiles: assets.profiles, styleRows: assets.styleRows, styleWidth: assets.styleWidth, backend: assets.backend, modelHash: assets.modelHash };
      self.postMessage({ ready: true, backend: assets.backend, modelHash: assets.modelHash });
    })();
    initialized.catch(error => self.postMessage({ initializationError: error?.message || String(error) }));
    let queue = initialized;
    async function render(job) {
      const voice = assets.profiles.findIndex(profile => profile.id === job.voice);
      if (voice < 0) throw Error('Choose one of MORSEL’s four natural voices.');
      // Match upstream chunk_text/ensure_punctuation: bare words require a
      // terminal prosodic comma. The browser phonemizer omits punctuation, so
      // restore the marker that Python's preserve_punctuation=True retains.
      const prepared = prepareNeuralText(job.text);
      const plainIPA = sounds[job.text.toLowerCase()] || (await phonemize(prepared.text, 'en-us')).join(' ');
      const ipa = prepareNeuralText(job.text, plainIPA).phonemes;
      // Match Python Unicode-word tokenization; ASCII-only \w corrupts IPA.
      const phones = (ipa.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu) || []).join(' ');
      const ids = [0, ...Array.from(phones).filter(char => dictionary[char] !== undefined).map(char => dictionary[char]), 10, 0];
      if (ids.length <= 3 || ids.length > 512) throw Error('Use a word, vowel or shorter phrase for this note.');
      const at = (voice * assets.styleRows + Math.min(prepared.styleIndex, assets.styleRows - 1)) * assets.styleWidth;
      const output = await session.run({
        input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, value => BigInt(value)), [1, ids.length]),
        style: new ort.Tensor('float32', styles.slice(at, at + assets.styleWidth), [1, assets.styleWidth]),
        speed: new ort.Tensor('float32', Float32Array.of(job.speed / 175 * .8), [1]),
      });
      const generated = output[session.outputNames[0]].data, sampleRate = 24000;
      const padding = trimNeuralPadding(generated, sampleRate), left = padding.left, peak = padding.peak;
      if (peak > .98) for (let i = 0; i < left.length; i++) left[i] *= .98 / peak;
      let onsetFrame = 0, endFrame = left.length; const threshold = Math.max(.00001, peak * .0002);
      while (onsetFrame < endFrame && Math.abs(left[onsetFrame]) <= threshold) onsetFrame++;
      while (endFrame > onsetFrame && Math.abs(left[endFrame - 1]) <= threshold) endFrame--;
      // Natural F0 varies through each word. The note renderer measures its
      // voiced median before musical pitch shifting, preserving that contour.
      self.postMessage({ id: job.id, result: { ...padding, left, sampleRate, onsetFrame, endFrame, pitchHz: 0, pitchConfidence: 0, text: job.text, voice: job.voice, speaker: assets.profiles[voice].speaker, backend: assets.backend, modelHash: assets.modelHash } }, [left.buffer]);
    }
    self.onmessage = event => {
      const job = event.data;
      queue = queue.then(() => render(job)).catch(error => self.postMessage({ id: job.id, error: error?.message || String(error) }));
    };
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
        boot = { reject, timer: setTimeout(() => { const error = Error('MORSEL’s voices took too long to prepare. Reopen the instrument and try again.'); clearWorker(error); }, 60000) };
        worker.onmessage = event => {
          const message = event.data;
          if (message.initializationError) { clearWorker(Error(message.initializationError)); return; }
          if (message.ready) { if (boot) clearTimeout(boot.timer); boot = null; ready = true; if (workerURL) URL.revokeObjectURL(workerURL); workerURL = null; resolve(); return; }
          const job = pending.get(message.id); if (!job) return;
          pending.delete(message.id); job.cleanup();
          if (message.error) { job.reject(Error(message.error)); return; }
          const result = message.result;
          if (!(result?.left instanceof Float32Array) || result.sampleRate !== 24000) { job.reject(Error('MORSEL received invalid prepared speech.')); return; }
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
    if (!VOICES.includes(voice)) throw Error('Choose Alto, Tenor, Bass or Soprano.');
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw Error('Choose a MIDI note between 0 and 127.');
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 80 || speed > 450) throw Error('Articulation must be between 80 and 450 words per minute.');
    if (options.signal?.aborted) throw aborted();
    const normalized = text.trim().replace(/\s+/g, ' '), key = JSON.stringify([normalized, voice, speed]);
    if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return copy(value); }
    await prepare(); if (options.signal?.aborted) throw aborted();
    return new Promise((resolve, reject) => {
      const id = ++ordinal;
      const abort = () => { const job = pending.get(id); if (job) { pending.delete(id); job.cleanup(); reject(aborted()); } };
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const timer = setTimeout(() => { if (!pending.has(id)) return; pending.delete(id); cleanup(); reject(Error('That word took too long to prepare. Try a shorter phrase.')); }, 60000);
      pending.set(id, { key, resolve, reject, cleanup }); options.signal?.addEventListener('abort', abort, { once: true });
      try { worker.postMessage({ id, text: normalized, voice, pitch, speed }); }
      catch (error) { pending.delete(id); cleanup(); reject(error); }
    });
  }

  function dispose() {
    clearWorker(aborted()); cache.clear(); cacheBytes = 0;
  }
  scope.MorselSpeechDSP = Object.freeze({ trimPadding: trimNeuralPadding, prepareText: prepareNeuralText });
  scope.MorselSpeech = Object.freeze({ prepare, render, dispose, clearCache() { cache.clear(); cacheBytes = 0; }, get ready() { return ready; }, voices: Object.freeze(VOICES.slice()), backend: 'kitten-tts-nano-0.8-int8', modelHash: 'f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc', sampleRate: 24000, profiles: Object.freeze([{id:'alto',name:'Alto',speaker:'Bella'},{id:'tenor',name:'Tenor',speaker:'Jasper'},{id:'bass',name:'Bass',speaker:'Bruno'},{id:'robot',name:'Soprano',speaker:'Luna'}]) });
})(window);
