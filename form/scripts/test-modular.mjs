import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadDsp } from "./dsp-loader.mjs";

const { audio, cleanup } = await loadDsp(["audio"]);
after(cleanup);
const { PRESETS, cloneParams, renderPattern, renderSound, sanitizeParams } =
  audio;
const rate = 22050;
const engines = ["percussion", "subtractive", "fm", "wavetable", "granular"];
const copy = (value) => structuredClone(value);

function layer(engine = "subtractive", id = "a") {
  return {
    id,
    enabled: id === "a",
    engine,
    level: 0.8,
    tune: 0,
    envelope: { attack: 0.5, decay: 320, release: 30, curve: 4 },
    subtractive: {
      waveform: "sine",
      waveform2: "triangle",
      detune: 12,
      blend: 0.25,
      cutoff: 8000,
      resonance: 0.15,
      filterType: "lowpass",
      filterEnvelope: 0,
    },
    fm: {
      algorithm: "cascade",
      ratios: [1, 2, 3.1, 5],
      levels: [1, 0.7, 0.55, 0.4],
      decays: [320, 220, 170, 120],
      feedback: 0.2,
      index: 3.5,
      indexDecay: 180,
    },
    wavetable: {
      table: "basic",
      position: 0.35,
      scan: 0.4,
      scanRate: 4,
      warp: 0.15,
    },
    granular: {
      source: "internal",
      position: 0.3,
      size: 45,
      density: 90,
      spray: 0.15,
      jitter: 0.25,
      pitch: 0,
      reverse: false,
      texture: "metal",
    },
  };
}

function sound(engine = "subtractive") {
  // A stable legacy patch makes all tests independent of the default kit bank.
  const params = cloneParams(
    PRESETS.find((preset) => preset.id === "sub-foundation").params,
  );
  params.tone.frequency = 210;
  params.tone.pitchAmount = 0;
  params.tone.attack = 0.5;
  params.tone.decay = 320;
  params.tone.release = 30;
  params.noise.level = 0;
  params.effects = {
    drive: 0,
    bitDepth: 16,
    sampleRate: 48000,
    reverb: 0,
    delay: 0,
  };
  params.mix = { volume: 0.8, pan: 0 };
  params.architecture = {
    layers: [
      layer(engine),
      layer("subtractive", "b"),
      layer("subtractive", "c"),
    ],
    routes: [],
    lfos: [
      { shape: "sine", rate: 9, depth: 1, phase: 0 },
      { shape: "triangle", rate: 5, depth: 0.7, phase: 0.2 },
    ],
    interaction: { source: 1, target: 0, type: "none", amount: 0.7 },
  };
  return params;
}

function peak(samples) {
  return samples.reduce(
    (value, sample) => Math.max(value, Math.abs(sample)),
    0,
  );
}

function rmsDifference(left, right) {
  let energy = 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    energy += ((left[index] || 0) - (right[index] || 0)) ** 2;
  }
  return Math.sqrt(energy / length);
}

function audibleChange(params, mutate, label) {
  const before = renderSound(params, rate);
  const changed = copy(params);
  mutate(changed, changed.architecture.layers[0]);
  const after = renderSound(changed, rate);
  assert.ok(
    rmsDifference(before, after) > 0.00001,
    `${label} must change rendered PCM`,
  );
  assert.ok(after.every(Number.isFinite), `${label} produced non-finite PCM`);
  assert.ok(peak(after) <= 0.981, `${label} exceeded the output ceiling`);
}

function importedSource() {
  const sampleRate = 8000;
  const data = Array.from({ length: 6400 }, (_, index) => {
    const t = index / sampleRate;
    // A changing, asymmetric source reveals position, rate, and reversal.
    const phase = 2 * Math.PI * (170 * t + 490 * t * t);
    return 0.5 * Math.sin(phase) + 0.23 * Math.sin(2 * phase + 0.7);
  });
  return { name: "test chirp", sampleRate, data };
}

