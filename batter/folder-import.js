/* BATTER · collect a sample folder without reading or replacing any audio. */
(function (scope) {
  'use strict';
  const MAX_AUDIO_FILES = 128, MAX_ENTRIES = 20000, MAX_DEPTH = 64;
  const AUDIO_EXTENSION = /\.(?:wav|wave|aif|aiff|aifc|mp3|mp2|flac|ogg|oga|opus|m4a|aac|weba|caf|au|snd)$/i;

  function invalid(message) { const error = new Error(message); error.name = 'BatterFolderImportError'; return error; }
  function abortError() {
    if (typeof DOMException === 'function') return new DOMException('Folder import cancelled.', 'AbortError');
    const error = new Error('Folder import cancelled.'); error.name = 'AbortError'; return error;
  }
  function cancelled(signal) { if (signal?.aborted) throw abortError(); }
  function reading(promise, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok, value) => {
        if (settled) return; settled = true;
        signal?.removeEventListener?.('abort', onAbort);
        (ok ? resolve : reject)(value);
      };
      const onAbort = () => finish(false, abortError());
      Promise.resolve(promise).then(value => finish(true, value), error => finish(false, error));
      if (signal?.aborted) onAbort(); else signal?.addEventListener?.('abort', onAbort, { once: true });
    });
  }
  function pathFor(value, fallback) {
    const path = String(value || fallback || '').replace(/\\/g, '/');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length || path.length > 4096 || /^[a-z]:/i.test(path) || parts.some(part => part === '.' || part === '..')) throw invalid('A sample has an invalid relative path. Re-select the folder.');
    if (parts.length - 1 > MAX_DEPTH) throw invalid('This folder is too deeply nested. Import a shallower sample folder.');
    return parts.join('/');
  }
  const ignoredPath = path => path.split('/').some(part => part.startsWith('.') || part.toLowerCase() === '__macosx');
  function supported(file, path) {
    if (ignoredPath(path)) return false;
    return AUDIO_EXTENSION.test(path) || typeof file.type === 'string' && /^audio\//i.test(file.type);
  }
  function comparePath(a, b) {
    const left = a.path.normalize('NFC').toLowerCase().split(/(\d+)/), right = b.path.normalize('NFC').toLowerCase().split(/(\d+)/);
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      let x = left[index], y = right[index];
      if (index % 2) {
        x = x.replace(/^0+(?=\d)/, ''); y = y.replace(/^0+(?=\d)/, '');
        if (x.length !== y.length) return x.length - y.length;
      }
      if (x !== y) return x < y ? -1 : 1;
    }
    if (left.length !== right.length) return left.length - right.length;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.order - b.order;
  }
  function collector(options = {}) {
    const { signal, maxFiles = MAX_AUDIO_FILES } = options;
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_AUDIO_FILES) throw invalid('Choose an audio-file limit from 1 to 128.');
    let seen = 0, totalFiles = 0;
    const samples = [];
    function visit(depth) {
      cancelled(signal);
      if (depth > MAX_DEPTH) throw invalid('This folder is too deeply nested. Import a shallower sample folder.');
      if (++seen > MAX_ENTRIES) throw invalid('This folder contains too many entries. Choose a smaller sample folder.');
    }
    function add(file, path) {
      cancelled(signal);
      if (!file || typeof file.name !== 'string' || !file.name) throw invalid('A dropped sample could not be read. Re-select the folder.');
      path = pathFor(path, file.name); totalFiles++;
      if (!supported(file, path)) return;
      if (samples.length >= maxFiles) throw invalid('Import up to ' + maxFiles + ' audio files at once. Choose a smaller folder or fewer samples.');
      samples.push({ file, path, order: totalFiles });
    }
    function result() {
      cancelled(signal); samples.sort(comparePath);
      return { files: samples.map(sample => sample.file), paths: samples.map(sample => sample.path), skipped: totalFiles - samples.length, totalFiles };
    }
    return { signal, visit, add, skipFile() { cancelled(signal); totalFiles++; }, result };
  }
  function unreadable(kind, path, error, signal) {
    cancelled(signal);
    if (error?.name === 'AbortError' || error?.name === 'BatterFolderImportError') throw error;
    const failure = invalid('Could not read ' + kind + ' “' + path + '”. Re-select the folder and try again.');
    failure.cause = error; throw failure;
  }
  function snapshot(values) {
    if (values?.length > MAX_ENTRIES) throw invalid('This folder contains too many entries. Choose a smaller sample folder.');
    return Array.from(values || []);
  }

  async function fromFiles(files, options = {}) {
    const current = collector(options);
    for (const file of snapshot(files)) {
      const path = pathFor(file?.webkitRelativePath, file?.name);
      current.visit(path.split('/').length - 1); current.add(file, path);
    }
    return current.result();
  }

  async function readEntry(entry, parent, current, depth) {
    current.visit(depth);
    const path = pathFor(parent ? parent + '/' + entry.name : entry.name);
    if (ignoredPath(path)) { if (entry.isFile) current.skipFile(); return; }
    if (entry.isFile) {
      let file;
      try { file = await reading(new Promise((resolve, reject) => entry.file(resolve, reject)), current.signal); }
      catch (error) { unreadable('sample', path, error, current.signal); }
      current.add(file, path); return;
    }
    if (!entry.isDirectory) throw invalid('A dropped folder entry could not be read. Re-select the folder.');
    try {
      const reader = entry.createReader();
      while (true) {
        cancelled(current.signal);
        const batch = await reading(new Promise((resolve, reject) => reader.readEntries(resolve, reject)), current.signal);
        cancelled(current.signal);
        if (!Array.isArray(batch) || !batch.length) {
          if (!Array.isArray(batch)) throw invalid('Invalid folder entry list.');
          break;
        }
        if (batch.length > MAX_ENTRIES) throw invalid('This folder contains too many entries.');
        for (const child of batch) await readEntry(child, path, current, depth + 1);
      }
    } catch (error) { unreadable('folder', path, error, current.signal); }
  }
  async function readHandle(handle, parent, current, depth) {
    current.visit(depth);
    const path = pathFor(parent ? parent + '/' + handle.name : handle.name);
    if (ignoredPath(path)) { if (handle.kind === 'file') current.skipFile(); return; }
    if (handle.kind === 'file') {
      let file;
      try { file = await reading(handle.getFile(), current.signal); }
      catch (error) { unreadable('sample', path, error, current.signal); }
      current.add(file, path); return;
    }
    if (handle.kind !== 'directory') throw invalid('A dropped folder entry could not be read. Re-select the folder.');
    let iterator, done = false;
    try {
      const pairs = typeof handle.values !== 'function';
      const children = pairs ? handle.entries?.() : handle.values();
      if (!children) throw invalid('Folder enumeration is unavailable.');
      iterator = children[Symbol.asyncIterator]?.() || children[Symbol.iterator]?.();
      if (!iterator) throw invalid('Folder enumeration is unavailable.');
      while (true) {
        const next = await reading(iterator.next(), current.signal); cancelled(current.signal);
        if (next.done) { done = true; break; }
        await readHandle(pairs ? next.value[1] : next.value, path, current, depth + 1);
      }
    } catch (error) { unreadable('folder', path, error, current.signal); }
    finally {
      if (iterator && !done && typeof iterator.return === 'function') {
        try { Promise.resolve(iterator.return()).catch(() => {}); } catch (_) { /* Preserve the original read/cancellation error. */ }
      }
    }
  }

  // Keep this capture synchronous. Browsers may revoke access to DataTransfer
  // after the drop event returns, before any directory-reading promise resolves.
  function collectDrop(dataTransfer, options = {}) {
    let current, captured;
    try {
      current = collector(options); cancelled(current.signal);
      const items = snapshot(dataTransfer?.items);
      const fallback = snapshot(dataTransfer?.files);
      captured = [];
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
        if (entry) captured.push({ entry });
        else if (typeof item.getAsFileSystemHandle === 'function') {
          // Install a rejection handler immediately even when an earlier root
          // takes time to traverse, so no captured promise can reject unhandled.
          const handle = Promise.resolve(item.getAsFileSystemHandle()).then(value => ({ value }), error => ({ error }));
          captured.push({ handle });
        } else {
          const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
          if (!file) throw invalid('This browser cannot read the dropped folder. Use Import folder or Import samples instead.');
          captured.push({ file });
        }
      }
      if (!captured.length) captured = fallback.map(file => ({ file }));
    } catch (error) { return Promise.reject(error); }
    return (async () => {
      for (const root of captured) {
        cancelled(current.signal);
        if (root.entry) await readEntry(root.entry, '', current, 0);
        else if (root.handle) {
          const handle = await reading(root.handle, current.signal); cancelled(current.signal);
          if (handle.error) unreadable('dropped folder', 'selection', handle.error, current.signal);
          if (!handle.value) throw invalid('The dropped folder is unavailable. Re-select it and try again.');
          await readHandle(handle.value, '', current, 0);
        } else {
          const path = pathFor(root.file.webkitRelativePath, root.file.name);
          current.visit(path.split('/').length - 1); current.add(root.file, path);
        }
      }
      return current.result();
    })();
  }

  scope.BatterFolderImport = Object.freeze({ fromFiles, collectDrop });
})(typeof window === 'undefined' ? globalThis : window);
