import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after } from "node:test";
import { loadDsp } from "./dsp-loader.mjs";

const { audio, "burner-controls": controls, cleanup } = await loadDsp(["audio", "burner-controls"]);
after(cleanup);
const { CURRENT_PRESETS, ARCHIVE_PRESETS, FACTORY_KITS, PRESETS,
  buildFactoryKit, buildDefaultKit, cloneParams, renderSound,
  renderExactPatternEvents, renderNativeEvents } = audio;
const { getBurnerControls, setBurnerControl } = controls;
const types = ["kick", "snare", "clap", "hat", "tom", "rim", "perc", "shaker"];
const hash = pcm => createHash("sha256").update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)).digest("hex");
const difference = (a, b) => {
  let sum = 0;
  for (let i = 0, length = Math.max(a.length, b.length); i < length; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum / Math.max(a.length, b.length));
};
const peak = pcm => pcm.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);

test("four coherent factory kits contain 32 unique, dry, editable electronic drum recipes", () => {
  assert.equal(CURRENT_PRESETS.length, 32);
  assert.equal(ARCHIVE_PRESETS.length, 46);
  assert.equal(PRESETS.length, 78);
  assert.equal(FACTORY_KITS.length, 4);
  assert.deepEqual(buildDefaultKit(), buildFactoryKit("enamel"));
  const hashes = new Set();
  for (const kit of FACTORY_KITS) {
    const sounds = buildFactoryKit(kit.id);
    assert.deepEqual(sounds.map(sound => sound.type), types);
    assert.equal(kit.presetIds.length, 8);
    for (const sound of sounds) {
      assert.equal(sound.effects.reverb, 0);
      assert.equal(sound.effects.delay, 0);
      assert.equal(sound.architecture.layers.length, 3);
      assert.ok(sound.architecture.layers.every(layer => layer.enabled && layer.level > 0));
      const pcm = renderSound(sound, 22050);
      assert.ok(peak(pcm) > .05 && peak(pcm) <= .981, sound.name);
      assert.ok(pcm.every(Number.isFinite), sound.name);
      assert.ok(pcm[0] === 0 && pcm.at(-1) === 0, sound.name);
      assert.ok(pcm.length < 22050, `${sound.name}: unexpected long tail`);
      assert.equal(hash(pcm), hash(renderSound(sound, 22050)), sound.name);
      hashes.add(hash(pcm));
    }
    const again = buildFactoryKit(kit.id);
    sounds[0].architecture.layers[0].fm.ratios[1] = 15;
    assert.notEqual(sounds[0].architecture.layers[0].fm.ratios[1], again[0].architecture.layers[0].fm.ratios[1]);
  }
  assert.equal(hashes.size, 32, "two factory recipes produce identical PCM");
  assert.throws(() => buildFactoryKit("missing"), /factory kit/);
});

test("all six burner controls alter actual PCM in every new voice without mutating the recipe", () => {
  for (const preset of CURRENT_PRESETS) {
    const original = structuredClone(preset.params);
    const before = renderSound(original, 22050);
    const current = getBurnerControls(original);
    const edits = { pitch: current.pitch * 1.17, length: current.length * .61,
      body: .35, snap: .65, air: .65, heat: .78 };
    for (const [key, value] of Object.entries(edits)) {
      const changed = setBurnerControl(original, key, value);
      const pcm = renderSound(changed, 22050);
      assert.ok(difference(before, pcm) > .00001, `${preset.name}: ${key} is inaudible`);
      assert.ok(pcm.every(Number.isFinite) && peak(pcm) <= .981, `${preset.name}: ${key} unsafe`);
      assert.ok(pcm[0] === 0 && pcm.at(-1) === 0);
      assert.deepEqual(original, preset.params, `${preset.name}: ${key} mutated source`);
    }
  }
});

test("zeroed Body, Snap and Air faders can be raised again without changing ingredients", () => {
  const original = buildDefaultKit()[1];
  for (const [key, index] of [["body", 0], ["snap", 1], ["air", 2]]) {
    const down = setBurnerControl(original, key, 0);
    assert.equal(getBurnerControls(down)[key], 0, `${key}: jumped to another ingredient`);
    const up = setBurnerControl(down, key, .3);
    assert.equal(getBurnerControls(up)[key], .3);
    assert.equal(up.architecture.layers[index].engine, original.architecture.layers[index].engine);
    assert.deepEqual(up.noise, original.noise, `${key}: changed noise bed`);
    assert.ok(up.architecture.layers[index].enabled);
  }
  const old = cloneParams(ARCHIVE_PRESETS.find(preset => preset.id === "dry-snap").params);
  const changed = setBurnerControl(old, "air", .31);
  assert.equal(changed.noise.level, .31);
  assert.equal(changed.architecture.layers[2].enabled, false);
  assert.equal(getBurnerControls(changed).air, .31);
});

