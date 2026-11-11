/* MORSEL plugin preparation. Run in the original editor, never in processBlock.
 * The bank contains the real neural words and original Signalsmith note fits.
 * It is retained in the native plugin state so closed-editor playback needs no
 * speech worker, web page, network access, or asynchronous audio bridge. */
(function (scope) {
  'use strict';
  const FORMAT = 'kitchen-morsel-bank', VERSION = 1, LIMIT = 64 * 1024 * 1024;
  const VOICES = Object.freeze(['alto', 'tenor', 'bass', 'robot']);
  const clone = value => JSON.parse(JSON.stringify(value));
  function checkAbort(signal) { if (signal?.aborted) throw new DOMException('MORSEL preparation cancelled.', 'AbortError'); }
  function encode(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); let binary = '';
    for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
    return scope.btoa(binary);
  }
  function decode(pcm, frames) {
    if (typeof pcm !== 'string' || !Number.isInteger(frames) || frames < 1 || frames * 4 > LIMIT || pcm.length !== Math.ceil(frames * 4 / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(pcm)) throw Error('Invalid prepared MORSEL PCM.');
    const binary = scope.atob(pcm); if (binary.length !== frames * 4) throw Error('Incomplete prepared MORSEL PCM.');
    const bytes = new Uint8Array(binary.length); for (let at = 0; at < bytes.length; at++) bytes[at] = binary.charCodeAt(at);
    const result = new Float32Array(bytes.buffer); for (const value of result) if (!Number.isFinite(value)) throw Error('Prepared MORSEL audio contains a non-finite sample.');
    return result;
  }
  function signature(state) {
    return JSON.stringify({ voice: state.voice, lyric: state.lyric, tempo: state.tempo, release: state.release, length: state.length, division: state.division, swing: state.swing, steps: state.steps, musicLabPattern: state.musicLabPattern });
  }
  function key(text) { let value = 2166136261; for (let at = 0; at < text.length; at++) value = Math.imul(value ^ text.charCodeAt(at), 16777619); return (value >>> 0).toString(16).padStart(8, '0'); }
  function holdRegion(base, targetFrames) {
    if (!base.hasHold) return { hasHold: false, holdBegin: 0, holdEnd: 0 };
    const extended = targetFrames > base.left.length * 1.6, cadence = extended ? 1.25 : targetFrames / base.left.length;
    const extra = extended ? targetFrames - base.left.length * cadence : 0;
    const begin = Math.max(0, Math.min(targetFrames - 1, Math.round(base.holdBegin * cadence)));
    const end = Math.max(begin, Math.min(targetFrames, Math.round(base.holdEnd * cadence + extra)));
    return { hasHold: end - begin >= Math.round(base.sampleRate * .01), holdBegin: begin, holdEnd: end };
  }
  function pruneCache(audio, normalized, state) {
    const requestedWords = new Set(), requestedNotes = new Set();
    for (const { event, note } of normalized) {
      const identity = note.voice + '\u0000' + note.lyric, word = audio.words.get(identity); requestedWords.add(identity);
      if (word) requestedNotes.add(identity + '\u0000' + note.pitch + '\u0000' + Math.round((event.durationSeconds + state.release) * word.sampleRate));
    }
    // The native bank remains active until the full new bank is committed.
    // Prune obsolete editor-side fits so repeated word edits do not retain
    // every previous keyboard bank until the original cache budget is full.
    for (const [identity, word] of audio.words) if (!requestedWords.has(identity)) {
      audio.words.delete(identity); audio.wordBytes -= word.left.byteLength + word.masks.byteLength + (word.voicedFrames?.length || 0) * 32;
    }
    for (const [key, note] of audio.noteCache) if (!requestedNotes.has(key)) {
      audio.noteCache.delete(key); audio.noteBytes -= note.left.byteLength;
    }
    audio.wordBytes = Math.max(0, audio.wordBytes); audio.noteBytes = Math.max(0, audio.noteBytes);
  }
  async function prepareBank(options = {}) {
    const audio = options.audio || scope.MorselApp?.engine, S = scope.MorselSchema, Q = scope.MorselSequence, D = scope.MorselAudioDSP;
    if (!audio || !S || !Q || !D) throw Error('Open the complete MORSEL editor before preparing plugin voices.');
    const state = S.normalize(options.state || scope.MorselApp.getState()), signal = options.signal;
    const voices = options.voices || VOICES, pitches = options.pitches || Array.from({ length: 49 }, (_, at) => at + 36);
    const keyboardDuration = options.keyboardDuration ?? .8;
    if (!Number.isFinite(keyboardDuration) || keyboardDuration <= 0 || keyboardDuration > 120 || !Array.isArray(voices) || voices.some(voice => !VOICES.includes(voice)) || !Array.isArray(pitches) || pitches.some(pitch => !Number.isInteger(pitch) || pitch < 36 || pitch > 84)) throw Error('Choose valid MORSEL keyboard preparation settings.');
    checkAbort(signal);
    const tempos = [...new Set(options.tempos || [state.tempo])];
    if (!tempos.length || tempos.some(tempo => !Number.isFinite(tempo) || tempo < 2.5 || tempo > 3200)) throw Error('Choose valid MORSEL preparation tempos.');
    const events = [];
    // A voice control changes inherited phrase voices too. Prepare all four
    // choices, not just the keyboard token, so the native voice parameter is
    // usable immediately after loading the factory preset.
    for (const voice of voices) for (const tempo of tempos) for (const note of Q.events({ ...state, voice }, { realizeProbability: false })) events.push({ ...note, durationSeconds: note.duration * 60 / tempo });
    for (const voice of voices) for (const pitch of pitches) events.push({ voice, pitch, lyric: state.lyric, velocity: .8, durationSeconds: keyboardDuration });
    const normalized = events.map(event => ({ event, note: D.identity(event, state) }));
    options.onProgress?.(0, events.length);
    await audio.init(); checkAbort(signal);
    pruneCache(audio, normalized, state);
    // prepareNotes performs all neural synthesis, analysis and duration/pitch
    // fitting off the audio callback. It also enforces the original word/note
    // memory budgets before constructing the serialized bank.
    for (let first = 0; first < events.length; first += 32) {
      const batch = events.slice(first, first + 32);
      await audio.prepareNotes({ state, events: batch, tempo: state.tempo, signal, onProgress: (done, total) => options.onProgress?.(first + batch.length * (total ? done / total : 0), events.length) });
      checkAbort(signal); options.onProgress?.(first + batch.length, events.length);
    }
    checkAbort(signal);
    const requestedWords = new Set(normalized.map(({ note }) => note.voice + '\u0000' + note.lyric));
    const words = [], notes = [], selected = new Set(); let wordBytes = 0, noteBytes = 0;
    for (const identity of requestedWords) {
      const word = audio.words.get(identity); if (!word) throw Error('A requested MORSEL word was not prepared.');
      const fields = { ...word }; delete fields.left; delete fields.masks;
      wordBytes += word.left.byteLength + word.masks.byteLength + (word.voicedFrames?.length || 0) * 32;
      words.push({ identity, ...fields, frames: word.left.length, pcm: encode(word.left), maskFrames: word.masks.length, masks: encode(word.masks) });
    }
    for (const { event, note } of normalized) {
      const identity = note.voice + '\u0000' + note.lyric, base = audio.words.get(identity), frames = Math.round((event.durationSeconds + state.release) * base.sampleRate);
      const entryKey = identity + '\u0000' + note.pitch + '\u0000' + frames;
      if (selected.has(entryKey)) continue; selected.add(entryKey);
      const entry = audio.noteCache.get(entryKey); if (!entry) throw Error('A requested MORSEL note was not prepared exactly.');
      noteBytes += entry.left.byteLength;
      notes.push({ key: entryKey, identity, pitch: note.pitch, sampleRate: entry.sampleRate, frames: entry.left.length, seconds: entry.left.length / entry.sampleRate, pcm: encode(entry.left), ...holdRegion(base, entry.left.length) });
      if (wordBytes > LIMIT || noteBytes > LIMIT) throw Error('Prepared MORSEL voices exceed the original 64 MiB cache budgets.');
    }
    const configuration = signature(state);
    const bank = { format: FORMAT, version: VERSION, encoding: 'float32le', key: key(configuration), configuration, backend: scope.MorselSpeech?.backend || 'kitten-tts-nano-0.8-int8', modelHash: scope.MorselSpeechAssets?.modelHash || '', preparedTempos: tempos, keyboard: { lyric: state.lyric, voices: voices.slice(), pitches: pitches.slice(), durationSeconds: keyboardDuration }, words, notes, wordBytes, noteBytes };
    options.onProgress?.(events.length, events.length); checkAbort(signal); return bank;
  }
  function hydrateBank(audio, bank) {
    if (!bank || bank.format !== FORMAT || bank.version !== VERSION || bank.encoding !== 'float32le' || !Array.isArray(bank.words) || !Array.isArray(bank.notes) || bank.words.length > 256 || bank.notes.length > 16384) throw Error('MORSEL needs a valid prepared voice bank. Open its editor and choose Prepare voices.');
    const words = new Map(), notes = new Map(); let wordBytes = 0, noteBytes = 0;
    for (const item of bank.words) {
      if (typeof item.identity !== 'string' || words.has(item.identity) || !Number.isInteger(item.sampleRate) || item.sampleRate < 8000 || item.sampleRate > 192000 || !Number.isInteger(item.frames) || item.frames < 1 || item.frames > item.sampleRate * 30 || !Number.isInteger(item.maskFrames) || item.maskFrames < 0) throw Error('Invalid prepared MORSEL word.');
      if (!Array.isArray(item.voicedFrames) || item.voicedFrames.length > 8192 || item.voicedFrames.some(frame => !frame || !['frame', 'hz', 'confidence', 'energy'].every(key => Number.isFinite(frame[key])))) throw Error('Invalid prepared MORSEL pitch analysis.');
      if (item.hasHold && (!Number.isInteger(item.holdBegin) || !Number.isInteger(item.holdEnd) || item.holdBegin < 0 || item.holdEnd > item.frames || item.holdEnd <= item.holdBegin)) throw Error('Invalid prepared MORSEL voiced region.');
      const bytes = item.frames * 4 + item.maskFrames * 4 + item.voicedFrames.length * 32;
      if (wordBytes + bytes > LIMIT) throw Error('Prepared MORSEL voices exceed the original 64 MiB cache budgets.'); wordBytes += bytes;
      const left = decode(item.pcm, item.frames), masks = item.maskFrames ? decode(item.masks, item.maskFrames) : new Float32Array(0), value = { ...item, left, masks };
      delete value.pcm; delete value.frames; delete value.maskFrames;
      words.set(item.identity, value);
    }
    for (const item of bank.notes) {
      if (!words.has(item.identity) || !Number.isInteger(item.pitch) || item.pitch < 36 || item.pitch > 84 || !Number.isInteger(item.sampleRate) || item.sampleRate < 8000 || item.sampleRate > 192000 || !Number.isInteger(item.frames) || item.frames < 1 || item.frames > item.sampleRate * 122 || item.key !== item.identity + '\u0000' + item.pitch + '\u0000' + item.frames || notes.has(item.key)) throw Error('Invalid prepared MORSEL note.');
      if (item.hasHold && (!Number.isInteger(item.holdBegin) || !Number.isInteger(item.holdEnd) || item.holdBegin < 0 || item.holdEnd > item.frames || item.holdEnd <= item.holdBegin)) throw Error('Invalid prepared MORSEL sustain region.');
      if (noteBytes + item.frames * 4 > LIMIT) throw Error('Prepared MORSEL voices exceed the original 64 MiB cache budgets.'); noteBytes += item.frames * 4;
      const left = decode(item.pcm, item.frames); notes.set(item.key, { ...item, left });
    }
    if (wordBytes > LIMIT || noteBytes > LIMIT) throw Error('Prepared MORSEL voices exceed the original 64 MiB cache budgets.');
    // Commit only after every payload is validated; damaged state must not
    // partially replace a still usable prepared voice bank.
    audio.words = words; audio.noteCache = notes; audio.wordBytes = wordBytes; audio.noteBytes = noteBytes;
    return { words: words.size, notes: notes.size, wordBytes, noteBytes };
  }
  scope.KitchenMorselPreparation = Object.freeze({ FORMAT, VERSION, VOICES, prepareBank, hydrateBank, signature, holdRegion, encode, decode });
})(typeof window === 'object' ? window : globalThis);