test("all five layer engines render distinct, deterministic percussion with safe endpoints at multiple rates", () => {
  const rendered = [];
  for (const engine of engines) {
    const params = sound(engine);
    const samples = renderSound(params, rate);
    assert.equal(
      rmsDifference(samples, renderSound(params, rate)),
      0,
      `${engine} is not deterministic`,
    );
    assert.ok(samples.length >= rate * 0.05 && samples.length <= rate * 6);
    assert.ok(samples.every(Number.isFinite), `${engine} has non-finite PCM`);
    assert.ok(
      peak(samples) > 0.001 && peak(samples) <= 0.981,
      `${engine} peak is unsafe or silent`,
    );
    assert.ok(samples[0] === 0, `${engine} attack endpoint`);
    assert.ok(samples.at(-1) === 0, `${engine} release endpoint`);
    for (const other of rendered) {
      assert.ok(
        rmsDifference(samples, other.samples) > 0.001,
        `${engine} duplicates ${other.engine}`,
      );
    }
    rendered.push({ engine, samples });
    for (const sampleRate of [8000, 48000]) {
      const atRate = renderSound(params, sampleRate);
      assert.ok(
        atRate.every(Number.isFinite),
        `${engine} failed at ${sampleRate} Hz`,
      );
      assert.ok(peak(atRate) > 0.001 && peak(atRate) <= 0.981);
    }
  }
});

test("each layer has independent tune, level, envelope, enable state, and routing-safe cloning", () => {
  const params = sound();
  for (const [field, value] of [
    ["tune", 12],
    ["level", 0.3],
  ]) {
    audibleChange(
      params,
      (_, voice) => {
        voice[field] = value;
      },
      `layer ${field}`,
    );
  }
  for (const [field, value] of [
    ["attack", 30],
    ["decay", 80],
    ["release", 200],
    ["curve", 1],
  ]) {
    audibleChange(
      params,
      (_, voice) => {
        voice.envelope[field] = value;
      },
      `envelope ${field}`,
    );
  }
  const muted = copy(params);
  muted.architecture.layers[0].enabled = false;
  assert.ok(
    renderSound(muted, rate).every((sample) => sample === 0),
    "disabled layers must be silent",
  );
  muted.architecture.layers[0].enabled = true;
  muted.architecture.layers[0].level = 0;
  assert.ok(
    renderSound(muted, rate).every((sample) => sample === 0),
    "zero layer level must be silent",
  );

  params.architecture.layers[0].granular.sample = importedSource();
  params.architecture.routes = [
    { id: "original", source: "lfo1", target: "a.pitch", amount: 0.2 },
  ];
  const cloned = cloneParams(params);
  cloned.architecture.layers[0].fm.ratios[1] = 13;
  cloned.architecture.layers[0].fm.decays[2] = 7;
  cloned.architecture.layers[0].granular.sample.data[0] = 0.99;
  cloned.architecture.layers[0].envelope.decay = 20;
  cloned.architecture.routes[0].amount = 0.9;
  cloned.architecture.lfos[0].rate = 31;
  assert.equal(params.architecture.layers[0].fm.ratios[1], 2);
  assert.equal(params.architecture.layers[0].fm.decays[2], 170);
  assert.notEqual(params.architecture.layers[0].granular.sample.data[0], 0.99);
  assert.equal(params.architecture.layers[0].envelope.decay, 320);
  assert.equal(params.architecture.routes[0].amount, 0.2);
  assert.equal(params.architecture.lfos[0].rate, 9);
});

test("subtractive oscillator pair, resonant filter modes, and filter envelope affect the audio", () => {
  const params = sound("subtractive");
  params.architecture.layers[0].subtractive.cutoff = 900;
  const changes = [
    ["waveform", "sawtooth"],
    ["waveform2", "square"],
    ["blend", 0.8],
    ["detune", 47],
    ["cutoff", 2100],
    ["resonance", 0.85],
    ["filterType", "highpass"],
    ["filterType", "bandpass"],
    ["filterEnvelope", 0.8],
  ];
  for (const [field, value] of changes) {
    audibleChange(
      params,
      (_, voice) => {
        voice.subtractive[field] = value;
      },
      `subtractive ${field} ${value}`,
    );
  }
});

