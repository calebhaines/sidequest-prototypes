import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadDsp } from "./dsp-loader.mjs";

// Compile the production DSP directly so these checks also run on Node 20.
// Its browser AudioContext is created lazily.
const { audio, cleanup } = await loadDsp(["audio"]);
after(cleanup);
const {
  AudioEngine,
  PRESETS,
  buildDefaultKit,
  cloneParams,
  encodeWav,
  normalizeSamples,
  renderPattern,
  renderSound,
  trimSilence,
  waveformPeaks,
} = audio;

const kit = buildDefaultKit();
const differs = (a, b) =>
  a.length !== b.length || a.some((value, index) => value !== b[index]);
const peakOf = (samples) =>
  samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);

test("every factory preset renders a deterministic, finite, bounded sound with click-free endpoints", () => {
  assert.ok(PRESETS.length >= 24);
  assert.equal(
    new Set(PRESETS.map((preset) => preset.id)).size,
    PRESETS.length,
  );
  assert.deepEqual(
    kit.map((sound) => sound.type),
    ["kick", "snare", "clap", "hat", "tom", "rim", "perc", "shaker"],
  );
  for (const preset of PRESETS) {
    const samples = renderSound(preset.params);
    assert.ok(
      samples.length >= 44100 * 0.05 && samples.length <= 44100 * 6,
      preset.name,
    );
    assert.ok(
      samples.every(Number.isFinite),
      `${preset.name}: non-finite audio`,
    );
    const peak = peakOf(samples);
    assert.ok(
      peak > 0.005 && peak <= 0.981,
      `${preset.name}: invalid peak ${peak}`,
    );
    assert.ok(
      samples[0] === 0 && samples.at(-1) === 0,
      `${preset.name}: un-faded endpoint`,
    );
    assert.ok(
      !differs(samples, renderSound(preset.params)),
      `${preset.name}: non-deterministic render`,
    );
  }
});

test("tone, envelope, noise, degradation, spatial effects, level, and seed control the actual audio", () => {
  // The default kit now demonstrates hybrid engines. This check specifically
  // verifies the legacy percussion controls, which apply to percussion layers.
  const original = PRESETS.find((preset) => preset.id === "dry-snap").params;
  const reference = renderSound(original);
  const changes = [
    ["tone", "frequency", 220],
    ["tone", "pitchDecay", 100],
    ["tone", "pitchAmount", 24],
    ["tone", "waveform", "square"],
    ["tone", "attack", 20],
    ["tone", "decay", 260],
    ["tone", "release", 100],
    ["noise", "level", 0],
    ["noise", "color", "brown"],
    ["noise", "filter", 2000],
    ["noise", "decay", 300],
    ["effects", "drive", 0.8],
    ["effects", "bitDepth", 5],
    ["effects", "sampleRate", 8000],
    ["effects", "reverb", 0.5],
    ["effects", "delay", 0.5],
    ["mix", "volume", 0.2],
  ];
  for (const [group, key, value] of changes) {
    const changed = cloneParams(original);
    changed[group][key] = value;
    assert.ok(
      differs(reference, renderSound(changed)),
      `${group}.${key} has no audible effect`,
    );
  }
  const changedSeed = cloneParams(original);
  changedSeed.seed++;
  assert.ok(
    differs(reference, renderSound(changedSeed)),
    "different seed must vary the noise",
  );
  const muted = cloneParams(original);
  muted.mix.volume = 0;
  assert.ok(
    renderSound(muted).every((value) => value === 0),
    "zero voice level must render silence",
  );
});

function pcmValue(view, index, depth) {
  const offset = 44 + (index * depth) / 8;
  if (depth === 16) return view.getInt16(offset, true);
  if (depth === 32) return view.getInt32(offset, true);
  return (
    view.getUint8(offset) |
    (view.getUint8(offset + 1) << 8) |
    (view.getInt8(offset + 2) << 16)
  );
}