test("Length follows active layers and coherently scales envelopes while preserving level and pitch", () => {
  const original = buildFactoryKit("cold")[0];
  original.tone.decay = 2000; // This global modulation envelope does not define the active body.
  const start = getBurnerControls(original).length;
  assert.equal(start, original.architecture.layers[0].envelope.decay);
  const changed = setBurnerControl(original, "length", start * .5);
  assert.equal(getBurnerControls(changed).length, start * .5);
  assert.equal(changed.tone.frequency, original.tone.frequency);
  assert.deepEqual(changed.effects, original.effects);
  for (let i = 0; i < 3; i++) {
    const before = original.architecture.layers[i], afterLayer = changed.architecture.layers[i];
    assert.equal(afterLayer.level, before.level);
    assert.equal(afterLayer.tune, before.tune);
    assert.equal(afterLayer.envelope.decay, Math.max(5, before.envelope.decay * .5));
    assert.equal(afterLayer.fm.indexDecay, Math.max(1, before.fm.indexDecay * .5));
    assert.deepEqual(afterLayer.fm.decays, before.fm.decays.map(value => Math.max(1, value * .5)));
  }
  assert.deepEqual(setBurnerControl(original, "pitch", NaN), audio.sanitizeParams(original));
});

test("legacy percussion and hybrid recipes retain exact pre-overhaul PCM", () => {
  // Recorded from the previous published DSP at 22.05 kHz, before this change.
  const expected = {
    "sub-foundation": "073859e220d2095f88e31bfec5cdbab64c358b1d8395042fc38df56dac0ef11c",
    "dry-snap": "08124ecf8da77a98679944e03bb97505ccca57e81c1084cb96faef54f65d95cb",
    "room-hands": "cc3799355b0d4a1a1da7bef6d1497bd80af6738cce0358690c122c840dde3557",
    "closed-metal": "96d78da6d0db9a1952b55ce88602a7ec575f9e3675fa35173883ed56df543070",
    "furnace-kick": "a72bde6ba054170cc3e0f94f0632897e6c345daf89a1f93698a21aab4e8dbefa",
    "chrome-snare": "155646e93370efe95bb2d632c3852d3051b60bec586ef597a9380de0fbcde352",
    "molecular-clap": "3b626ddd9bb573dd6b5e8e46434b1e8daf00376ad837f61276b9450604ccb514",
    "magnet-hat": "88f44da3a9553077485e2afa4f7a2ee761e51a857805c5134547e7035f954258",
  };
  for (const [id, digest] of Object.entries(expected)) {
    const preset = PRESETS.find(preset => preset.id === id);
    assert.equal(preset.archive, true);
    assert.equal(hash(renderSound(preset.params, 22050)), digest, id);
  }
});

test("exact imported events preserve timing, pitch, pan and host PCM at supported export rates", async () => {
  const sounds = buildDefaultKit();
  sounds.forEach(sound => { sound.mix.volume = .1; });
  sounds[0].mix.pan = -.4;
  sounds[1].mix.pan = .35;
  sounds[6].mix.pan = .2;
  const events = [
    { voice: 0, at: .053, velocity: .75, pitch: 7 },
    { voice: 1, at: .481, velocity: .31, pitch: -12 },
    { voice: 6, at: 1.037, velocity: .56, pitch: 3 },
  ];
  const native = await renderNativeEvents(sounds, events, { durationSeconds: 2, tailSeconds: 3 });
  const channels = renderExactPatternEvents(sounds, events, { sampleRate: 48000, durationSeconds: 2, tailSeconds: 3 });
  assert.equal(channels[0].length * 2, native.pcm.length);
  for (let i = 0; i < channels[0].length; i++) {
    assert.equal(channels[0][i], native.pcm[i * 2]);
    assert.equal(channels[1][i], native.pcm[i * 2 + 1]);
  }
  for (const sampleRate of [8000, 44100, 96000]) {
    const [left, right] = renderExactPatternEvents(sounds, events, { sampleRate, durationSeconds: 2, master: 1 });
    assert.equal(left.length, sampleRate * 2);
    assert.equal(right.length, left.length);
    assert.ok(left.every(Number.isFinite) && right.every(Number.isFinite));
    assert.equal(left.findIndex(value => value !== 0), Math.round(.053 * sampleRate) + 1);
    assert.ok(peak(left) > .01);
    assert.ok(difference(left, right) > .00001, "factory panning disappeared");
  }
  assert.throws(() => renderExactPatternEvents(sounds, [{ ...events[0], at: -1 }], { durationSeconds: 2 }), /scheduled note/);
  assert.throws(() => renderExactPatternEvents(sounds, events, { durationSeconds: Infinity }), /render bounds/);
});