test("FM has four audible operators, individual ratio/level/decay, index envelope, feedback, and distinct algorithms", () => {
  const params = sound("fm");
  for (let operator = 0; operator < 4; operator++) {
    audibleChange(
      params,
      (_, voice) => {
        voice.fm.ratios[operator] += 1.35;
      },
      `FM operator ${operator + 1} ratio`,
    );
    audibleChange(
      params,
      (_, voice) => {
        voice.fm.levels[operator] = 0.05;
      },
      `FM operator ${operator + 1} level`,
    );
    audibleChange(
      params,
      (_, voice) => {
        voice.fm.decays[operator] = 30;
      },
      `FM operator ${operator + 1} decay`,
    );
  }
  audibleChange(
    params,
    (_, voice) => {
      voice.fm.index = 0.1;
    },
    "FM index",
  );
  audibleChange(
    params,
    (_, voice) => {
      voice.fm.indexDecay = 25;
    },
    "FM index envelope",
  );
  const algorithms = [];
  for (const algorithm of ["cascade", "parallel", "feedback", "stack"]) {
    const patch = copy(params);
    patch.architecture.layers[0].fm.algorithm = algorithm;
    const samples = renderSound(patch, rate);
    for (const other of algorithms) {
      assert.ok(
        rmsDifference(samples, other.samples) > 0.001,
        `${algorithm} duplicates ${other.algorithm}`,
      );
    }
    algorithms.push({ algorithm, samples });
  }
  params.architecture.layers[0].fm.algorithm = "feedback";
  audibleChange(
    params,
    (_, voice) => {
      voice.fm.feedback = 0.85;
    },
    "FM feedback",
  );
});

test("wavetable banks, interpolated position, scan speed/depth, and phase warp change the audio", () => {
  const params = sound("wavetable");
  for (const table of ["fold", "vowel", "metal"]) {
    audibleChange(
      params,
      (_, voice) => {
        voice.wavetable.table = table;
      },
      `wavetable bank ${table}`,
    );
  }
  for (const [field, value] of [
    ["position", 0.8],
    ["scan", 0],
    ["scanRate", 15],
    ["warp", 0.8],
  ]) {
    audibleChange(
      params,
      (_, voice) => {
        voice.wavetable[field] = value;
      },
      `wavetable ${field}`,
    );
  }
});

test("granular playback uses imported PCM and exposes source position, size, density, pitch, reversal, and seeded variation", () => {
  const params = sound("granular");
  const grain = params.architecture.layers[0].granular;
  grain.source = "sample";
  grain.sample = importedSource();
  const samples = renderSound(params, rate);
  assert.ok(peak(samples) > 0.001, "imported PCM rendered silence");
  const silence = copy(params);
  silence.architecture.layers[0].granular.sample.data.fill(0);
  assert.ok(
    renderSound(silence, rate).every((sample) => sample === 0),
    "silent imported PCM must remain silent",
  );
  for (const [field, value] of [
    ["position", 0.75],
    ["size", 110],
    ["density", 25],
    ["pitch", 12],
    ["reverse", true],
    ["spray", 0.8],
    ["jitter", 0.8],
  ]) {
    audibleChange(
      params,
      (_, voice) => {
        voice.granular[field] = value;
      },
      `granular ${field}`,
    );
  }
  audibleChange(
    params,
    (patch) => {
      patch.seed += 53;
    },
    "granular random seed",
  );
  const internal = sound("granular");
  for (const texture of ["wood", "noise", "vocal"]) {
    audibleChange(
      internal,
      (_, voice) => {
        voice.granular.texture = texture;
      },
      `granular texture ${texture}`,
    );
  }
});

test("FM, ring modulation, and AM couple actual layer signals, support reversing direction, and vanish with a disabled source", () => {
  const params = sound("subtractive");
  const secondary = params.architecture.layers[1];
  secondary.enabled = true;
  secondary.tune = 7;
  secondary.level = 0.45;
  secondary.subtractive.waveform = "triangle";
  const interactionRenders = [];
  for (const type of ["fm", "ring", "am"]) {
    const patch = copy(params);
    patch.architecture.interaction.type = type;
    audibleChange(
      params,
      (changed) => {
        changed.architecture.interaction.type = type;
      },
      `${type} layer interaction`,
    );
    audibleChange(
      patch,
      (changed) => {
        changed.architecture.interaction.amount = 0.1;
      },
      `${type} interaction amount`,
    );
    audibleChange(
      patch,
      (changed) => {
        changed.architecture.interaction.source = 0;
        changed.architecture.interaction.target = 1;
      },
      `${type} interaction direction`,
    );
    const samples = renderSound(patch, rate);
    for (const other of interactionRenders) {
      assert.ok(
        rmsDifference(samples, other.samples) > 0.0001,
        `${type} duplicates ${other.type}`,
      );
    }
    interactionRenders.push({ type, samples });
    patch.architecture.layers[1].enabled = false;
    const uncoupled = copy(patch);
    uncoupled.architecture.interaction.type = "none";
    assert.equal(
      rmsDifference(renderSound(patch, rate), renderSound(uncoupled, rate)),
      0,
      `${type} should bypass a disabled source`,
    );
  }
});

