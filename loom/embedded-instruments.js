/* GALLEY's bundled HTML stays lossless; only the requested instrument is unpacked. */
(function (scope) {
  'use strict';
  const MAX_HTML_BYTES = 36 * 1024 * 1024;
  const cache = new WeakMap();
  const abortError = () => typeof DOMException === 'function' ? new DOMException('Opening this instrument was cancelled.', 'AbortError') : Object.assign(new Error('Opening this instrument was cancelled.'), { name: 'AbortError' });
  const invalid = (message, cause) => {
    const error = new Error('The bundled instrument ' + message);
    error.code = 'LOOM_EMBEDDED_DATA'; if (cause) error.cause = cause;
    return error;
  };
  function metadata(value, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_HTML_BYTES) throw new RangeError('Choose an instrument decompression limit of up to 36 MiB.');
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.encoding !== 'gzip-base64') throw invalid('has an unsupported data format.');
    const { bytes, sha256, data } = value;
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > maxBytes) throw invalid('exceeds its permitted HTML size.');
    if (typeof sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(sha256)) throw invalid('has invalid checksum metadata.');
    // A gzip member can be slightly larger than its input. Bound the encoded
    // allocation before base64 decoding, even if supplied metadata is corrupt.
    const compressedLimit = bytes + Math.max(65536, Math.ceil(bytes * .01));
    if (typeof data !== 'string' || !data.length || data.length % 4 !== 0 || data.length > Math.ceil(compressedLimit / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw invalid('contains invalid or excessive base64 data.');
    return { encoding: 'gzip-base64', bytes, sha256: sha256.toLowerCase(), data };
  }
  function same(entry, value) { return entry && entry.bytes === value.bytes && entry.sha256 === value.sha256 && entry.data === value.data; }
  function compressedBytes(data) {
    try {
      if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(data);
      const decode = scope.atob || globalThis.atob;
      if (typeof decode !== 'function') throw new Error('Base64 decoding is unavailable.');
      const binary = decode(data), result = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
      return result;
    } catch (error) { throw invalid('contains damaged base64 data.', error); }
  }
  async function unpack(value) {
    const Decompress = scope.DecompressionStream || globalThis.DecompressionStream;
    if (typeof Decompress !== 'function' || typeof Blob !== 'function' || typeof TextDecoder !== 'function') throw new Error('This browser cannot unpack this bundled instrument. Update your browser or open the instrument’s standalone HTML.');
    let reader, output, offset = 0;
    try {
      const input = compressedBytes(value.data);
      reader = new Blob([input]).stream().pipeThrough(new Decompress('gzip')).getReader();
      output = new Uint8Array(value.bytes);
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        const chunk = next.value;
        if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > value.bytes) throw invalid('expands beyond its declared HTML size.');
        output.set(chunk, offset); offset += chunk.byteLength;
      }
      if (offset !== value.bytes) throw invalid('does not match its declared HTML size.');
    } catch (error) {
      if (error?.code === 'LOOM_EMBEDDED_DATA') throw error;
      throw invalid('could not be unpacked. Its gzip data may be damaged.', error);
    } finally {
      if (reader) { try { await reader.cancel(); } catch (_) {} try { reader.releaseLock(); } catch (_) {} }
    }
    // Native gzip already checks its CRC. Verify the stronger build checksum
    // when Web Crypto is available without requiring a secure network origin
    // for standalone files or an otherwise supported local browser session.
    const cryptography = scope.crypto || globalThis.crypto;
    if (typeof cryptography?.subtle?.digest === 'function') {
      let digest;
      try { digest = await cryptography.subtle.digest('SHA-256', output); }
      catch (error) { throw invalid('checksum could not be verified.', error); }
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== value.sha256) throw invalid('does not match its build checksum.');
    }
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(output); }
    catch (error) { throw invalid('is not valid UTF-8 HTML.', error); }
  }
  function forConsumer(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const cancel = () => { cleanup(); reject(abortError()); };
      const cleanup = () => signal.removeEventListener('abort', cancel);
      signal.addEventListener('abort', cancel, { once: true });
      promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  }
  async function resolveEmbeddedInstrument(value, { signal, maxBytes = MAX_HTML_BYTES } = {}) {
    if (signal?.aborted) throw abortError();
    // Uploaded HTML and existing test/integration maps keep their original
    // string contract. Host validation still applies before a frame opens.
    if (typeof value === 'string') return value;
    const description = metadata(value, maxBytes);
    let entry = cache.get(value);
    if (!same(entry, description)) {
      entry = { ...description, promise: null };
      entry.promise = unpack(description).catch(error => { if (cache.get(value) === entry) cache.delete(value); throw error; });
      cache.set(value, entry);
    }
    // One canceled editor must not interrupt another caller sharing this pack.
    return forConsumer(entry.promise, signal);
  }
  scope.LoomResolveEmbeddedInstrument = resolveEmbeddedInstrument;
})(typeof window !== 'undefined' ? window : globalThis);
