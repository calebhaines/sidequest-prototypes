/* JavaScriptCore browser-language shims. Timers advance only on an explicit
 * preparation tick or the DAW sample clock; no wall-clock audio thread exists. */
(function (g) {
  'use strict';
  g.window = g; g.self = g; g.global = g;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (!g.btoa) g.btoa = function (value) {
    const text = String(value); let result = '';
    for (let i = 0; i < text.length; i += 3) {
      const a = text.charCodeAt(i), hasB = i + 1 < text.length, hasC = i + 2 < text.length;
      const b = hasB ? text.charCodeAt(i + 1) : 0, c = hasC ? text.charCodeAt(i + 2) : 0;
      if (a > 255 || b > 255 || c > 255) throw new TypeError('btoa expects binary characters.');
      result += alphabet[a >>> 2] + alphabet[(a & 3) << 4 | b >>> 4] + (hasB ? alphabet[(b & 15) << 2 | c >>> 6] : '=') + (hasC ? alphabet[c & 63] : '=');
    }
    return result;
  };
  const base64Values = new Int16Array(128); base64Values.fill(-1);
  for (let i = 0; i < alphabet.length; i++) base64Values[alphabet.charCodeAt(i)] = i;
  if (!g.atob) g.atob = function (value) {
    let text = String(value).replace(/[\t\n\f\r ]/g, ''), bits = 0, pending = 0, offset = 0;
    if (text.length % 4 === 0) text = text.replace(/==?$/, '');
    if (text.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(text)) throw new TypeError('Invalid base64 data.');
    const chunk = new Uint8Array(16384), parts = [];
    for (let i = 0; i < text.length; i++) {
      pending = pending << 6 | base64Values[text.charCodeAt(i)]; bits += 6;
      if (bits >= 8) { bits -= 8; chunk[offset++] = pending >>> bits & 255; if (offset === chunk.length) { parts.push(String.fromCharCode(...chunk)); offset = 0; } }
    }
    if (offset) parts.push(String.fromCharCode(...chunk.subarray(0, offset)));
    return parts.join('');
  };
  if (!g.TextEncoder) g.TextEncoder = class TextEncoder {
    get encoding() { return 'utf-8'; }
    encode(input = '') {
      const text = String(input), bytes = [];
      for (let i = 0; i < text.length; i++) {
        let c = text.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) { const low = text.charCodeAt(i + 1); if (low >= 0xdc00 && low <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + low - 0xdc00; i++; } else c = 0xfffd; }
        else if (c >= 0xdc00 && c <= 0xdfff) c = 0xfffd;
        if (c < 128) bytes.push(c);
        else if (c < 2048) bytes.push(0xc0 | c >>> 6, 0x80 | c & 63);
        else if (c < 65536) bytes.push(0xe0 | c >>> 12, 0x80 | c >>> 6 & 63, 0x80 | c & 63);
        else bytes.push(0xf0 | c >>> 18, 0x80 | c >>> 12 & 63, 0x80 | c >>> 6 & 63, 0x80 | c & 63);
      }
      return new Uint8Array(bytes);
    }
    encodeInto(input, destination) {
      const text = String(input); let read = 0, written = 0;
      for (const character of text) { const data = this.encode(character); if (written + data.length > destination.length) break; destination.set(data, written); written += data.length; read += character.length; }
      return { read, written };
    }
  };
  if (!g.TextDecoder) g.TextDecoder = class TextDecoder {
    constructor(label = 'utf-8', options = {}) { if (!/^utf-?8$/i.test(label)) throw new RangeError('Only UTF-8 decoding is supported.'); this.fatal = !!options.fatal; this.ignoreBOM = !!options.ignoreBOM; }
    get encoding() { return 'utf-8'; }
    decode(input) {
      const data = input == null ? new Uint8Array(0) : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let text = '';
      const replacement = () => { if (this.fatal) throw new TypeError('Invalid UTF-8 input.'); return '\ufffd'; };
      for (let at = 0; at < data.length;) {
        const first = data[at++]; let point, count, minimum;
        if (first < 128) { text += String.fromCharCode(first); continue; }
        if (first >= 0xc2 && first <= 0xdf) { point = first & 31; count = 1; minimum = 128; }
        else if (first >= 0xe0 && first <= 0xef) { point = first & 15; count = 2; minimum = 2048; }
        else if (first >= 0xf0 && first <= 0xf4) { point = first & 7; count = 3; minimum = 65536; }
        else { text += replacement(); continue; }
        let valid = at + count <= data.length;
        if (valid) for (let i = 0; i < count; i++) if ((data[at + i] & 0xc0) !== 0x80) { valid = false; break; }
        if (!valid) { text += replacement(); continue; }
        for (let i = 0; i < count; i++) point = point << 6 | data[at++ ] & 63;
        if (point < minimum || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) text += replacement();
        else if (point < 65536) text += String.fromCharCode(point);
        else { point -= 65536; text += String.fromCharCode(0xd800 | point >>> 10, 0xdc00 | point & 1023); }
      }
      return !this.ignoreBOM && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    }
  };
  if (!g.DOMException) g.DOMException = class DOMException extends Error { constructor(message = '', name = 'Error') { super(message); this.name = name; this.code = name === 'AbortError' ? 20 : 0; } };
  if (!g.structuredClone) g.structuredClone = function (input) {
    const seen = new Map();
    function clone(value) {
      if (value === null || typeof value !== 'object') { if (typeof value === 'function' || typeof value === 'symbol') throw new g.DOMException('Value cannot be cloned.', 'DataCloneError'); return value; }
      if (seen.has(value)) return seen.get(value);
      let output;
      if (value instanceof ArrayBuffer) output = value.slice(0);
      else if (ArrayBuffer.isView(value)) { const buffer = clone(value.buffer); output = value instanceof DataView ? new DataView(buffer, value.byteOffset, value.byteLength) : new value.constructor(buffer, value.byteOffset, value.length); }
      else if (value instanceof Date) output = new Date(value.getTime());
      else if (value instanceof Map) { output = new Map(); seen.set(value, output); for (const [key, entry] of value) output.set(clone(key), clone(entry)); }
      else if (value instanceof Set) { output = new Set(); seen.set(value, output); for (const entry of value) output.add(clone(entry)); }
      else { output = Array.isArray(value) ? [] : {}; seen.set(value, output); for (const key of Object.keys(value)) Object.defineProperty(output, key, { value: clone(value[key]), writable: true, enumerable: true, configurable: true }); }
      seen.set(value, output); return output;
    }
    return clone(input);
  };
  // Source modules use these identifiers for notes and assets, never security.
  if (!g.crypto) g.crypto = {};
  if (!g.crypto.getRandomValues) g.crypto.getRandomValues = function (array) { if (!ArrayBuffer.isView(array) || array instanceof Float32Array || array instanceof Float64Array || array.byteLength > 65536) throw new TypeError('Provide a small integer typed array.'); const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256); return array; };
  if (!g.crypto.randomUUID) g.crypto.randomUUID = function () { const bytes = g.crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128; const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')); return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join(''); };
  let now = 0, rate = 48000, serial = 0, audioStarted = false;
  const timers = new Map(), maximumCallbacks = 16384;
  function schedule(callback, delay, interval, args) {
    if (typeof callback !== 'function') throw new TypeError('Native timers require a function.');
    const wait = Math.max(interval ? .001 : 0, Number.isFinite(Number(delay)) ? Number(delay) : 0), id = ++serial;
    timers.set(id, { id, callback, args, due: now + wait, interval: interval ? wait : 0 }); return id;
  }
  g.setTimeout = (callback, delay, ...args) => schedule(callback, delay, false, args);
  g.setInterval = (callback, delay, ...args) => schedule(callback, delay, true, args);
  g.clearTimeout = g.clearInterval = id => timers.delete(Number(id));
  function advance(target) {
    if (!Number.isFinite(target) || target < now - 1e-7) throw new RangeError('The native sample clock must be monotonic.');
    let callbacks = 0;
    for (;;) {
      let next = null; for (const timer of timers.values()) if (timer.due <= target + 1e-9 && (!next || timer.due < next.due || timer.due === next.due && timer.id < next.id)) next = timer;
      if (!next) break;
      if (++callbacks > maximumCallbacks) throw Error('Native timer callback limit exceeded.');
      now = Math.max(now, next.due);
      if (next.interval) next.due += next.interval; else timers.delete(next.id);
      next.callback(...next.args);
    }
    now = Math.max(now, target); return callbacks;
  }
  function rebase(ms) { const shift = ms - now; for (const timer of timers.values()) timer.due += shift; now = ms; }
  g.performance = { now: () => now, timeOrigin: 0 };
  if (!g.queueMicrotask) g.queueMicrotask = callback => Promise.resolve().then(callback);
  if (!g.console) g.console = { log: (...args) => { if (g.KitchenNativeLog) g.KitchenNativeLog(args.map(String).join(' ')); }, warn: (...args) => { if (g.KitchenNativeLog) g.KitchenNativeLog(args.map(String).join(' ')); }, error: (...args) => { if (g.KitchenNativeLog) g.KitchenNativeLog(args.map(String).join(' ')); } };
  g.KitchenNativeEnvironment = Object.freeze({
    configure(options = {}) { if (Number.isFinite(options.sampleRate) && options.sampleRate > 0) rate = options.sampleRate; if (options.clearTimers) timers.clear(); rebase(0); audioStarted = false; },
    startAudio(frame = 0) { if (!audioStarted) { rebase(frame * 1000 / rate); audioStarted = true; } },
    rebaseAudio(frame = 0) { rebase(frame * 1000 / rate); audioStarted = true; },
    advanceToFrame(frame) { return advance(frame * 1000 / rate); },
    prepareTick(milliseconds = 1) { if (audioStarted) throw Error('Preparation ticks cannot advance a running audio engine.'); return advance(now + Math.max(0, Number(milliseconds) || 0)); },
    nextTimerFrame() { let due = Infinity; for (const timer of timers.values()) if (timer.due < due) due = timer.due; return Number.isFinite(due) ? Math.ceil(due * rate / 1000 - 1e-7) : Infinity; },
    // Preparation-only parking lets a throwaway engine warm JIT code without
    // advancing any timer or sample phase belonging to the published engine.
    captureClockState() { return { now, rate, serial, audioStarted, timers: Array.from(timers.values(), timer => ({ ...timer, args: timer.args.slice() })) }; },
    restoreClockState(saved) { if (!saved || !Number.isFinite(saved.now) || !Number.isFinite(saved.rate) || !Array.isArray(saved.timers)) throw Error('Invalid parked native clock.'); timers.clear(); for (const timer of saved.timers) timers.set(timer.id, timer); now = saved.now; rate = saved.rate; serial = Math.max(serial, saved.serial); audioStarted = saved.audioStarted; },
    get timeMilliseconds() { return now; }, get pendingTimers() { return timers.size; }, get sampleRate() { return rate; }
  });
})(globalThis);
