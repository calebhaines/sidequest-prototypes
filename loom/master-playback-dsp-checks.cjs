/* Native correctness checks: node loom/master-playback-dsp-checks.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
function loadAssets() {
  const vendor = path.join(root, 'morsel/vendor/signalsmith/assets.js');
  if (fs.existsSync(vendor)) {
    const bundle = { window: {} }; vm.runInNewContext(fs.readFileSync(vendor, 'utf8'), bundle);
    return bundle.window.MorselStretchAssets;
  }
  // The editable GALLEY archive carries the complete standalone instrument.
  // Read only its serialized stretch assets; never execute instrument scripts.
  const html = fs.readFileSync(path.join(__dirname, 'instruments/morsel.html'), 'utf8');
  const marker = 'window.MorselStretchAssets=', at = html.indexOf(marker);
  if (at < 0) throw new Error('Bundled Signalsmith assets are missing.');
  const start = html.indexOf('{', at + marker.length);
  let depth = 0, quoted = false, escaped = false;
  for (let end = start; end < html.length; ++end) {
    const c = html[end];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') ++depth;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, end + 1));
  }
  throw new Error('Bundled Signalsmith assets are incomplete.');
}
const assets = loadAssets();
const context = { window: {}, setTimeout, clearTimeout, console, AbortController };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'master-playback-dsp.js'), 'utf8'), context);
const api = context.window.LoomMasterTransform;
let created = 0, terminated = 0, total = 0;
function workerFactory(source) {
  ++created;
  const worker = new Worker(`const {parentPort}=require('node:worker_threads'); globalThis.require=require; globalThis.__dirname=${JSON.stringify(root)}; globalThis.self=globalThis; self.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer); parentPort.on('message', data=>self.onmessage({data}));\n${source}`, { eval: true });
  const result = { postMessage: (m, t) => worker.postMessage(m, t), terminate: () => { ++terminated; return worker.terminate(); }, onmessage: null, onerror: null };
  worker.on('message', data => { if (result.onmessage) result.onmessage({ data }); });
  worker.on('error', error => { if (result.onerror) result.onerror(error); });
  return result;
}
const processor = () => new api.Processor({ assets, workerFactory });
const SR = 24000;
function tone(freq = 440, seconds = .6, amplitude = .15) {
  const left = new Float32Array(Math.round(seconds * SR)), right = new Float32Array(left.length);
  for (let i = 0; i < left.length; ++i) left[i] = right[i] = amplitude * Math.sin(i * freq * Math.PI * 2 / SR);
  return { left, right, sampleRate: SR };
}
function frequency(channel, rate = SR) {
  const start = Math.floor(channel.length * .25), end = Math.floor(channel.length * .8), crosses = [];
  for (let i = start + 1; i < end; ++i) if (channel[i - 1] <= 0 && channel[i] > 0) crosses.push(i);
  return (crosses.length - 1) * rate / (crosses.at(-1) - crosses[0]);
}
function rms(a) { let e = 0; for (const x of a) e += x * x; return Math.sqrt(e / Math.max(1, a.length)); }
function near(actual, expected, tolerance, message) { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual}, expected ${expected} ±${tolerance}`); }
async function test(name, callback) { await callback(); ++total; console.log(`PASS ${name}`); }
(async () => {
  await test('settings clamp, duration and independent/linked pitch', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(api.normalize())), { speed: 1, pitch: 0, preservePitch: true, algorithm: 'signalsmith' });
    assert.deepEqual(JSON.parse(JSON.stringify(api.normalize({ speed: 99, pitch: -99, preservePitch: false }))), { speed: 2, pitch: -24, preservePitch: false, algorithm: 'signalsmith' });
    assert.equal(api.durationFrames(101, { speed: 2 }), 51);
    assert.equal(api.durationFrames(101, { speed: .25 }), 404);
    assert.equal(api.pitchSemitones({ speed: .5, pitch: 3, preservePitch: false }), -9);
    assert.equal(api.pitchSemitones({ speed: .5, pitch: 3 }), 3);
    assert.ok(api.isNeutral({ speed: 1, pitch: 0, preservePitch: false }));
    assert.throws(() => api.durationFrames(-1), /frame count/);
    assert.throws(() => api.durationFrames(Number.MAX_SAFE_INTEGER, { speed: .25 }), /too long/);
  });
  await test('neutral is exact, retains source buffers, no worker/assets evaluation', async () => {
    const p = new api.Processor({ workerFactory: () => { throw Error('Must not start'); } });
    const input = tone(), before = created, output = await p.process(input, {});
    assert.equal(output.left, input.left); assert.equal(output.right, input.right); assert.equal(created, before);
    assert.equal(output.frames, input.left.length); assert.equal(output.sampleRate, SR);
    p.dispose();
  });
  await test('validation and PCM allocation budget fail before worker', async () => {
    const p = new api.Processor({ assets, workerFactory, maxPcmBytes: 1000 }), before = created;
    await assert.rejects(p.process(tone(), { speed: .5 }), /PCM budget/);
    await assert.rejects(p.process({ left: [0], right: [0], sampleRate: SR }), /Float32/);
    await assert.rejects(p.process({ left: new Float32Array(1), right: new Float32Array(2), sampleRate: SR }), /equally sized/);
    await assert.rejects(p.process({ left: new Float32Array(1), right: new Float32Array(1), sampleRate: 1000 }), /sample rate/);
    const bad = tone(440, .001); bad.left[1] = NaN;
    await assert.rejects(p.process(bad, {}), /non-finite/);
    assert.equal(created, before); p.dispose();
  });
  await test('lazy JSON extraction never executes instrument HTML', async () => {
    context.window.LoomEmbeddedInstruments = { morsel: '<script>throw new Error("Do not run MORSEL");window.MorselStretchAssets=' + JSON.stringify(assets) + ';\n</script>' };
    const p = new api.Processor({ workerFactory });
    try { const out = await p.process(tone(), { speed: .5 }); assert.equal(out.frames, SR * 1.2); }
    finally { p.dispose(); delete context.window.LoomEmbeddedInstruments; }
  });
  const p = processor();
  try {
    await test('pitch-preserved slow/fast output has exact length and source frequency', async () => {
      const input = tone(), before = input.left.slice();
      for (const speed of [.25, .5, 2]) {
        const output = await p.process(input, { speed });
        assert.equal(output.frames, Math.round(input.left.length / speed)); assert.equal(output.left.length, output.frames); assert.equal(output.right.length, output.frames);
        near(frequency(output.left), 440, speed === .25 ? 7 : 2, `${speed}x fundamental`);
      }
      assert.deepEqual(input.left, before); assert.equal(input.left.buffer.byteLength, before.buffer.byteLength);
    });
    await test('independent octave pitch and linked repitch are accurate', async () => {
      for (const [settings, expected] of [[{ speed: 1, pitch: 12 }, 880], [{ speed: 1, pitch: -12 }, 220], [{ speed: .5, preservePitch: false }, 220], [{ speed: 2, preservePitch: false }, 880], [{ speed: .5, preservePitch: false, pitch: 12 }, 440]]) {
        const out = await p.process(tone(), settings); near(frequency(out.left), expected, 3, JSON.stringify(settings));
      }
    });
    await test('stereo coherence and polarity are preserved', async () => {
      const identical = await p.process(tone(), { speed: .7, pitch: 5 });
      let error = 0; for (let i = 0; i < identical.frames; ++i) error = Math.max(error, Math.abs(identical.left[i] - identical.right[i]));
      assert.ok(error < .001, `Stereo identical-channel peak error ${error}`);
      const input = tone(); for (let i = 0; i < input.right.length; ++i) input.right[i] = -input.left[i];
      const inverted = await p.process(input, { speed: .7, pitch: -5 }); error = 0;
      for (let i = 0; i < inverted.frames; ++i) error = Math.max(error, Math.abs(inverted.left[i] + inverted.right[i]));
      assert.ok(error < .001, `Stereo polarity peak error ${error}`);
    });
    await test('two input channels remain independent without mono collapse', async () => {
      const input = tone(330); for (let i = 0; i < input.right.length; ++i) input.right[i] = .12 * Math.sin(i * 660 * Math.PI * 2 / SR);
      const out = await p.process(input, { speed: .5, pitch: 0 }); near(frequency(out.left), 330, 3, 'left frequency'); near(frequency(out.right), 660, 3, 'right frequency');
    });
    await test('no gain normalization or compressor and deterministic job reset', async () => {
      const quiet = await p.process(tone(440, .5, .08), { speed: .6, pitch: 2 });
      const loud = await p.process(tone(440, .5, .16), { speed: .6, pitch: 2 });
      near(20 * Math.log10(rms(loud.left) / rms(quiet.left)), 6.020599913, .002, 'level doubling');
      const repeat = await p.process(tone(440, .5, .08), { speed: .6, pitch: 2 });
      assert.deepEqual(repeat.left, quiet.left);
    });
    await test('boundary attacks are retained without a fixed latency offset', async () => {
      for (const speed of [.5, 2]) {
        const input = tone(440, .8, 0); input.left[0] = input.right[0] = .8;
        const out = await p.process(input, { speed });
        let peak = 0, position = 0; for (let i = 0; i < Math.min(out.frames, SR / 5); ++i) if (Math.abs(out.left[i]) > peak) { peak = Math.abs(out.left[i]); position = i; }
        assert.ok(peak > .05, `Beginning impulse lost at ${speed}x`); assert.ok(position < SR * .01, `Beginning impulse shifted ${position} at ${speed}x`);
        input.left.fill(0); input.right.fill(0); const at = Math.round(SR * .4); input.left[at] = input.right[at] = .8;
        const middle = await p.process(input, { speed }); peak = 0; position = 0;
        for (let i = 0; i < middle.frames; ++i) if (Math.abs(middle.left[i]) > peak) { peak = Math.abs(middle.left[i]); position = i; }
        assert.ok(peak > .05); near(position, Math.round(at / speed), SR * .03, `Interior impulse at ${speed}x`);
        input.left.fill(0); input.right.fill(0); input.left[input.left.length - 1] = input.right[input.right.length - 1] = .8;
        const end = await p.process(input, { speed }); let energy = 0;
        for (let i = Math.max(0, end.frames - SR * .08); i < end.frames; ++i) energy += end.left[i] ** 2;
        assert.ok(energy > .001, `Final impulse lost at ${speed}x`);
      }
    });
    await test('supported sample rates and WASM memory growth retain exact stereo output', async () => {
      for (const sampleRate of [8000, 44100, 48000, 96000, 192000, 24000]) {
        const frames = Math.round(sampleRate * .12), left = new Float32Array(frames), right = new Float32Array(frames);
        for (let i = 0; i < frames; ++i) left[i] = right[i] = .1 * Math.sin(i * 440 * Math.PI * 2 / sampleRate);
        const out = await p.process({ left, right, sampleRate }, { speed: .75, pitch: 3 });
        assert.equal(out.sampleRate, sampleRate); assert.equal(out.frames, Math.round(frames / .75));
        assert.ok(rms(out.left) > .01); for (const value of out.left) assert.ok(Number.isFinite(value));
      }
    });
    await test('short clips and extreme pitch/rate remain finite and exact', async () => {
      for (const length of [1, 17, 200]) {
        const input = { left: new Float32Array(length).fill(.1), right: new Float32Array(length).fill(-.1), sampleRate: SR };
        for (const [speed, pitch] of [[.25, -24], [2, 24]]) {
          const out = await p.process(input, { speed, pitch }); assert.equal(out.frames, Math.round(length / speed));
          for (const value of out.left) assert.ok(Number.isFinite(value));
        }
      }
      const input = tone(); input.right[4] = Infinity;
      await assert.rejects(p.process(input, { speed: .5 }), /non-finite/);
    });
    await test('progress is monotonic and completion is exactly one', async () => {
      const progress = []; await p.process(tone(), { speed: .5 }, { onProgress: value => progress.push(value) });
      assert.equal(progress.at(-1), 1); for (let i = 1; i < progress.length; ++i) assert.ok(progress[i] >= progress[i - 1]);
    });
  } finally { p.dispose(); }
  await test('abort terminates work, preserves source and allows clean restart', async () => {
    const p = processor(), controller = new AbortController(), before = terminated, input = tone(440, 3);
    try {
      await assert.rejects(p.process(input, { speed: .25 }, { signal: controller.signal, onProgress: () => controller.abort() }), error => error.name === 'AbortError');
      assert.ok(terminated > before); assert.ok(input.left.byteLength > 0);
      const out = await p.process(tone(), { speed: 2 }); assert.equal(out.frames, SR * .3);
    } finally { p.dispose(); }
  });
  await test('a newer job cancels obsolete preparation; dispose rejects future work', async () => {
    const p = processor(); const first = p.process(tone(440, 3), { speed: .25 });
    const cancelled = assert.rejects(first, error => error.name === 'AbortError');
    const second = p.process(tone(), { speed: 2 }); await cancelled; assert.equal((await second).frames, SR * .3);
    p.dispose(); await assert.rejects(p.process(tone(), {}), error => error.name === 'AbortError');
    const c = new AbortController(); c.abort(); const other = processor();
    await assert.rejects(other.process(tone(), { speed: .5 }, { signal: c.signal }), error => error.name === 'AbortError'); other.dispose();
  });
  await test('algorithm catalog and strict project schema agree; unknown IDs retain the original engine', () => {
    const scope = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'schema.js'), 'utf8'), scope);
    assert.deepEqual(Array.from(api.ALGORITHMS, item => item.id), Array.from(scope.window.LoomSchema.MASTER_STRETCH_ALGORITHMS));
    assert(Object.isFrozen(api.ALGORITHMS)); assert(api.ALGORITHMS.every(Object.isFrozen));
    for (const algorithm of [undefined, null, '', 'unknown', 4]) assert.equal(api.normalize({ algorithm }).algorithm, 'signalsmith');
    for (const algorithm of api.ALGORITHMS) assert.equal(api.normalize({ algorithm: algorithm.id }).algorithm, algorithm.id);
  });
  await test('the original Signalsmith output stays byte-identical to the immutable released implementation', async () => {
    const oldContext = { window: {}, setTimeout, clearTimeout, console, AbortController };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'master-playback-signalsmith-fixture.js'), 'utf8'), oldContext);
    const reference = new oldContext.window.LoomMasterTransform.Processor({ assets, workerFactory }), actual = processor();
    const hashes = [];
    try {
      const input = tone(330, .33); for (let i = 0; i < input.right.length; i++) input.right[i] = .12 * Math.sin(i * 660 * 2 * Math.PI / SR);
      input.left[0] = .3; input.right[input.right.length - 1] = -.2;
      for (const settings of [{ speed: .5 }, { speed: .731, pitch: 3.25 }, { speed: 2, pitch: -2, preservePitch: false }, { speed: 1.5, pitch: 0 }]) {
        const expected = await reference.process(input, settings), output = await actual.process(input, settings);
        assert(Buffer.from(output.left.buffer).equals(Buffer.from(expected.left.buffer)), 'Original left PCM must match byte for byte: ' + JSON.stringify(settings)); assert(Buffer.from(output.right.buffer).equals(Buffer.from(expected.right.buffer)), 'Original right PCM must match byte for byte: ' + JSON.stringify(settings));
        hashes.push({ settings, sha256: require('node:crypto').createHash('sha256').update(Buffer.from(output.left.buffer)).update(Buffer.from(output.right.buffer)).digest('hex') });
      }
      console.log('SIGNALSMITH REFERENCE', JSON.stringify(hashes));
    } finally { reference.dispose(); actual.dispose(); }
  });
  const distinct = [];
  for (const algorithm of ['wsola', 'phase-vocoder', 'granular']) {
    const p = new api.Processor({ workerFactory });
    try {
      await test(algorithm + ' works without bundled WASM and keeps neutral input buffers exact', async () => {
        const before = created, input = tone();
        const neutral = await p.process(input, { algorithm });
        assert.equal(neutral.left, input.left); assert.equal(neutral.right, input.right); assert.equal(created, before);
        const output = await p.process(input, { algorithm, speed: .5 });
        assert.equal(output.frames, input.left.length * 2); assert(rms(output.left) > .04);
        distinct.push(require('node:crypto').createHash('sha256').update(Buffer.from(output.left.buffer)).digest('hex'));
      });
      await test(algorithm + ' preserves musical pitch across slow/fast speed, independent octaves and tape pitch', async () => {
        const tolerance = algorithm === 'granular' ? 10 : 3;
        for (const [settings, expected] of [[{ speed: .25 }, 440], [{ speed: .5 }, 440], [{ speed: 2 }, 440], [{ speed: 1, pitch: 12 }, 880], [{ speed: 1, pitch: -12 }, 220], [{ speed: .7, pitch: 5 }, 440 * 2 ** (5 / 12)], [{ speed: .5, preservePitch: false }, 220], [{ speed: 2, preservePitch: false }, 880]]) {
          const input = tone(440, 1), before = input.left.slice(), output = await p.process(input, { ...settings, algorithm });
          assert.equal(output.frames, Math.round(input.left.length / settings.speed)); assert.equal(output.left.length, output.frames); assert.equal(output.right.length, output.frames);
          near(frequency(output.left), expected, tolerance, algorithm + ' ' + JSON.stringify(settings));
          assert(rms(output.left) > .025, 'No near-cancellation of a sustained tone'); assert.deepEqual(input.left, before);
          for (const value of output.left) assert(Number.isFinite(value));
        }
      });
      await test(algorithm + ' preserves identical and inverted stereo, separate channel pitches and hard-pan silence', async () => {
        for (const polarity of [1, -1]) {
          const input = tone(440, .8); for (let i = 0; i < input.right.length; i++) input.right[i] = input.left[i] * polarity;
          const output = await p.process(input, { algorithm, speed: .7, pitch: 5 }); let error = 0;
          for (let i = 0; i < output.frames; i++) error = Math.max(error, Math.abs(output.left[i] - output.right[i] * polarity));
          assert(error < 1e-6, 'Common stereo timing and phase must preserve polarity: ' + error);
        }
        const input = tone(440, 1); for (let i = 0; i < input.right.length; i++) input.right[i] = .12 * Math.sin(i * 660 * 2 * Math.PI / SR);
        const output = await p.process(input, { algorithm, speed: .5 });
        near(frequency(output.left), 440, algorithm === 'granular' ? 10 : 3, 'Independent left fundamental');
        near(frequency(output.right), 660, algorithm === 'granular' ? 10 : 3, 'Independent right fundamental');
        input.right.fill(0); const mono = await p.process(input, { algorithm, speed: .75, pitch: -4 });
        assert.equal(rms(mono.right), 0, 'No unintended crossfeed into a silent channel'); assert(rms(mono.left) > .02);
      });
      await test(algorithm + ' retains beginning, interior and final impulses without a fixed alignment delay', async () => {
        for (const speed of [.5, 2]) for (const position of [0, SR * .4, Math.round(SR * .8) - 1]) {
          const input = tone(440, .8, 0); input.left[position] = input.right[position] = .8;
          const output = await p.process(input, { algorithm, speed }); let peak = 0, at = 0, energy = 0;
          for (let i = 0; i < output.frames; i++) { energy += output.left[i] ** 2; if (Math.abs(output.left[i]) > peak) { peak = Math.abs(output.left[i]); at = i; } }
          assert(energy > .002 && peak > .02, 'An isolated boundary/transient must remain audible');
          near(at, Math.min(output.frames - 1, Math.round(position / speed)), SR * .07, 'Transient displacement stays within one analysis/grain window');
          if (position === 0) assert(at < SR * .01, 'No hidden start latency');
        }
      });
      await test(algorithm + ' keeps silence, supported rates, tiny clips and extreme pitch/rate finite and exact', async () => {
        const silent = await p.process(tone(440, .05, 0), { algorithm, speed: .25, pitch: 24 }); assert.equal(rms(silent.left), 0); assert.equal(rms(silent.right), 0);
        for (const length of [0, 1, 17, 200]) for (const [speed, pitch, preservePitch] of [[.25, -24, false], [2, 24, false], [.25, 24, true], [2, -24, true]]) {
          const input = { left: new Float32Array(length).fill(.1), right: new Float32Array(length).fill(-.1), sampleRate: SR };
          const output = await p.process(input, { algorithm, speed, pitch, preservePitch }); assert.equal(output.frames, Math.round(length / speed));
          for (const value of output.left) assert(Number.isFinite(value)); for (const value of output.right) assert(Number.isFinite(value));
        }
        for (const sampleRate of [8000, 44100, 48000, 96000, 192000]) {
          const frames = Math.round(sampleRate * .12), left = new Float32Array(frames), right = new Float32Array(frames);
          for (let i = 0; i < frames; i++) left[i] = right[i] = .1 * Math.sin(i * 440 * 2 * Math.PI / sampleRate);
          const output = await p.process({ left, right, sampleRate }, { algorithm, speed: .75, pitch: 3 });
          assert.equal(output.sampleRate, sampleRate); assert.equal(output.frames, Math.round(frames / .75)); assert(rms(output.left) > .01);
          for (const value of output.left) assert(Number.isFinite(value));
        }
      });
      await test(algorithm + ' preserves gain scaling, repeatability and suppresses high-pitch resampling aliases', async () => {
        const quiet = await p.process(tone(440, .6, .08), { algorithm, speed: .6, pitch: 2 });
        const loud = await p.process(tone(440, .6, .16), { algorithm, speed: .6, pitch: 2 });
        near(20 * Math.log10(rms(loud.left) / rms(quiet.left)), 6.020599913, .002, 'No hidden compressor or gain normalization');
        const repeat = await p.process(tone(440, .6, .08), { algorithm, speed: .6, pitch: 2 }); assert.deepEqual(repeat.left, quiet.left);
        const pass = await p.process(tone(440, .5), { algorithm, speed: 1, pitch: 24 });
        const stop = await p.process(tone(10000, .5), { algorithm, speed: 1, pitch: 24 });
        assert(rms(stop.left) < rms(pass.left) * .03, 'Pitch-up rejects input above the new Nyquist limit');
        const tapePass = await p.process(tone(440, .5), { algorithm, speed: 2, preservePitch: false });
        const tapeStop = await p.process(tone(10000, .5), { algorithm, speed: 2, preservePitch: false });
        assert(rms(tapeStop.left) < rms(tapePass.left) * .03, 'Pure tape resampling is band-limited too');
      });
      await test(algorithm + ' reports monotonic progress, aborts its worker, preserves input and restarts cleanly', async () => {
        const input = tone(440, 3), controller = new AbortController(), before = terminated, progress = [];
        await assert.rejects(p.process(input, { algorithm, speed: .25 }, { signal: controller.signal, onProgress: value => { progress.push(value); controller.abort(); } }), error => error.name === 'AbortError');
        assert(terminated > before); assert.equal(input.left.byteLength, 3 * SR * 4);
        const output = await p.process(tone(), { algorithm, speed: 2 }, { onProgress: value => progress.push(value) }); assert.equal(output.frames, SR * .3);
        // The aborted and restarted jobs each own their own monotonic sequence.
        assert(progress.length >= 2 && progress.at(-1) === 1);
        const monotonic = []; await p.process(tone(), { algorithm, speed: .5 }, { onProgress: value => monotonic.push(value) });
        for (let i = 1; i < monotonic.length; i++) assert(monotonic[i] >= monotonic[i - 1]); assert.equal(monotonic.at(-1), 1);
      });
    } finally { p.dispose(); }
  }
  await test('odd-frame fractional-speed tape playback uses one identical band-limited resampler across JavaScript engines', async () => {
    const p = new api.Processor({ workerFactory }), input = tone(440, 14401 / SR);
    try {
      for (const speed of [.673, 2, .251]) {
        let reference;
        for (const algorithm of ['wsola', 'phase-vocoder', 'granular']) {
          const output = await p.process(input, { algorithm, speed, pitch: 0, preservePitch: false });
          assert.equal(output.frames, Math.round(input.left.length / speed));
          if (reference) { assert.deepEqual(output.left, reference.left); assert.deepEqual(output.right, reference.right); }
          else reference = output;
          near(frequency(output.left), 440 * input.left.length / output.frames, 2, 'Rounded tape clock determines exact resampling pitch');
        }
      }
    } finally { p.dispose(); }
  });
  await test('the three new algorithms render distinct PCM rather than aliasing the same implementation', () => { assert.equal(new Set(distinct).size, 3); });
  await test('JavaScript scratch and overlap buffers are included before any worker allocation', async () => {
    const input = tone(), originalLimit = input.left.length * 8 * 2 + input.left.length * 2 * 8;
    const p = new api.Processor({ workerFactory, maxPcmBytes: originalLimit }), before = created;
    for (const algorithm of ['wsola', 'phase-vocoder', 'granular']) await assert.rejects(p.process(input, { algorithm, speed: .5 }), /PCM budget/);
    assert.equal(created, before); p.dispose();
  });
  await test('one processor switches JavaScript and Signalsmith engines and recovers after cancellation', async () => {
    const p = processor();
    try {
      for (const algorithm of ['wsola', 'signalsmith', 'granular', 'signalsmith']) {
        const output = await p.process(tone(), { algorithm, speed: .5 }); assert.equal(output.frames, SR * 1.2); assert(rms(output.left) > .02);
      }
      const controller = new AbortController();
      await assert.rejects(p.process(tone(440, 3), { algorithm: 'phase-vocoder', speed: .25 }, { signal: controller.signal, onProgress: () => controller.abort() }), error => error.name === 'AbortError');
      const output = await p.process(tone(), { algorithm: 'signalsmith', speed: 2 }); near(frequency(output.left), 440, 3, 'WASM restart after cancelled JS job');
      const first = p.process(tone(440, 3), { algorithm: 'wsola', speed: .25 }), cancelled = assert.rejects(first, error => error.name === 'AbortError');
      const second = p.process(tone(), { algorithm: 'signalsmith', speed: 2 }); await cancelled; assert.equal((await second).frames, SR * .3);
    } finally { p.dispose(); }
  });
  console.log(`${total} master transform checks passed; workers created ${created}, terminated ${terminated}.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
