/* Portable sample collections, using the standard ZIP store method. */
(() => {
  'use strict';
  const table = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    return value >>> 0;
  });
  const cancelled = signal => { if (signal?.aborted) throw new DOMException('Sample export canceled.', 'AbortError'); };
  const crc32 = data => {
    let value = 0xffffffff;
    for (let i = 0; i < data.length; i++) value = table[(value ^ data[i]) & 255] ^ value >>> 8;
    return (value ^ 0xffffffff) >>> 0;
  };
  async function bytes(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (Object.prototype.toString.call(value) === '[object Blob]') return new Uint8Array(await value.arrayBuffer());
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('Provide sample file bytes or text.');
  }
  async function pack(files, { signal } = {}) {
    cancelled(signal);
    if (!Array.isArray(files) || !files.length || files.length > 128) throw new Error('Choose between one and 128 sample files.');
    const entries = [], directory = [], names = new Set(), encoder = new TextEncoder();
    let offset = 0, total = 0;
    for (const file of files) {
      cancelled(signal);
      if (typeof file?.name !== 'string' || !file.name || /[\u0000-\u001f\u007f\\]/.test(file.name) || file.name.startsWith('/') || file.name.includes(':') || file.name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Use a safe relative sample filename.');
      const name = encoder.encode(file.name);
      if (name.length > 1024 || names.has(file.name)) throw new Error('Sample filenames must be unique and reasonably short.');
      names.add(file.name);
      const data = await bytes(file.data); cancelled(signal); total += data.byteLength;
      if (total > 128 * 1024 * 1024) throw new Error('The sample collection exceeds the 128 MiB archive limit.');
      const crc = crc32(data), header = new Uint8Array(30), head = new DataView(header.buffer);
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x800, true);
      head.setUint16(10, 0, true); head.setUint16(12, (2026 - 1980) << 9 | 10 << 5 | 5, true);
      head.setUint32(14, crc, true); head.setUint32(18, data.byteLength, true); head.setUint32(22, data.byteLength, true); head.setUint16(26, name.length, true);
      const central = new Uint8Array(46), view = new DataView(central.buffer);
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x800, true);
      view.setUint16(12, 0, true); view.setUint16(14, (2026 - 1980) << 9 | 10 << 5 | 5, true);
      view.setUint32(16, crc, true); view.setUint32(20, data.byteLength, true); view.setUint32(24, data.byteLength, true); view.setUint16(28, name.length, true); view.setUint32(42, offset, true);
      entries.push(header, name, data); directory.push(central, name); offset += header.length + name.length + data.byteLength;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    cancelled(signal);
    const centralSize = directory.reduce((sum, item) => sum + item.byteLength, 0), ending = new Uint8Array(22), end = new DataView(ending.buffer);
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
    return new Blob([...entries, ...directory, ending], { type: 'application/zip' });
  }
  window.FableZip = Object.freeze({ pack });
})();