test("cross-engine interaction couples granular, percussion, wavetable, and FM layers, including the third layer", () => {
  for (const [sourceEngine, targetEngine] of [
    ["fm", "wavetable"],
    ["granular", "percussion"],
    ["wavetable", "fm"],
    ["fm", "granular"],
  ]) {
    const params = sound(targetEngine);
    params.architecture.layers[2] = layer(sourceEngine, "c");
    params.architecture.layers[2].enabled = true;
    params.architecture.layers[2].level = 0.4;
    params.architecture.layers[2].tune = 5;
    params.architecture.interaction = {
      source: 2,
      target: 0,
      type: "none",
      amount: 0.75,
    };
    for (const type of ["fm", "ring", "am"]) {
      audibleChange(
        params,
        (patch) => {
          patch.architecture.interaction.type = type;
        },
        `${sourceEngine} C -> ${targetEngine} A via ${type}`,
      );
    }
    audibleChange(
      params,
      (patch) => {
        patch.architecture.routes = [
          { id: "third-layer", source: "lfo2", target: "c.pitch", amount: 0.7 },
        ];
      },
      `${sourceEngine} third-layer route`,
    );
  }
});

test("layered synthesis passes through the shared drive, bit depth, sample reduction, delay, reverb, and master level", () => {
  const params = sound("fm");
  params.architecture.layers[1] = layer("wavetable", "b");
  params.architecture.layers[1].enabled = true;
  params.architecture.layers[1].level = 0.25;
  for (const [field, value] of [
    ["drive", 0.7],
    ["bitDepth", 5],
    ["sampleRate", 5000],
    ["delay", 0.5],
    ["reverb", 0.5],
  ]) {
    audibleChange(
      params,
      (patch) => {
        patch.effects[field] = value;
      },
      `layered shared ${field}`,
    );
  }
  const muted = copy(params);
  muted.mix.volume = 0;
  assert.ok(
    renderSound(muted, rate).every((sample) => sample === 0),
    "master mute must silence every layer",
  );
});

test("the modulation matrix drives every destination and its LFO shapes/rate/depth, envelope, and random sources affect PCM", () => {
  const destinations = [
    ["subtractive", "a.pitch"],
    ["subtractive", "a.cutoff"],
    ["fm", "a.fmIndex"],
    ["wavetable", "a.wtPosition"],
    ["granular", "a.grainPosition"],
    ["granular", "a.grainDensity"],
    ["subtractive", "a.level"],
    ["subtractive", "master.drive"],
  ];
  for (const [engine, target] of destinations) {
    const params = sound(engine);
    if (target === "a.cutoff")
      params.architecture.layers[0].subtractive.cutoff = 700;
    if (target === "a.grainPosition") {
      params.architecture.layers[0].granular.source = "sample";
      params.architecture.layers[0].granular.sample = importedSource();
    }
    audibleChange(
      params,
      (patch) => {
        patch.architecture.routes = [
          { id: "destination-test", source: "lfo1", target, amount: 0.75 },
        ];
      },
      `route to ${target}`,
    );
  }
  const params = sound();
  params.tone.pitchAmount = 12;
  for (const source of ["lfo1", "lfo2", "pitchEnv", "ampEnv", "random"]) {
    audibleChange(
      params,
      (patch) => {
        patch.architecture.routes = [
          { id: "source-test", source, target: "a.pitch", amount: 0.6 },
        ];
      },
      `route from ${source}`,
    );
  }
  params.architecture.routes = [
    { id: "lfo-test", source: "lfo1", target: "a.pitch", amount: 0.6 },
  ];
  for (const shape of ["triangle", "square", "sample-hold"]) {
    audibleChange(
      params,
      (patch) => {
        patch.architecture.lfos[0].shape = shape;
      },
      `LFO ${shape}`,
    );
  }
  for (const [field, value] of [
    ["rate", 22],
    ["depth", 0.1],
    ["phase", 0.4],
  ]) {
    audibleChange(
      params,
      (patch) => {
        patch.architecture.lfos[0][field] = value;
      },
      `LFO ${field}`,
    );
  }
});