test("16-, 24-, and 32-bit WAVs have valid PCM headers, signed endpoints, stereo order, and RIFF padding", async () => {
  const decoder = new TextDecoder();
  for (const depth of [16, 24, 32]) {
    const buffer = await encodeWav(
      new Float32Array([-1, 0, 0.5, 1]),
      48000,
      depth,
    ).arrayBuffer();
    const view = new DataView(buffer);
    assert.equal(decoder.decode(buffer.slice(0, 4)), "RIFF");
    assert.equal(decoder.decode(buffer.slice(8, 12)), "WAVE");
    assert.equal(decoder.decode(buffer.slice(12, 16)), "fmt ");
    assert.equal(decoder.decode(buffer.slice(36, 40)), "data");
    assert.equal(view.getUint16(20, true), 1, "signed PCM format");
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), 48000);
    assert.equal(view.getUint32(28, true), (48000 * depth) / 8);
    assert.equal(view.getUint16(32, true), depth / 8);
    assert.equal(view.getUint16(34, true), depth);
    assert.equal(view.getUint32(40, true), (depth / 8) * 4);
    assert.equal(view.getUint32(4, true), buffer.byteLength - 8);
    assert.equal(pcmValue(view, 0, depth), -(2 ** (depth - 1)));
    assert.equal(pcmValue(view, 1, depth), 0);
    assert.equal(
      pcmValue(view, 2, depth),
      Math.round(0.5 * (2 ** (depth - 1) - 1)),
    );
    assert.equal(pcmValue(view, 3, depth), 2 ** (depth - 1) - 1);
    const stereo = new DataView(
      await encodeWav(
        [new Float32Array([0.5, 0.25]), new Float32Array([-0.5, -0.25])],
        44100,
        depth,
      ).arrayBuffer(),
    );
    assert.equal(stereo.getUint16(22, true), 2);
    assert.equal(stereo.getUint16(32, true), (depth / 8) * 2);
    assert.ok(pcmValue(stereo, 0, depth) > 0 && pcmValue(stereo, 1, depth) < 0);
    assert.ok(pcmValue(stereo, 2, depth) > 0 && pcmValue(stereo, 3, depth) < 0);
  }
  const odd = new DataView(
    await encodeWav(new Float32Array([0.5, -0.5, 0]), 44100, 24).arrayBuffer(),
  );
  assert.equal(odd.getUint32(40, true), 9, "data size excludes the pad byte");
  assert.equal(odd.byteLength, 54, "odd-sized PCM chunk has one pad byte");
  assert.equal(odd.getUint32(4, true), 46, "RIFF size includes padding");
  assert.equal(odd.getUint8(53), 0);
});

test("pattern exports preserve exact swing onset, velocity, pan, mute, loop length, and complete tails", () => {
  const sound = cloneParams(kit[0]);
  sound.mix.pan = -1;
  const rendered = renderSound(sound);
  const firstSoundSample = rendered.findIndex(
    (value) => Math.abs(value) > 0.00001,
  );
  const steps = Array(16).fill(false);
  steps[1] = true;
  for (const swing of [0, 0.3, 0.6]) {
    const [left, right] = renderPattern([{ params: sound, steps }], 120, {
      swing,
      tail: false,
    });
    const expectedOffset = Math.round((1 + swing) * 0.125 * 44100);
    assert.equal(
      left.length,
      88200,
      "16 sixteenths at 120 BPM occupy exactly two seconds",
    );
    assert.equal(
      left.findIndex((value) => Math.abs(value) > 0.00001),
      expectedOffset + firstSoundSample,
    );
    assert.ok(
      right.every((value) => value === 0),
      "hard-left pan must silence right channel",
    );
  }
  const full = renderPattern([{ params: sound, steps }], 120, { tail: false });
  const quiet = renderPattern(
    [{ params: sound, steps, velocities: Array(16).fill(0.5) }],
    120,
    { tail: false },
  );
  assert.ok(Math.abs(peakOf(quiet[0]) / peakOf(full[0]) - 0.5) < 0.000001);
  const muted = renderPattern([{ params: sound, steps, muted: true }], 120, {
    tail: false,
  });
  assert.ok(muted.every((channel) => channel.every((value) => value === 0)));
  const withTails = renderPattern([{ params: kit[2], steps }], 120);
  assert.ok(withTails[0].length > full[0].length);
  assert.ok(
    withTails.every((channel) =>
      channel.every((value) => Number.isFinite(value) && Math.abs(value) <= 1),
    ),
  );
});

