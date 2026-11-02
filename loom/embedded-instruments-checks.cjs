'use strict';
// Native gzip decoding preserves exact standalone HTML without evaluating it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');
const { createHash, webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
const NativeDecompressionStream = globalThis.DecompressionStream;
assert.equal(typeof NativeDecompressionStream, 'function', 'Run these native decoding checks with a current Node version.');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'embedded-instruments.js'), 'utf8'), { filename: 'embedded-instruments.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'instrument-host.js'), 'utf8'), { filename: 'instrument-host.js' });
const resolve = LoomResolveEmbeddedInstrument;
const packet = input => { const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'); return { encoding: 'gzip-base64', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: gzipSync(bytes, { level: 9, mtime: 0 }).toString('base64') }; };
const copy = value => JSON.parse(JSON.stringify(value));
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
async function withGlobal(name, value, run) { const original = Object.getOwnPropertyDescriptor(globalThis, name); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); try { return await run(); } finally { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; } }
async function countDecodes(run) { let count = 0; const Counting = class { constructor(format) { count++; return new NativeDecompressionStream(format); } }; return withGlobal('DecompressionStream', Counting, () => run(() => count)); }
const isAbort = error => error?.name === 'AbortError';
(async () => {
  await check('Legacy and custom HTML strings keep their exact fast path without gzip, crypto or network APIs', async () => {
    const original = '\ufeff<!doctype html>\n<script>window.__must_not_run = true;<\/script>\n<p>é · 台所 · \u2028</p>\n';
    const fetchBefore = globalThis.fetch;
    await withGlobal('DecompressionStream', undefined, () => withGlobal('crypto', undefined, () => withGlobal('fetch', () => { throw Error('No network expected.'); }, async () => {
      assert.equal(await resolve(original), original); assert.equal(await resolve('', { maxBytes: 1 }), ''); assert.equal(await resolve(original, { maxBytes: 1 }), original, 'Host HTML validation still applies separately to existing string maps.');
    })));
    assert.equal(globalThis.fetch, fetchBefore); assert.equal(globalThis.__must_not_run, undefined);
  });
  await check('Native gzip round-trips BOM, Unicode, script endings and exact UTF-8 bytes without executing HTML', async () => {
    const text = '\ufeff<!doctype html>\r\n<script>throw Error("This HTML must not execute");<\/script>\n<div>🍋\u2028é\u2029漢字</div>\n';
    const record = packet(text), before = copy(record), output = await resolve(record);
    assert.equal(output, text); assert.equal(output.charCodeAt(0), 0xfeff); assert.deepEqual(Buffer.from(output, 'utf8'), Buffer.from(text, 'utf8')); assert.equal(createHash('sha256').update(Buffer.from(output)).digest('hex'), record.sha256); assert.deepEqual(record, before);
    assert.equal(await resolve({ ...record, sha256: record.sha256.toUpperCase() }), text);
  });
  await check('Malformed records, oversized metadata and encoded allocations fail before decompression', async () => {
    await countDecodes(async count => {
      const valid = packet('valid HTML'), malformed = [null, {}, [], { ...valid, encoding: 'deflate' }, { ...valid, bytes: 0 }, { ...valid, bytes: -1 }, { ...valid, bytes: 1.5 }, { ...valid, bytes: 36 * 1024 * 1024 + 1 }, { ...valid, sha256: 'bad-checksum' }, { ...valid, data: '' }, { ...valid, data: '===' }, { ...valid, data: 'A!AA' }, { ...valid, bytes: 1, data: 'A'.repeat(100000) }];
      for (const record of malformed) await assert.rejects(resolve(record), /bundled instrument|limit/i);
      await assert.rejects(resolve(valid, { maxBytes: valid.bytes - 1 }), /size/i); await assert.rejects(resolve(valid, { maxBytes: Infinity }), /limit/i); await assert.rejects(resolve(valid, { maxBytes: 0 }), /limit/i);
      assert.equal(count(), 0, 'Rejected metadata must not allocate a decoder.');
    });
  });
  await check('Damaged gzip, declared-size mismatch, output overflow and invalid UTF-8 are rejected', async () => {
    const record = packet('A valid standalone page'), packed = Buffer.from(record.data, 'base64'); packed[packed.length - 8] ^= 1;
    await assert.rejects(resolve({ ...record, data: packed.toString('base64') }), /unpacked|damaged|gzip/i);
    await assert.rejects(resolve({ ...record, bytes: record.bytes + 1 }), /declared HTML size/i);
    const expanded = packet(Buffer.alloc(1024 * 1024, 65)); expanded.bytes = 1; await assert.rejects(resolve(expanded), /expands beyond its declared/i, 'Output is bounded while reading the stream, not after allocating the inflated payload.');
    await assert.rejects(resolve(packet(Buffer.from([0xc3, 0x28]))), /UTF-8/i);
  });
  await check('Available Web Crypto verifies SHA-256, failed results are evicted and can be retried', async () => {
    await countDecodes(async count => {
      const correct = packet('An intact page with a checksum'), record = { ...correct, sha256: '0'.repeat(64) };
      await assert.rejects(resolve(record), /build checksum/i); await assert.rejects(resolve(record), /build checksum/i); assert.equal(count(), 2, 'A failed promise is not retained as a permanent cache entry.');
      record.sha256 = correct.sha256; assert.equal(await resolve(record), 'An intact page with a checksum'); assert.equal(count(), 3);
    });
  });
  await check('Native gzip CRC and byte validation still support a browser session without Web Crypto', async () => {
    const record = packet('Offline or local HTML remains usable'); await withGlobal('crypto', undefined, async () => { assert.equal(await resolve(record), 'Offline or local HTML remains usable'); });
    await withGlobal('DecompressionStream', undefined, async () => { await assert.rejects(resolve(packet('Needs gzip support')), /browser cannot unpack.*update|standalone HTML/i); });
  });
  await check('Concurrent consumers share one decode; canceling one does not cancel the other or poison its cache', async () => {
    await countDecodes(async count => {
      const text = '<!doctype html>\n' + 'A repeated instrument asset.\n'.repeat(40000), record = packet(text), controller = new AbortController();
      const first = resolve(record, { signal: controller.signal }), second = resolve(record); controller.abort(); await assert.rejects(first, isAbort); assert.equal(await second, text); assert.equal(count(), 1); assert.equal(await resolve(record), text); assert.equal(count(), 1);
      const before = count(), already = new AbortController(); already.abort(); await assert.rejects(resolve(packet('Never starts'), { signal: already.signal }), isAbort); await assert.rejects(resolve('Legacy canceled string', { signal: already.signal }), isAbort); assert.equal(count(), before);
    });
  });
  await check('Cache identity distinguishes custom maps and in-place record updates, and honors every caller limit', async () => {
    await countDecodes(async count => {
      const first = { ...packet('First BATTER copy'), id: 'batter' }, second = { ...packet('Different custom BATTER copy'), id: 'batter' };
      assert.equal(await resolve(first), 'First BATTER copy'); assert.equal(await resolve(second), 'Different custom BATTER copy'); assert.equal(count(), 2);
      await assert.rejects(resolve(first, { maxBytes: first.bytes - 1 }), /size/i); assert.equal(count(), 2, 'An existing cache entry cannot bypass a stricter caller limit.');
      Object.assign(first, packet('Updated BATTER copy')); assert.equal(await resolve(first), 'Updated BATTER copy'); assert.equal(count(), 3);
    });
  });
  await check('The host rejects damaged bundled records without fetching a remote replacement', async () => {
    let fetched = 0, unloaded = 0;
    const host = Object.create(LoomInstrumentHost.prototype); Object.assign(host, { embedded: { batter: { ...packet('Host page'), data: 'bad=' } }, baseURL: 'https://kitchen.example/music/', onStatus() {}, _current: () => true, unload: () => unloaded++ });
    const frame = {}, record = { id: 'batter', trackId: 'track-1', iframe: frame, definition: null, abortController: new AbortController() };
    await withGlobal('fetch', async () => { fetched++; throw Error('Must not fetch corrupted local content.'); }, async () => { await assert.rejects(host._load(record, { id: 'batter' }, null), /unpack|damaged|gzip/i); });
    assert.equal(fetched, 0); assert.equal(unloaded, 1); assert.equal(frame.srcdoc, undefined);
  });
  await check('Host custom HTML precedence and stale-operation guards remain ahead of iframe creation', async () => {
    let decodes = 0, fetched = 0;
    const host = Object.create(LoomInstrumentHost.prototype); Object.assign(host, { embedded: { batter: packet('Unused embedded BATTER') }, baseURL: 'https://kitchen.example/music/', onStatus() {}, _current: () => false, unload() { throw Error('A stale operation must not unload a new instrument.'); } });
    const makeRecord = () => ({ id: 'batter', trackId: 'track-1', iframe: {}, definition: null, abortController: new AbortController() });
    const custom = makeRecord(); await withGlobal('LoomResolveEmbeddedInstrument', async () => { decodes++; throw Error('Custom HTML must take precedence.'); }, () => withGlobal('fetch', async () => { fetched++; throw Error('No fetch expected.'); }, async () => { await assert.rejects(host._load(custom, { id: 'batter', html: '<!doctype html><p>Custom standalone HTML</p>' }, null), isAbort); }));
    assert.equal(decodes, 0); assert.equal(fetched, 0); assert.equal(custom.iframe.srcdoc, undefined);
    const bundled = makeRecord(); await assert.rejects(host._load(bundled, { id: 'batter' }, null), isAbort); assert.equal(bundled.iframe.srcdoc, undefined);
  });
  console.log(passed + ' embedded instrument decoding, integrity and host lifecycle groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