test("random per-hit modulation varies successive exported hits while repeat exports remain reproducible", () => {
  const params = sound("subtractive");
  params.tone.decay = 80;
  params.tone.release = 10;
  params.architecture.layers[0].envelope.decay = 80;
  params.architecture.layers[0].envelope.release = 10;
  const steps = Array(16).fill(false);
  steps[0] = steps[4] = true;
  const options = { sampleRate: 8000, tail: false };
  const onset = 4000;
  const hitLength = renderSound(params, 8000).length;
  const plain = renderPattern([{ params, steps }], 120, options)[0];
  assert.equal(
    rmsDifference(
      plain.slice(0, hitLength),
      plain.slice(onset, onset + hitLength),
    ),
    0,
    "unmodulated repeated hits should match",
  );
  params.architecture.routes = [
    { id: "random-pitch", source: "random", target: "a.pitch", amount: 0.6 },
  ];
  const varied = renderPattern([{ params, steps }], 120, options);
  assert.ok(
    rmsDifference(
      varied[0].slice(0, hitLength),
      varied[0].slice(onset, onset + hitLength),
    ) > 0.001,
    "random modulation must change each hit",
  );
  const repeat = renderPattern([{ params, steps }], 120, options);
  assert.equal(
    rmsDifference(varied[0], repeat[0]),
    0,
    "left export must be reproducible",
  );
  assert.equal(
    rmsDifference(varied[1], repeat[1]),
    0,
    "right export must be reproducible",
  );
});

test("layer audition exposes muted engine edits without other layers masking them or changing the saved mix", () => {
  const params = sound("subtractive");
  const voice = params.architecture.layers[2];
  voice.engine = "granular";
  voice.enabled = false;
  voice.level = 0;
  voice.granular.source = "sample";
  voice.granular.sample = importedSource();
  params.noise.level = 0.9;
  const original = copy(params);

  const before = renderSound(audio.createLayerPreview(params, "c"), rate);
  assert.ok(
    peak(before) > 0.01,
    "a muted, zero-level layer must be audible in its separate audition",
  );
  const otherLayersChanged = copy(params);
  otherLayersChanged.architecture.layers[0].subtractive.waveform = "square";
  otherLayersChanged.architecture.layers[0].subtractive.cutoff = 80;
  otherLayersChanged.noise.color = "brown";
  otherLayersChanged.noise.level = 0.1;
  assert.equal(
    rmsDifference(
      before,
      renderSound(audio.createLayerPreview(otherLayersChanged, "c"), rate),
    ),
    0,
    "other layers and the shared noise bed must not mask the audition",
  );

  const edited = copy(params);
  edited.architecture.layers[2].granular.position = 0.85;
  const after = renderSound(audio.createLayerPreview(edited, "c"), rate);
  assert.ok(
    rmsDifference(before, after) > 0.001,
    "engine edits must change the isolated audio",
  );
  assert.deepEqual(
    params,
    original,
    "audition must preserve saved enable states, levels, routing, and source data",
  );
});

test("malformed imported architectures sanitize without mutating source and cannot produce unsafe PCM", () => {
  const params = sound("granular");
  const voice = params.architecture.layers[0];
  voice.level = Infinity;
  voice.tune = NaN;
  voice.envelope = { attack: -100, decay: Infinity, release: NaN, curve: -100 };
  voice.subtractive.cutoff = Infinity;
  voice.subtractive.resonance = 1e9;
  voice.fm.ratios = [NaN, -9, Infinity, 1e9];
  voice.fm.decays = [NaN, -9, Infinity, 1e9];
  voice.granular.source = "sample";
  voice.granular.size = -1;
  voice.granular.density = Infinity;
  voice.granular.sample = {
    name: "malformed",
    sampleRate: NaN,
    data: [NaN, Infinity, -Infinity, 200, -200, 0.3],
  };
  params.architecture.lfos[0] = {
    shape: "invalid",
    rate: NaN,
    depth: Infinity,
    phase: -100,
  };
  params.architecture.routes.push({
    id: "bad",
    source: "invalid",
    target: "invalid",
    amount: Infinity,
  });
  const original = copy(params);
  const sanitized = sanitizeParams(params);
  assert.deepEqual(
    params,
    original,
    "sanitizeParams must not mutate imported project data",
  );
  for (const sampleRate of [8000, 44100]) {
    const samples = renderSound(sanitized, sampleRate);
    assert.ok(
      samples.length >= sampleRate * 0.05 && samples.length <= sampleRate * 6,
    );
    assert.ok(samples.every(Number.isFinite));
    assert.ok(peak(samples) <= 0.981);
  }
});
