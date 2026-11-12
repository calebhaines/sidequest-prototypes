'use strict';
// Exercise the actual packed script and selected-product resources used by C++.
// Each product gets a fresh process, matching the native per-instance VM boundary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const generated = path.resolve(__dirname, '../generated');
const manifest = JSON.parse(fs.readFileSync(path.join(generated, 'products.json'), 'utf8'));
const selected = process.argv.indexOf('--product');
if (selected < 0) {
  const evidence = [];
  for (const product of manifest.products) {
    const result = spawnSync(process.execPath, ['--max-old-space-size=1536', __filename, '--product', product.id], { encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    if (result.status !== 0) { process.stderr.write(result.stdout || ''); process.stderr.write(result.stderr || String(result.error || 'Failed packed runtime')); process.exit(1); }
    const row = JSON.parse(result.stdout.trim()); evidence.push(row);
    console.log('PASS packed ' + row.name + ': MIDI/audio, host clock, native parameter overlays, resource isolation and closed-editor state');
  }
  fs.writeFileSync(path.join(generated, 'packed-runtime-report.json'), JSON.stringify({ passed: true, products: evidence }, null, 2) + '\n');
  process.exit(0);
}
(async () => {
  const product = manifest.products.find(value => value.id === process.argv[selected + 1]); assert(product);
  const io = { inputLeft: new Float32Array(1024), inputRight: new Float32Array(1024), outputLeft: new Float32Array(1024), outputRight: new Float32Array(1024), clock: new Float64Array(16), events: new Float64Array(4096 * 8), eventCount: 0, outputEvents: new Float64Array(4096 * 8), outputEventCount: 0, parameters: new Float64Array(4096) };
  let rendering = false, reads = 0;
  const g = { Float32Array, Float64Array, Uint8Array, Int32Array, ArrayBuffer, DataView, KitchenHostIO: io, KitchenPluginDescriptor: product,
    KitchenNativeReadResource(relative, asText) {
      assert(!rendering, 'Asset reads must finish before rendering');
      assert(relative.startsWith('assets/' + product.id + '/'), 'A plugin loaded another product\'s assets');
      const resolved = path.resolve(generated, relative); assert(resolved.startsWith(generated + path.sep));
      const bytes = fs.existsSync(resolved) ? fs.readFileSync(resolved) : zlib.gunzipSync(fs.readFileSync(resolved + '.gz'));
      reads++; return asText ? bytes.toString('utf8') : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(generated, 'runtime.js'), 'utf8'), g, { filename: 'packed-kitchen.js', timeout: 60000 });
  const api = g.KitchenNativePlugin;
  async function prepare(state) {
    api.create(product.id, 48000, 1024, state);
    for (let n = 0; n < 2000 && !JSON.parse(api.getStatusJSON()).ready; n++) { api.prepareTick(5); await Promise.resolve(); }
    assert(JSON.parse(api.getStatusJSON()).ready, api.getStatusJSON());
    product.parameters.forEach((parameter, index) => api.setParameter(index, parameter.defaultNormalized));
    const follow = product.parameters.findIndex(value => value.path === '_nativeSequence' || value.path === 'followHost');
    if (follow >= 0) api.setParameter(follow, 0);
  }
  function render() {
    let energy = 0, peak = 0, frame = 0, beat = 0;
    for (let block = 0; block < 32; block++) {
      const count = [129, 301, 512, 63][block % 4], bpm = block < 16 ? 120 : 137;
      if (block === 24) beat = .5;
      io.clock.set([bpm, beat, 0, 7, 8, +(block >= 24), .5, 2.5, frame - 1000, frame + 500000, block >= 24 ? 2 : block >= 16 ? 1 : 0, 48000, count, 0, 1, 1]);
      io.eventCount = 0;
      if (product.kind === 'instrument' && (block === 0 || block === 26)) {
        io.eventCount = 3;
        [36, 48, 60].forEach((pitch, index) => io.events.set([17, block === 0 ? 1 : 2, pitch, block === 0 ? .8 : 0, 1, 100 + index, 0, 0], index * 8));
      }
      for (let i = 0; i < count; i++) {
        io.inputLeft[i] = product.kind === 'instrument' ? 0 : .07 * Math.sin((frame + i) * 220 * Math.PI * 2 / 48000);
        io.inputRight[i] = product.kind === 'instrument' ? 0 : .06 * Math.sin((frame + i) * 330 * Math.PI * 2 / 48000);
      }
      rendering = true; api.render(count); rendering = false;
      assert(JSON.parse(api.getStatusJSON()).ready, api.getStatusJSON());
      for (let i = 0; i < count; i++) for (const output of [io.outputLeft, io.outputRight]) { assert(Number.isFinite(output[i]), product.id + ' emitted invalid PCM'); energy += output[i] * output[i]; peak = Math.max(peak, Math.abs(output[i])); }
      frame += count; beat += count * bpm / (60 * 48000);
    }
    assert(energy > 1e-12, product.id + ' emitted silence'); return { energy, peak, frames: frame };
  }
  await prepare(''); const metrics = render(), state = api.getStateJSON(); assert(JSON.parse(state));
  await prepare(state); const restored = render();
  console.log(JSON.stringify({ id: product.id, name: product.name, ...metrics, restoredEnergy: restored.energy, assetReads: reads, stateBytes: Buffer.byteLength(state), latencySamples: api.getLatencySamples() }));
})().catch(error => { console.error(error); process.exit(1); });
