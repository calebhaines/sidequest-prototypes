'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

async function main() {
  const context = vm.createContext({ window: {}, Uint32Array, Uint8Array, DataView, ArrayBuffer, Blob, TextEncoder, DOMException, setTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'zip.js'), 'utf8'), context);
  const pack = context.window.FableZip.pack;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fable-zip-'));
  try {
    const archive = await pack([
      { name: 'known-crc.txt', data: '123456789' },
      { name: 'samples/caf\u00e9.wav', data: new Blob([new Uint8Array([0, 255, 1, 128])]) },
      { name: 'empty.txt', data: new ArrayBuffer(0) },
      { name: 'manifest.json', data: JSON.stringify({ root: 69, name: 'Caf\u00e9' }) }
    ]);
    assert.equal(archive.type, 'application/zip');
    const filename = path.join(directory, 'collection.zip');
    fs.writeFileSync(filename, Buffer.from(await archive.arrayBuffer()));
    const result = spawnSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    assert archive.namelist() == ['known-crc.txt', 'samples/caf\u00e9.wav', 'empty.txt', 'manifest.json']
    assert archive.read('known-crc.txt') == b'123456789'
    assert archive.getinfo('known-crc.txt').CRC == 0xcbf43926
    assert archive.read('samples/caf\u00e9.wav') == bytes([0, 255, 1, 128])
    assert archive.getinfo('samples/caf\u00e9.wav').flag_bits & 0x800
    assert archive.read('empty.txt') == b''
    assert json.loads(archive.read('manifest.json')) == {'root': 69, 'name': 'Caf\u00e9'}
    assert all(item.date_time == (2026, 10, 5, 0, 0, 0) for item in archive.infolist())
`, filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    console.log('PASS: standard ZIP reader validates bytes, known CRC, Unicode names, manifest, and empty files.');

    await assert.rejects(pack([]), /one and 128/);
    await assert.rejects(pack(Array.from({ length: 129 }, (_, i) => ({ name: String(i), data: '' }))), /one and 128/);
    for (const name of ['../bad.wav', '/bad.wav', 'C:bad.wav', 'bad\\name.wav', 'bad//name', 'bad/./name', 'bad\0.wav']) {
      await assert.rejects(pack([{ name, data: '' }]), /safe relative/);
    }
    await assert.rejects(pack([{ name: 'same.wav', data: '' }, { name: 'same.wav', data: '' }]), /unique/);
    await assert.rejects(pack([{ name: 'wrong.wav', data: 42 }]), /bytes or text/);
    console.log('PASS: malformed collections, unsafe paths, duplicate names, and invalid payloads are rejected.');

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(pack([{ name: 'sample.wav', data: '' }], { signal: controller.signal }), { name: 'AbortError' });
    const active = new AbortController();
    const pending = pack([{ name: 'first.wav', data: '' }, { name: 'second.wav', data: '' }], { signal: active.signal });
    setTimeout(() => active.abort(), 0);
    await assert.rejects(pending, { name: 'AbortError' });
    console.log('PASS: cancellation before and during archive creation prevents an export.');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
