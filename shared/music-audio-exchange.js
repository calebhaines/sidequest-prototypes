/* Kitchen shared audio exchange. No network, dependencies, or cloud storage. */
(function (global) {
  'use strict';
  if (global.MusicLabExchange) return;
  const MAX_BYTES = 64 * 1024 * 1024, MAX_SAMPLES = 32, MAX_SECONDS = 120;
  const appNames = Object.freeze({ GRAIN: 'SIZZLE', TINE: 'CLATTER', FORM: 'HOTPLATE', MIRE: 'REDUCE', SPOOL: 'ROTISSERIE', HAZE: 'STEAM', BOWER: 'SKEWER', RAVEL: 'DICER', FABLE: 'STOCK', ROUX: 'ROUX', PROOF: 'LEAVEN', LOOM: 'GALLEY' });
  const appName = value => appNames[String(value || '').toUpperCase()] || value || 'Kitchen';
  const registrations = new Map(), volatile = new Map();
  let databasePromise, persistent = true, dialog, active, previewSource, previewContext, previewOwnContext;
  const abortError = () => new DOMException('Sample exchange cancelled.', 'AbortError');
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value) || 0));
  const clean = (value, fallback = '') => String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
  const uid = () => global.crypto?.randomUUID?.() || 'sample-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const safeName = name => {
    const text = clean(name, 'Kitchen sample').replace(/[\\/:*?"<>|]/g, '-'), suffix = text.match(/(\.musiclab-audio\.json|\.[a-z0-9]{1,8})$/i)?.[1] || '';
    return (suffix ? text.slice(0, -suffix.length).slice(0, 100) + suffix : text.slice(0, 100)) || 'Kitchen sample';
  };
  const seconds = value => Number(value).toFixed(value < 10 ? 2 : 1) + ' s';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const icon = direction => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (direction === 'send' ? '<path d="M6 18 18 6M7 6h11v11"/>' : direction === 'receive' ? '<path d="M18 6 6 18M17 18H6V7"/>' : '<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>') + '</svg>';
  function audio(value, options = {}) {
    if (!value || typeof value !== 'object') throw new Error('This file does not contain audio.');
    const sampleRate = Number(value.sampleRate);
    let source = value.pcm || value.channels;
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Sample rate must be between 8,000 and 192,000 Hz.');
    if (ArrayBuffer.isView(source)) {
      const count = typeof value.channels === 'number' ? value.channels : value.channelCount || 2;
      if (![1, 2].includes(count) || source.length % count) throw new Error('Interleaved audio must have one or two complete channels.');
      const frames = source.length / count;
      if (source.length * 4 > MAX_BYTES || frames / sampleRate > (options.maxSeconds || MAX_SECONDS)) throw new Error('This audio is too long. Choose a shorter selection first.');
      const interleaved = source;
      source = Array.from({ length: count }, (_, ch) => { const channel = new Float32Array(frames); for (let i = 0; i < frames; i++) channel[i] = interleaved[i * count + ch]; return channel; });
    }
    if (!Array.isArray(source) || source.length < 1 || source.length > 2) throw new Error('Use mono or stereo audio.');
    const pcm = source.map(channel => Object.prototype.toString.call(channel) === '[object Float32Array]' ? channel : new Float32Array(channel));
    const frames = pcm[0].length;
    if (!frames || pcm.some(channel => channel.length !== frames)) throw new Error('Audio channels must have the same non-zero length.');
    if (frames / sampleRate > (options.maxSeconds || MAX_SECONDS)) throw new Error('Trim the sample to ' + (options.maxSeconds || MAX_SECONDS) + ' seconds or less first.');
    if (frames * pcm.length * 4 > MAX_BYTES) throw new Error('This sample exceeds the 64 MB audio limit. Choose a shorter selection.');
    for (const channel of pcm) for (let i = 0; i < channel.length; i++) if (!Number.isFinite(channel[i])) throw new Error('Audio contains invalid sample values.');
    return {
      pcm, sampleRate, frames, channels: pcm.length, duration: frames / sampleRate,
      name: clean(value.name, 'Untitled sample') || 'Untitled sample', sourceApp: clean(value.sourceApp, 'Imported audio'),
      tempo: Number.isFinite(Number(value.tempo)) && Number(value.tempo) > 0 ? Number(value.tempo) : null,
      bars: Number.isFinite(Number(value.bars)) && Number(value.bars) > 0 ? Number(value.bars) : null,
      tags: Array.isArray(value.tags) ? value.tags.slice(0, 12).map(tag => clean(tag).slice(0, 32)) : [],
      bytes: frames * pcm.length * 4
    };
  }
  function metadata(value) {
    const { pcm, ...meta } = value;
    return meta;
  }
  function waveform(data) {
    return Array.from({ length: 48 }, (_, bin) => {
      const start = Math.floor(bin / 48 * data.frames), end = Math.floor((bin + 1) / 48 * data.frames), stride = Math.max(1, Math.floor((end - start) / 80));
      let peak = 0;
      for (const channel of data.pcm) for (let i = start; i < end; i += stride) peak = Math.max(peak, Math.abs(channel[i]));
      return Math.round(Math.min(1, peak) * 1000) / 1000;
    });
  }
  function thumbnail(item) {
    const peaks = item.waveform || Array.from({ length: 24 }, (_, index) => .12 + Math.abs(Math.sin(index * .76 + Number(item.duration || 0))) * .25);
    const path = peaks.map((peak, index) => { const x = 2 + index / Math.max(1, peaks.length - 1) * 44, half = Math.max(.9, clamp(peak, 0, 1) * 15); return 'M' + x.toFixed(1) + ' ' + (24 - half).toFixed(1) + 'V' + (24 + half).toFixed(1); }).join('');
    return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
  }
  function base64(bytes) {
    let result = '';
    for (let offset = 0; offset < bytes.length; offset += 24576) {
      result += btoa(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 24576)));
    }
    return result;
  }
  function packetFromAudio(value) {
    const data = audio(value), bytes = new Uint8Array(data.frames * data.channels * 2), view = new DataView(bytes.buffer);
    for (let frame = 0; frame < data.frames; frame++) for (let ch = 0; ch < data.channels; ch++) {
      const sample = clamp(data.pcm[ch][frame], -1, 1);
      view.setInt16((frame * data.channels + ch) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return { format: 'musiclab-audio', version: 1, name: data.name, sourceApp: data.sourceApp, tempo: data.tempo, bars: data.bars, tags: data.tags,
      sampleRate: data.sampleRate, channels: data.channels, frames: data.frames, encoding: 'pcm16le', data: base64(bytes) };
  }
  function audioFromPacket(packet) {
    if (typeof packet === 'string') {
      if (packet.length > MAX_BYTES) throw new Error('This sample packet is too large.');
      try { packet = JSON.parse(packet); } catch (_) { throw new Error('This is not a valid Kitchen sample packet.'); }
    }
    if (!packet || packet.format !== 'musiclab-audio' || packet.version !== 1 || packet.encoding !== 'pcm16le') throw new Error('Use a version 1 Kitchen audio packet.');
    const rate = Number(packet.sampleRate), channels = Number(packet.channels), frames = Number(packet.frames);
    if (!Number.isInteger(rate) || rate < 8000 || rate > 192000 || ![1, 2].includes(channels) || !Number.isInteger(frames) || frames < 1 || frames / rate > MAX_SECONDS || frames * channels * 4 > MAX_BYTES) throw new Error('Invalid sample packet dimensions or length.');
    const expectedBytes = frames * channels * 2;
    if (typeof packet.data !== 'string' || packet.data.length !== 4 * Math.ceil(expectedBytes / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(packet.data)) throw new Error('Sample packet audio is damaged.');
    let binary;
    try { binary = atob(packet.data); } catch (_) { throw new Error('Sample packet audio is damaged.'); }
    if (binary.length !== expectedBytes) throw new Error('Sample packet length does not match its audio.');
    const bytes = new Uint8Array(expectedBytes), pcm = Array.from({ length: channels }, () => new Float32Array(frames));
    for (let i = 0; i < expectedBytes; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    for (let frame = 0; frame < frames; frame++) for (let ch = 0; ch < channels; ch++) {
      const sample = view.getInt16((frame * channels + ch) * 2, true);
      pcm[ch][frame] = sample / (sample < 0 ? 32768 : 32767);
    }
    return audio({ ...packet, pcm });
  }
  function encodeWav(value) {
    const data = audio(value), size = data.frames * data.channels * 2, buffer = new ArrayBuffer(44 + size), view = new DataView(buffer);
    const word = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    word(0, 'RIFF'); view.setUint32(4, 36 + size, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, data.channels, true); view.setUint32(24, data.sampleRate, true);
    view.setUint32(28, data.sampleRate * data.channels * 2, true); view.setUint16(32, data.channels * 2, true); view.setUint16(34, 16, true);
    word(36, 'data'); view.setUint32(40, size, true);
    for (let frame = 0; frame < data.frames; frame++) for (let ch = 0; ch < data.channels; ch++) {
      const sample = clamp(data.pcm[ch][frame], -1, 1);
      view.setInt16(44 + (frame * data.channels + ch) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }
  function database() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('Browser storage unavailable.'));
      let request;
      try { request = global.indexedDB.open('musiclab-audio-v1', 1); } catch (error) { return reject(error); }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('samples')) request.result.createObjectStore('samples', { keyPath: 'id' }); };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error || new Error('Browser storage unavailable.'));
      request.onblocked = () => reject(new Error('Close another Kitchen tab to unlock the sample library.'));
    }).catch(() => { persistent = false; return null; });
    return databasePromise;
  }
  const hostLibrary = () => global.MusicLabHost?.audioLibrary;
  async function localRead(method, key) {
    const db = await database();
    if (!db) return method === 'getAll' ? [...volatile.values()] : volatile.get(key);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('samples', 'readonly'), request = key === undefined ? transaction.objectStore('samples')[method]() : transaction.objectStore('samples')[method](key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async function list() {
    const host = hostLibrary();
    const items = host?.list ? await host.list() : (await localRead('getAll')).map(metadata);
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  async function get(id) { const host = hostLibrary(); return host?.get ? host.get(id) : localRead('get', String(id)); }
  async function save(value) {
    const data = audio(value), host = hostLibrary();
    if (host?.save) return host.save(data);
    const record = { ...data, id: uid(), createdAt: Date.now(), waveform: waveform(data), pcm: data.pcm.map(channel => new Float32Array(channel)) }, db = await database();
    if (!db) {
      const items = [...volatile.values()];
      if (items.length >= MAX_SAMPLES || items.reduce((total, item) => total + item.bytes, 0) + record.bytes > MAX_BYTES) throw new Error('The library is full. Delete a sample first (32 samples / 64 MB maximum).');
      volatile.set(record.id, record); return metadata(record);
    }
    // The quota check and write share one transaction, including simultaneous app tabs.
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('samples', 'readwrite'), store = transaction.objectStore('samples'), request = store.getAll();
      let quotaError;
      request.onsuccess = () => {
        const items = request.result;
        if (items.length >= MAX_SAMPLES || items.reduce((total, item) => total + item.bytes, 0) + record.bytes > MAX_BYTES) {
          quotaError = new Error('The library is full. Delete a sample first (32 samples / 64 MB maximum).'); transaction.abort(); return;
        }
        store.put(record);
      };
      transaction.oncomplete = () => resolve(metadata(record));
      transaction.onerror = () => reject(quotaError || transaction.error || new Error('Could not save the sample. Download a portable packet instead.'));
      transaction.onabort = () => reject(quotaError || transaction.error || new Error('Could not save the sample. Download a portable packet instead.'));
    });
  }
  async function remove(id) {
    const host = hostLibrary(); if (host?.remove) return host.remove(String(id));
    const db = await database(); if (!db) { volatile.delete(String(id)); return; }
    return new Promise((resolve, reject) => { const transaction = db.transaction('samples', 'readwrite'); transaction.objectStore('samples').delete(String(id)); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  }
  async function decodeFile(file) {
    if (!file || file.size > 128 * 1024 * 1024) throw new Error('Choose an audio file smaller than 128 MB.');
    if (/\.json$/i.test(file.name) || file.type === 'application/json') return audioFromPacket(await file.text());
    const Constructor = global.AudioContext || global.webkitAudioContext;
    if (!Constructor) throw new Error('This browser cannot decode audio files.');
    const context = new Constructor();
    try {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (buffer.numberOfChannels > 2) throw new Error('Use mono or stereo audio. Multichannel files must be mixed down first.');
      return audio({ pcm: Array.from({ length: buffer.numberOfChannels }, (_, channel) => new Float32Array(buffer.getChannelData(channel))), sampleRate: buffer.sampleRate, name: file.name.replace(/\.[^.]+$/, ''), sourceApp: 'Imported audio' }, { maxSeconds: 900 });
    } catch (error) { if (error.message?.includes('second') || error.message?.includes('MB') || error.message?.includes('mono')) throw error; throw new Error('This browser could not decode the file. Try WAV, MP3, or a Kitchen audio packet.'); }
    finally { try { await context.close(); } catch (_) {} }
  }
  async function normalizeExport(value) {
    if (value instanceof Blob) return decodeFile(Object.assign(value, { name: 'Rendered sample.wav' }));
    if (value?.blob) { const decoded = await decodeFile(Object.assign(value.blob, { name: (value.name || 'Rendered sample') + '.wav' })); return audio({ ...decoded, ...value, pcm: decoded.pcm, sampleRate: decoded.sampleRate }); }
    return audio(value);
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = safeName(name); anchor.style.display = 'none'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function stopPreview() {
    try { previewSource?.stop(); } catch (_) {}
    try { previewSource?.disconnect(); } catch (_) {}
    previewSource = null;
    const context = previewContext, own = previewOwnContext; previewContext = null; previewOwnContext = false;
    if (own && context) try { await context.close(); } catch (_) {}
    const button = dialog?.querySelector('[data-action="preview"]'); if (button) button.textContent = '▶ Preview selection';
  }
  function selectedAudio() {
    const data = active?.incoming; if (!data) throw new Error('Choose a sample or import an audio file first.');
    const start = clamp(dialog.querySelector('[name="trim-start"]').value, 0, data.duration), end = clamp(dialog.querySelector('[name="trim-end"]').value, 0, data.duration);
    if (end <= start) throw new Error('Selection end must come after its start.');
    const lo = Math.floor(start * data.sampleRate), hi = Math.min(data.frames, Math.ceil(end * data.sampleRate));
    return audio({ ...data, pcm: data.pcm.map(channel => channel.slice(lo, hi)), name: dialog.querySelector('[name="sample-name"]').value || data.name });
  }
  function message(text, error = false) {
    if (!dialog) return;
    const element = dialog.querySelector('.ml-ex-status'); element.textContent = text; element.classList.toggle('ml-ex-error', error);
  }
  function still(token) { return active && active.token === token && dialog.open && !active.controller.signal.aborted; }
  function button(label, action, extra = '') { return '<button type="button" class="ml-ex-button ' + extra + '" data-action="' + action + '">' + label + '</button>'; }
  function shell() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'ml-ex-dialog'; dialog.setAttribute('aria-labelledby', 'ml-ex-title');
    dialog.innerHTML = '<div class="ml-ex-shell"><header class="ml-ex-header"><div><span class="ml-ex-eyebrow">KITCHEN / SAMPLE EXCHANGE</span><h2 id="ml-ex-title">The shared pantry.</h2><p>Every sound labelled. Several sounds unidentified.</p></div>' + button('✕', 'close', 'ml-ex-close') + '</header>' +
      '<nav class="ml-ex-tabs" aria-label="Sample exchange"><button type="button" data-tab="library" class="ml-ex-tab" aria-selected="true">Library <span class="ml-ex-count">0</span></button><button type="button" data-tab="send" class="ml-ex-tab" aria-selected="false">Send audio</button><button type="button" data-tab="receive" class="ml-ex-tab" aria-selected="false">Receive audio</button></nav>' +
      '<main class="ml-ex-main"><section data-panel="library"><div class="ml-ex-library-head"><label class="ml-ex-search">⌕ <input type="search" name="search" placeholder="Find a sound, instrument, or tag" aria-label="Search samples"></label>' + button('↻ Refresh', 'refresh', 'ml-ex-small') + '</div><div class="ml-ex-library"></div><div class="ml-ex-capacity"></div></section>' +
      '<section data-panel="send" hidden><div class="ml-ex-intro"><span class="ml-ex-orbit">' + icon('send') + '</span><div><h3>Prep a fresh batch.</h3><p>Render your instrument into a reusable sample. Your current patch stays yours.</p></div></div><div class="ml-ex-fields"><label>Audio source<select name="scope"></select></label><label>Length in bars<input name="bars" type="number" min="1" max="16" value="4" step="1"></label><label>Effect tail (seconds)<input name="tail" type="number" min="0" max="8" value="1" step="0.25"></label><label>Sample name<input name="export-name" maxlength="100" placeholder="A name for this sound"></label></div><div class="ml-ex-export-hint"></div><div class="ml-ex-actions">' + button('Render sample', 'render', 'ml-ex-primary') + '</div><div class="ml-ex-rendered" hidden><div class="ml-ex-render-wave"></div><p class="ml-ex-render-meta"></p><div class="ml-ex-actions">' + button('Save to library', 'save', 'ml-ex-primary') + button('↓ WAV', 'wav') + button('↓ Portable packet', 'packet') + '</div></div></section>' +
      '<section data-panel="receive" hidden><div class="ml-ex-intro"><span class="ml-ex-orbit">' + icon('receive') + '</span><div><h3>Bring another ingredient.</h3><p>Use a library sample, audio file, or portable Kitchen packet.</p></div></div><label class="ml-ex-file"><span>＋ Choose audio or sample packet</span><input type="file" name="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aiff,.json"></label><div class="ml-ex-import-empty">Pick a sound from the Library or choose a file above.</div><div class="ml-ex-import-editor" hidden><label class="ml-ex-name-label">Sample name<input name="sample-name" maxlength="100"></label><div class="ml-ex-wave-wrap"><canvas class="ml-ex-wave" height="112" aria-label="Audio waveform"></canvas><div class="ml-ex-selection"></div></div><p class="ml-ex-incoming-meta"></p><div class="ml-ex-fields ml-ex-trim"><label>Selection start (seconds)<input name="trim-start" type="number" min="0" step="0.01" value="0"></label><label>Selection end (seconds)<input name="trim-end" type="number" min="0" step="0.01"></label></div><div class="ml-ex-actions">' + button('▶ Preview selection', 'preview') + '</div><div class="ml-ex-destination"><label>Destination<select name="target"></select></label><p class="ml-ex-target-hint"></p><label class="ml-ex-replace"><input type="checkbox" name="replace"> Replace the audio currently in this destination</label><div class="ml-ex-actions">' + button('Receive sample', 'receive', 'ml-ex-primary') + '</div></div><p class="ml-ex-export-only" hidden>This instrument creates audio. Load this sample into STOCK, HOTPLATE, REDUCE, ROTISSERIE, DICER, STEAM, or GALLEY to play it.</p><div class="ml-ex-actions">' + button('Save selection to library', 'save-incoming') + button('↓ WAV', 'incoming-wav') + button('↓ Portable packet', 'incoming-packet') + '</div></div></section></main>' +
      '<footer class="ml-ex-footer"><p class="ml-ex-storage-note"></p><p class="ml-ex-status" role="status" aria-live="polite"></p></footer></div>';
    document.body.append(dialog);
    dialog.querySelector('.ml-ex-close').setAttribute('aria-label', 'Close sample exchange');
    dialog.addEventListener('click', event => {
      if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { close(); return; } }
      const tab = event.target.closest('[data-tab]'); if (tab) switchTab(tab.dataset.tab);
      const action = event.target.closest('[data-action]'); if (action && !action.disabled) act(action.dataset.action, action);
      const sample = event.target.closest('[data-sample]'); if (sample) chooseSample(sample.dataset.sample);
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    // Instrument transport shortcuts must never react to typing inside this dialog.
    dialog.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } });
    dialog.addEventListener('close', () => { if(dialog.open)return;active?.controller.abort(); active = null; stopPreview(); });
    dialog.querySelector('[name="search"]').addEventListener('input', drawLibrary);
    dialog.querySelector('[name="file"]').addEventListener('change', async event => {
      const file = event.target.files[0], token = active?.token; if (!file) return;
      message('Opening ' + file.name + '…');
      try { const decoded = await decodeFile(file); if (still(token)) { setIncoming(decoded); message('Choose a selection and destination.'); } }
      catch (error) { if (still(token)) message(error.message, true); }
      event.target.value = '';
    });
    ['trim-start', 'trim-end'].forEach(name => dialog.querySelector('[name="' + name + '"]').addEventListener('input', updateSelection));
    dialog.querySelector('[name="target"]').addEventListener('change', targetHint);
    dialog.querySelector('[name="scope"]').addEventListener('change', scopeHint);
    dialog.querySelector('.ml-ex-wave-wrap').addEventListener('pointerdown', event => {
      if (!active?.incoming) return;
      const rect = event.currentTarget.getBoundingClientRect(), time = clamp((event.clientX - rect.left) / rect.width, 0, 1) * active.incoming.duration;
      const start = Number(dialog.querySelector('[name="trim-start"]').value), end = Number(dialog.querySelector('[name="trim-end"]').value);
      dialog.querySelector('[name="' + (Math.abs(time - start) < Math.abs(time - end) ? 'trim-start' : 'trim-end') + '"]').value = time.toFixed(2); updateSelection();
    });
  }
  function switchTab(tab) {
    if (!active) return;
    stopPreview();
    dialog.querySelectorAll('[data-tab]').forEach(element => element.setAttribute('aria-selected', String(element.dataset.tab === tab)));
    dialog.querySelectorAll('[data-panel]').forEach(element => { element.hidden = element.dataset.panel !== tab; });
    if (tab === 'library') refresh();
    if (tab === 'receive' && active.incoming) requestAnimationFrame(() => drawWave(active.incoming, dialog.querySelector('.ml-ex-wave')));
  }
  function scopeHint() {
    const scope = active?.scopes?.find(item => String(item.id) === dialog.querySelector('[name="scope"]').value);
    dialog.querySelector('.ml-ex-export-hint').textContent = scope?.description || 'Exports are rendered locally. Keep the result under two minutes; long tails count toward the limit.';
    const oneShot = scope?.usesBars === false;
    dialog.querySelector('[name="bars"]').disabled = oneShot;
    dialog.querySelector('[name="bars"]').closest('label').hidden = oneShot;
  }
  async function open(id) {
    const registration = registrations.get(String(id)); if (!registration) throw new Error('Register this app with Kitchen first.');
    shell(); if (dialog.open) close();
    let adapter; try { adapter = await registration.getAdapter(); } catch (error) { throw new Error('This instrument is not ready: ' + error.message); }
    if (!adapter) throw new Error('This instrument is still loading. Try Samples again in a moment.');
    active = { id: String(id), registration, adapter, token: uid(), controller: new AbortController(), samples: [], incoming: null, rendered: null };
    const token = active.token;
    dialog.style.setProperty('--ml-ex-accent', registration.accent || '#ff8d45');
    dialog.querySelector('.ml-ex-eyebrow').textContent = 'KITCHEN / ' + clean(registration.name || id).toUpperCase() + ' / SAMPLES';
    dialog.querySelector('.ml-ex-count').textContent = '…';
    dialog.querySelector('[name="search"]').value = '';
    dialog.querySelector('[name="export-name"]').value = '';
    dialog.querySelector('[name="replace"]').checked = false;
    dialog.querySelector('.ml-ex-rendered').hidden = true;
    dialog.querySelector('.ml-ex-import-editor').hidden = true;
    dialog.querySelector('.ml-ex-import-empty').hidden = false;
    dialog.querySelectorAll('[data-action]').forEach(element => { element.disabled = false; });
    active.scopes = adapter.audioExport?.scopes || [{ id: 'pattern', label: 'Current pattern' }];
    dialog.querySelector('[name="scope"]').innerHTML = active.scopes.map(scope => '<option value="' + escape(scope.id) + '">' + escape(scope.label || scope.name || scope.id) + '</option>').join('');
    const maximumBars = clamp(adapter.audioExport?.maxBars || 16, 1, 16);
    dialog.querySelector('[name="bars"]').max = maximumBars;
    dialog.querySelector('[name="bars"]').value = clamp(adapter.audioExport?.defaultBars || 4, 1, maximumBars);
    dialog.querySelector('[data-tab="send"]').disabled = typeof adapter.exportAudio !== 'function';
    fillTargets(); scopeHint(); message('');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    switchTab('library'); if (!hostLibrary()) await database(); if (still(token)) storageNote();
  }
  function close() { active?.controller.abort(); stopPreview(); if (dialog?.open) dialog.close(); }
  function storageNote() {
    const keeps = hostLibrary()?.persistent ?? persistent;
    const own = keeps ? 'Shared locally between Kitchen apps on this site.' : 'Browser storage is unavailable. This library lasts until the page closes; download a portable packet to keep your audio.';
    dialog.querySelector('.ml-ex-storage-note').textContent = global.location.protocol === 'file:' ? 'Offline HTML files may keep separate libraries. Portable packets move sounds between files. ' + (keeps ? '' : own) : own;
  }
  async function refresh() {
    const token = active?.token; if (!token) return;
    try { const samples = await list(); if (still(token)) { active.samples = samples; drawLibrary(); storageNote(); } }
    catch (error) { if (still(token)) message('Could not open the sample library. ' + error.message, true); }
  }
  function drawLibrary() {
    if (!active) return;
    const query = dialog.querySelector('[name="search"]').value.trim().toLowerCase(), samples = active.samples.filter(item => [item.name, item.sourceApp, appName(item.sourceApp), ...(item.tags || [])].join(' ').toLowerCase().includes(query));
    dialog.querySelector('.ml-ex-count').textContent = active.samples.length;
    dialog.querySelector('.ml-ex-library').innerHTML = samples.length ? samples.map(item => '<div class="ml-ex-sample-row"><button type="button" class="ml-ex-sample" data-sample="' + escape(item.id) + '"><span class="ml-ex-sample-glyph">' + thumbnail(item) + '</span><span class="ml-ex-sample-copy"><strong>' + escape(item.name) + '</strong><span>' + escape(appName(item.sourceApp)) + ' · ' + seconds(item.duration) + (item.tempo ? ' · ' + Number(item.tempo).toFixed(0) + ' BPM' : '') + '</span></span><span class="ml-ex-sample-arrow">' + icon('send') + '</span></button><button type="button" class="ml-ex-delete" data-action="delete" data-id="' + escape(item.id) + '" aria-label="Delete ' + escape(item.name) + '">×</button></div>').join('') : '<div class="ml-ex-empty"><span>∿</span><h3>' + (query ? 'No sounds by that name.' : 'The shelves await a delivery.') + '</h3><p>' + (query ? 'Try another instrument, name, or tag.' : 'Render a sample in Send audio, or import one in Receive audio. Every instrument can borrow from this collection.') + '</p></div>';
    const used = active.samples.reduce((total, item) => total + (item.bytes || 0), 0);
    dialog.querySelector('.ml-ex-capacity').innerHTML = '<span>' + active.samples.length + ' / ' + MAX_SAMPLES + ' samples</span><div><i style="width:' + Math.min(100, used / MAX_BYTES * 100) + '%"></i></div><span>' + (used / 1048576).toFixed(1) + ' / 64 MB</span>';
  }
  async function chooseSample(id) {
    const token = active?.token; message('Opening sample…');
    try { const record = await get(id); if (still(token)) { if (!record) throw new Error('This sample was removed in another tab. Refresh the library.'); setIncoming(audio(record)); switchTab('receive'); message('Choose a selection and destination.'); } }
    catch (error) { if (still(token)) message(error.message, true); }
  }
  function importSpec() {
    const spec = active.adapter.audioImport;
    return typeof spec === 'function' ? spec() : spec || {};
  }
  function fillTargets() {
    const spec = importSpec(), imports = typeof active.adapter.importAudio === 'function';
    let targets = spec.targets || spec.decks;
    if (Number.isInteger(targets) && targets > 0 && targets <= 32) targets = Array.from({ length: targets }, (_, index) => ({ id: index, name: 'Deck ' + (index + 1), occupied: false }));
    if (typeof targets === 'function') targets = targets();
    if (!Array.isArray(targets)) targets = [{ id: 'default', name: 'Sample source', occupied: false }];
    active.targets = targets.map((target, index) => typeof target === 'object' ? { ...target, id: target.id ?? index, name: target.name || target.label || String(target.id ?? index) } : { id: target, name: 'Deck ' + target });
    active.importSpec = spec;
    dialog.querySelector('[name="target"]').innerHTML = active.targets.map(target => '<option value="' + escape(target.id) + '">' + escape(target.name) + (target.occupied ? ' — ' + escape(target.assetName || 'audio loaded') : '') + '</option>').join('');
    dialog.querySelector('.ml-ex-destination').hidden = !imports;
    dialog.querySelector('.ml-ex-export-only').hidden = imports;
    targetHint();
  }
  function selectedTarget() { return active?.targets.find(target => String(target.id) === dialog.querySelector('[name="target"]').value); }
  function targetHint() {
    if (!active) return;
    const target = selectedTarget(), spec = active.importSpec;
    dialog.querySelector('[name="replace"]').checked = false;
    dialog.querySelector('.ml-ex-replace').hidden = !target?.occupied;
    dialog.querySelector('.ml-ex-target-hint').textContent = (spec.description ? spec.description + ' ' : '') + (spec.maxSeconds ? 'Maximum selection: ' + seconds(spec.maxSeconds) + '. ' : '') + (spec.mode === 'analysis' ? 'Mono and stereo selections are analyzed into the score. ' : spec.channels === 1 ? 'This destination uses mono samples; stereo conversion is handled by the instrument. ' : 'Mono and stereo samples are supported. ') + (target?.occupied ? 'This destination has audio; confirm replacement below.' : 'Your patch and other sample destinations stay in place.');
    dialog.querySelector('[data-action="receive"]').textContent = spec.mode === 'analysis' ? 'Analyze selection' : 'Receive sample';
    updateSelection();
  }
  function setIncoming(data) {
    stopPreview(); active.incoming = data;
    dialog.querySelector('.ml-ex-import-empty').hidden = true;
    dialog.querySelector('.ml-ex-import-editor').hidden = false;
    dialog.querySelector('[name="sample-name"]').value = data.name;
    dialog.querySelector('[name="trim-start"]').value = 0;
    dialog.querySelector('[name="trim-end"]').value = data.duration.toFixed(3);
    dialog.querySelectorAll('.ml-ex-trim input').forEach(element => { element.max = data.duration; });
    dialog.querySelector('.ml-ex-incoming-meta').textContent = appName(data.sourceApp) + ' · ' + seconds(data.duration) + ' · ' + (data.channels === 1 ? 'Mono' : 'Stereo') + ' · ' + data.sampleRate.toLocaleString() + ' Hz' + (data.tempo ? ' · ' + data.tempo + ' BPM' : '');
    fillTargets(); updateSelection(); requestAnimationFrame(() => drawWave(data, dialog.querySelector('.ml-ex-wave')));
  }
  function updateSelection() {
    if (!active?.incoming) return;
    const duration = active.incoming.duration, start = clamp(dialog.querySelector('[name="trim-start"]').value, 0, duration), end = clamp(dialog.querySelector('[name="trim-end"]').value, 0, duration);
    const selection = dialog.querySelector('.ml-ex-selection'); selection.style.left = (start / duration * 100) + '%'; selection.style.width = Math.max(0, (end - start) / duration * 100) + '%';
    const limit = Math.min(MAX_SECONDS, active.importSpec?.maxSeconds || MAX_SECONDS), valid = end > start && end - start <= limit + 1e-6;
    dialog.querySelector('[data-action="receive"]').disabled = !valid || !!active.importing;
    const length = end - start;
    dialog.querySelector('.ml-ex-incoming-meta').classList.toggle('ml-ex-error', !valid);
    dialog.querySelector('.ml-ex-incoming-meta').textContent = appName(active.incoming.sourceApp) + ' · ' + seconds(duration) + ' full / ' + seconds(Math.max(0, length)) + ' selected' + (!valid ? ' · Trim to ' + seconds(limit) + ' or less before receiving.' : '') + (active.incoming.tempo ? ' · ' + active.incoming.tempo + ' BPM' : '');
  }
  function drawWave(data, canvas) {
    if (!canvas || !data) return;
    const width = Math.max(240, Math.round(canvas.getBoundingClientRect().width || 640)), height = 112, scale = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
    ctx.strokeStyle = active?.registration.accent || '#ff8d45'; ctx.lineWidth = 1;
    const pcm = data.pcm[0], step = Math.max(1, Math.floor(pcm.length / width));
    ctx.beginPath();
    for (let x = 0; x < width; x++) { let low = 0, high = 0; const start = Math.floor(x / width * pcm.length), end = Math.min(pcm.length, start + step); const stride = Math.max(1, Math.floor(step / 80));
      for (let i = start; i < end; i += stride) { low = Math.min(low, pcm[i]); high = Math.max(high, pcm[i]); }
      ctx.moveTo(x + .5, height / 2 - high * height * .42); ctx.lineTo(x + .5, height / 2 - low * height * .42);
    }
    ctx.stroke();
  }
  async function preview() {
    if (previewSource) { await stopPreview(); return; }
    const data = selectedAudio(), token = active.token, Constructor = global.AudioContext || global.webkitAudioContext;
    const host = global.MusicLabHost; previewContext = host ? host.context : new Constructor(); previewOwnContext = !host;
    const context = previewContext; await context.resume(); if (!still(token)) { await stopPreview(); return; }
    const buffer = context.createBuffer(data.channels, data.frames, data.sampleRate);
    data.pcm.forEach((channel, index) => buffer.copyToChannel(channel, index));
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime, ramp = Math.min(.006, data.duration / 4);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.75, now + ramp); gain.gain.setValueAtTime(.75, now + Math.max(ramp, data.duration - ramp)); gain.gain.linearRampToValueAtTime(0, now + data.duration);
    source.buffer = buffer; source.connect(gain); gain.connect(context.destination); previewSource = source;
    source.onended = () => { try { gain.disconnect(); } catch (_) {} if (previewSource === source) stopPreview(); };
    source.start(); dialog.querySelector('[data-action="preview"]').textContent = '■ Stop preview';
  }
  async function act(action, element) {
    if (!active) return;
    if ((action==='render' && active.rendering) || (action==='receive' && active.importing)) return;
    if (action === 'close') { close(); return; }
    if (action === 'refresh') { await refresh(); return; }
    const token = active.token;
    try {
      if (action === 'preview') { await preview(); return; }
      if (action === 'delete') {
        const item = active.samples.find(item => item.id === element.dataset.id);
        if (!element.dataset.confirm) { element.dataset.confirm = 'true'; element.textContent = 'Delete?'; element.classList.add('ml-ex-delete-confirm'); element.setAttribute('aria-label', 'Confirm deleting ' + (item?.name || 'sample')); return; }
        await remove(element.dataset.id); if (still(token)) { await refresh(); message('Sample removed from the library. Audio already loaded in instruments stays available.'); } return;
      }
      if (action === 'render') {
        active.rendering = true; element.disabled = true;
        const scope = dialog.querySelector('[name="scope"]').value, bars = Math.round(clamp(dialog.querySelector('[name="bars"]').value, 1, dialog.querySelector('[name="bars"]').max)), tailSeconds = clamp(dialog.querySelector('[name="tail"]').value, 0, 8);
        message('Rendering locally… You can close this window to cancel.');
        const value = await active.adapter.exportAudio({ scope, bars, tailSeconds, signal: active.controller.signal });
        if (!still(token)) throw abortError();
        const rendered = await normalizeExport(value); if (!still(token)) throw abortError();
        rendered.sourceApp = clean(active.registration.sourceApp || active.registration.name || active.id); rendered.name = clean(dialog.querySelector('[name="export-name"]').value || rendered.name);
        active.rendered = rendered; dialog.querySelector('.ml-ex-rendered').hidden = false;
        dialog.querySelector('.ml-ex-render-wave').innerHTML = '<canvas height="112" aria-label="Rendered audio waveform"></canvas>';
        requestAnimationFrame(() => { if (still(token)) drawWave(rendered, dialog.querySelector('.ml-ex-render-wave canvas')); });
        dialog.querySelector('.ml-ex-render-meta').textContent = rendered.name + ' · ' + seconds(rendered.duration) + (rendered.tempo ? ' · ' + rendered.tempo + ' BPM' : ''); message('Ready to save or download.');
      } else if (action === 'save' || action === 'save-incoming') {
        const value = action === 'save' ? active.rendered : selectedAudio(); if (!value) throw new Error('Render a sample first.');
        element.disabled = true; const record = await save(value); if (still(token)) { await refresh(); message('“' + record.name + '” is in your sample library.'); }
      } else if (['wav', 'packet', 'incoming-wav', 'incoming-packet'].includes(action)) {
        const incoming = action.startsWith('incoming-'), value = incoming ? selectedAudio() : active.rendered; if (!value) throw new Error('Render a sample first.');
        if (action.endsWith('wav')) download(encodeWav(value), value.name + '.wav'); else download(new Blob([JSON.stringify(packetFromAudio(value))], { type: 'application/json' }), value.name + '.musiclab-audio.json');
        message('Download prepared. Portable packets retain the source, tempo, and sample name.');
      } else if (action === 'receive') {
        const target = selectedTarget(), value = selectedAudio(), spec = importSpec();
        if (spec.maxSeconds && value.duration > spec.maxSeconds + 1e-6) throw new Error('Choose ' + seconds(spec.maxSeconds) + ' or less. No audio has been replaced.');
        if (target?.occupied && !dialog.querySelector('[name="replace"]').checked) throw new Error('Confirm replacement of the destination audio first.');
        // The native app facade contract is interleaved stereo, even for mono engines.
        // Keep both channels for spectral analyzers, which must preserve anti-phase energy.
        const interleaved = new Float32Array(value.frames * 2), left = value.pcm[0], right = value.pcm[1] || left;
        for (let frame = 0; frame < value.frames; frame++) { interleaved[frame * 2] = left[frame]; interleaved[frame * 2 + 1] = right[frame]; }
        active.importing = true; element.disabled = true; message('Loading sample…'); await stopPreview();
        if (!still(token)) throw abortError();
        const result = await active.adapter.importAudio({ ...value, pcm: interleaved, channels: 2, options: { target: target?.id, deck: target?.id, replace: dialog.querySelector('[name="replace"]').checked, signal: active.controller.signal }, signal: active.controller.signal });
        if (!still(token)) throw abortError();
        if (result === false) throw new Error('The instrument did not accept this sample.');
        fillTargets(); message('“' + value.name + '” loaded into ' + (target?.name || active.registration.name) + '.');
        global.MusicLabHost?.notifyStateChange?.();
      }
    } catch (error) { if (error.name !== 'AbortError' && still(token)) message(error.message || 'Could not complete this sample exchange.', true); }
    finally { if (still(token)) { if(action==='render')active.rendering = false;if(action==='receive')active.importing = false; element.disabled = false; updateSelection(); } }
  }
  function register(options) {
    if (!options?.id || typeof options.getAdapter !== 'function') throw new TypeError('Sample exchange registration needs id and getAdapter.');
    registrations.set(String(options.id), options);
    const mount = () => {
      if (document.querySelector('[data-musiclab-exchange="' + CSS.escape(String(options.id)) + '"]')) return;
      const launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'ml-ex-launcher'; launcher.dataset.musiclabExchange = String(options.id); launcher.style.setProperty('--ml-ex-accent', options.accent || '#ff8d45');
      launcher.innerHTML = icon('exchange') + ' Samples'; launcher.setAttribute('aria-label', 'Open shared sample library');
      launcher.addEventListener('click', () => { open(String(options.id)).catch(error => { console.error(error); launcher.title = error.message; launcher.textContent = 'Samples · try again'; setTimeout(() => { launcher.innerHTML = icon('exchange') + ' Samples'; }, 2500); }); });
      const destination = options.mountSelector ? document.querySelector(options.mountSelector) : null;
      if (destination) destination.append(launcher); else { launcher.classList.add('ml-ex-launcher-floating'); document.body.append(launcher); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
    document.addEventListener('musiclab:app-ready', () => {
      const destination = options.mountSelector && document.querySelector(options.mountSelector), launcher = document.querySelector('[data-musiclab-exchange="' + CSS.escape(String(options.id)) + '"]');
      if (destination && launcher) { launcher.classList.remove('ml-ex-launcher-floating'); destination.append(launcher); }
      else mount();
    });
    return { open: () => open(String(options.id)), dispose: () => { registrations.delete(String(options.id)); document.querySelector('[data-musiclab-exchange="' + CSS.escape(String(options.id)) + '"]')?.remove(); if (active?.id === String(options.id)) close(); } };
  }
  global.addEventListener('pagehide', close);
  global.addEventListener('musiclab-panic', stopPreview);
  document.addEventListener('click', event => { const target = event.target.closest?.('button'); if (target && /\bpanic\b/i.test([target.textContent, target.title, target.getAttribute('aria-label')].join(' '))) stopPreview(); }, true);
  global.addEventListener('blur', () => { if (document.hidden) stopPreview(); });
  document.addEventListener('keydown', event => { if (dialog?.open && event.key === 'Escape') close(); });
  global.MusicLabExchange = Object.freeze({ version: 1, MAX_BYTES, MAX_SAMPLES, MAX_SECONDS, register, open, close, list, get, save, remove, packetFromAudio, audioFromPacket, encodeWav, decodeFile, normalizeAudio: audio, normalizeExport, stopPreview, get persistent() { return persistent; } });
})(window);