test("normalization, silence trimming, and waveform summaries handle real sounds and complete silence", () => {
  const samples = renderSound(kit[1]);
  const normalized = normalizeSamples(samples);
  assert.ok(Math.abs(peakOf(normalized) - 10 ** (-1 / 20)) < 0.000001);
  assert.ok(
    !differs(samples, renderSound(kit[1])),
    "export helpers must not mutate source audio",
  );
  const trimmed = trimSilence(samples);
  assert.ok(trimmed.length > 0 && trimmed.length < samples.length);
  assert.ok(trimmed.every(Number.isFinite));
  assert.ok(trimmed.at(-1) === 0, "trimmed sample must still fade out");
  const peaks = waveformPeaks(samples, 128);
  assert.equal(peaks.length, 128);
  assert.ok(
    peaks.every((value) => Number.isFinite(value) && Math.abs(value) <= 1),
  );
  const silence = new Float32Array(4410);
  assert.ok(normalizeSamples(silence).every((value) => value === 0));
  assert.ok(trimSilence(silence).length > 0);
  assert.ok(waveformPeaks(silence).every((value) => value === 0));
});

test("Web Audio warm-up shares cached buffers; scheduling, master volume, and stop cancellation remain safe", async () => {
  const parameter = () => ({
    value: 0,
    setTargetAtTime(value) {
      this.value = value;
    },
  });
  class Node {
    connect(other) {
      return other;
    }
    disconnect() {}
  }
  class Gain extends Node {
    gain = parameter();
  }
  class Panner extends Node {
    pan = parameter();
  }
  class Compressor extends Node {
    threshold = parameter();
    knee = parameter();
    ratio = parameter();
    attack = parameter();
    release = parameter();
  }
  class Source extends Node {
    onended = null;
    start(at) {
      this.started = at;
    }
    stop() {
      this.stopped = true;
      this.onended?.();
    }
  }
  class Context {
    sampleRate = 44100;
    currentTime = 0.5;
    state = "suspended";
    destination = new Node();
    buffers = 0;
    sources = [];
    gains = [];
    async resume() {
      this.state = "running";
    }
    async close() {
      this.state = "closed";
    }
    createGain() {
      const gain = new Gain();
      this.gains.push(gain);
      return gain;
    }
    createDynamicsCompressor() {
      return new Compressor();
    }
    createStereoPanner() {
      return new Panner();
    }
    createBuffer(_channels, length) {
      this.buffers++;
      const samples = new Float32Array(length);
      return {
        getChannelData() {
          return samples;
        },
      };
    }
    createBufferSource() {
      const source = new Source();
      this.sources.push(source);
      return source;
    }
  }
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: Context };
  const engine = new AudioEngine();
  const interrupted = new AudioEngine();
  try {
    engine.setMasterVolume(0.4);
    await engine.preload(kit);
    const context = engine.audioContext;
    assert.equal(context.buffers, 8);
    assert.equal(
      context.gains[0].gain.value,
      0.4,
      "pre-resume master settings persist",
    );
    await engine.preload(kit);
    await engine.play(kit[0], 0.7, 1.25);
    assert.equal(context.buffers, 8, "play must reuse the preloaded buffer");
    assert.equal(context.sources[0].started, 1.25);
    assert.equal(context.gains[1].gain.value, 0.7);
    engine.setMasterVolume(0.2);
    assert.equal(context.gains[0].gain.value, 0.2);
    await engine.play(kit[0], 1, 0.1);
    assert.equal(
      context.sources[1].started,
      0.5,
      "late schedules start at current time",
    );
    engine.stopAll();
    assert.ok(context.sources.every((source) => source.stopped));
    const pending = engine.play(kit[1]);
    engine.stopAll();
    await pending;
    assert.equal(
      context.sources.length,
      2,
      "stop must cancel a pending asynchronous play",
    );
    const warming = interrupted.preload(kit);
    setTimeout(() => interrupted.stopAll(), 0);
    await warming;
    assert.ok(
      interrupted.audioContext.buffers < 8,
      "stop must cancel warm-up between voices",
    );
    await engine.close();
    assert.equal(engine.audioContext, null);
  } finally {
    await engine.close();
    await interrupted.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
