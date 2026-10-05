import type {
  LayerEnvelope,
  LayerId,
  LFOParams,
  ModDestination,
  ModRoute,
  SoundParams,
  SynthArchitecture,
  SynthEngine,
  SynthLayer,
  VoiceType,
  WavetableType,
} from "./types";

const TAU = Math.PI * 2;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const number = (n: unknown, fallback: number, lo: number, hi: number) =>
  clamp(typeof n === "number" && Number.isFinite(n) ? n : fallback, lo, hi);
const member = <T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T => (choices.includes(value as T) ? (value as T) : fallback);
const layerIds: LayerId[] = ["a", "b", "c"];
const engines: SynthEngine[] = [
  "percussion",
  "subtractive",
  "fm",
  "wavetable",
  "granular",
];
const waves = ["sine", "triangle", "square", "sawtooth"] as const;
const targets: ModDestination[] = [
  "pitch",
  "cutoff",
  "fmIndex",
  "wtPosition",
  "grainPosition",
  "grainDensity",
  "level",
];

export const ENGINE_LABELS: Record<SynthEngine, string> = {
  percussion: "Analog percussion",
  subtractive: "Subtractive",
  fm: "4-op FM",
  wavetable: "Wavetable",
  granular: "Granular",
};

/** Every engine's parameters remain in a layer when its engine is changed. */
export function createLayer(
  engine: SynthEngine = "subtractive",
  id: LayerId = "a",
): SynthLayer {
  return {
    id,
    enabled: true,
    engine,
    level: 0.65,
    tune: 0,
    envelope: { attack: 0.4, decay: 220, release: 35, curve: 1 },
    subtractive: {
      waveform: "sine",
      waveform2: "triangle",
      detune: 7,
      blend: 0.22,
      cutoff: 4800,
      resonance: 0.18,
      filterType: "lowpass",
      filterEnvelope: 0.3,
    },
    fm: {
      algorithm: "cascade",
      ratios: [1, 2, 3.5, 5],
      levels: [1, 0.75, 0.45, 0.25],
      decays: [600, 180, 90, 40],
      feedback: 0.08,
      index: 5,
      indexDecay: 110,
    },
    wavetable: {
      table: "basic",
      position: 0.18,
      scan: 0.25,
      scanRate: 4,
      warp: 0,
    },
    granular: {
      source: "internal",
      texture: "metal",
      position: 0.3,
      size: 26,
      density: 75,
      spray: 0.2,
      jitter: 0.2,
      pitch: 0,
      reverse: false,
    },
  };
}

export function createDefaultArchitecture(
  type: VoiceType = "perc",
  tone?: Partial<SoundParams["tone"]>,
): SynthArchitecture {
  const a = createLayer("percussion", "a");
  a.level = 1;
  a.envelope = {
    attack: tone?.attack ?? 0.4,
    decay: tone?.decay ?? 220,
    release: tone?.release ?? 35,
    curve: 1,
  };
  const b = createLayer("fm", "b");
  b.enabled = false;
  b.level = 0.25;
  b.tune = type === "kick" || type === "tom" ? 12 : 0;
  b.envelope.decay = Math.min(90, a.envelope.decay);
  const c = createLayer("granular", "c");
  c.enabled = false;
  c.level = 0.25;
  c.granular.texture =
    type === "kick" || type === "tom" || type === "rim" ? "wood" : "metal";
  c.envelope.decay = Math.min(150, a.envelope.decay);
  return {
    layers: [a, b, c],
    routes: [],
    lfos: [
      { shape: "sine", rate: 6, depth: 1, phase: 0 },
      { shape: "sample-hold", rate: 12, depth: 1, phase: 0.25 },
    ],
    interaction: { source: 1, target: 0, type: "none", amount: 0.15 },
  };
}

export function cloneArchitecture(
  architecture: SynthArchitecture,
): SynthArchitecture {
  return {
    layers: architecture.layers.map((layer) => ({
      ...layer,
      envelope: { ...layer.envelope },
      subtractive: { ...layer.subtractive },
      fm: {
        ...layer.fm,
        ratios: [...layer.fm.ratios],
        levels: [...layer.fm.levels],
        decays: [...layer.fm.decays],
      },
      wavetable: { ...layer.wavetable },
      granular: {
        ...layer.granular,
        ...(layer.granular.sample
          ? {
              sample: {
                ...layer.granular.sample,
                data: [...layer.granular.sample.data],
              },
            }
          : {}),
      },
    })),
    routes: architecture.routes.map((route) => ({ ...route })),
    lfos: [{ ...architecture.lfos[0] }, { ...architecture.lfos[1] }],
    interaction: { ...architecture.interaction },
  };
}

function sanitizeEnvelope(
  input: Partial<LayerEnvelope> | undefined,
  fallback: LayerEnvelope,
): LayerEnvelope {
  return {
    attack: number(input?.attack, fallback.attack, 0, 1000),
    decay: number(input?.decay, fallback.decay, 5, 3000),
    release: number(input?.release, fallback.release, 0, 1500),
    curve: number(input?.curve, fallback.curve, 0.25, 4),
  };
}

export function sanitizeArchitecture(
  input: SynthArchitecture | undefined,
  p: Pick<SoundParams, "type" | "tone">,
): SynthArchitecture {
  const defaults = createDefaultArchitecture(p.type, p.tone);
  if (!input || typeof input !== "object") return defaults;
  const result: SynthArchitecture = {
    layers: layerIds.map((id, index) => {
      const raw = Array.isArray(input.layers) ? input.layers[index] : undefined;
      const fallback = defaults.layers[index];
      if (!raw || typeof raw !== "object") return fallback;
      const s = raw.subtractive;
      const f = raw.fm;
      const w = raw.wavetable;
      const g = raw.granular;
      const layer: SynthLayer = {
        id,
        enabled:
          typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
        engine: member(raw.engine, engines, fallback.engine),
        level: number(raw.level, fallback.level, 0, 1),
        tune: number(raw.tune, 0, -48, 48),
        envelope: sanitizeEnvelope(raw.envelope, fallback.envelope),
        subtractive: {
          waveform: member(s?.waveform, waves, fallback.subtractive.waveform),
          waveform2: member(
            s?.waveform2,
            waves,
            fallback.subtractive.waveform2,
          ),
          detune: number(s?.detune, 7, -100, 100),
          blend: number(s?.blend, 0.22, 0, 1),
          cutoff: number(s?.cutoff, 4800, 20, 20000),
          resonance: number(s?.resonance, 0.18, 0, 0.98),
          filterType: member(
            s?.filterType,
            ["lowpass", "highpass", "bandpass"],
            "lowpass",
          ),
          filterEnvelope: number(s?.filterEnvelope, 0.3, -1, 1),
        },
        fm: {
          algorithm: member(
            f?.algorithm,
            ["cascade", "parallel", "feedback", "stack"],
            "cascade",
          ),
          ratios: [0, 1, 2, 3].map((i) =>
            number(f?.ratios?.[i], fallback.fm.ratios[i], 0.125, 16),
          ) as SynthLayer["fm"]["ratios"],
          levels: [0, 1, 2, 3].map((i) =>
            number(f?.levels?.[i], fallback.fm.levels[i], 0, 1),
          ) as SynthLayer["fm"]["levels"],
          decays: [0, 1, 2, 3].map((i) =>
            number(f?.decays?.[i], fallback.fm.decays[i], 1, 3000),
          ) as SynthLayer["fm"]["decays"],
          feedback: number(f?.feedback, 0.08, 0, 1),
          index: number(f?.index, 5, 0, 24),
          indexDecay: number(f?.indexDecay, 110, 5, 3000),
        },
        wavetable: {
          table: member(w?.table, ["basic", "fold", "vowel", "metal"], "basic"),
          position: number(w?.position, 0.18, 0, 1),
          scan: number(w?.scan, 0.25, -1, 1),
          scanRate: number(w?.scanRate, 4, 0, 20),
          warp: number(w?.warp, 0, -1, 1),
        },
        granular: {
          source: member(g?.source, ["internal", "sample"], "internal"),
          texture: member(
            g?.texture,
            ["metal", "wood", "noise", "vocal"],
            "metal",
          ),
          position: number(g?.position, 0.3, 0, 1),
          size: number(g?.size, 26, 5, 250),
          density: number(g?.density, 75, 1, 180),
          spray: number(g?.spray, 0.2, 0, 1),
          jitter: number(g?.jitter, 0.2, 0, 1),
          pitch: number(g?.pitch, 0, -24, 24),
          reverse: typeof g?.reverse === "boolean" ? g.reverse : false,
        },
      };
      const sample = g?.sample;
      if (
        sample &&
        typeof sample === "object" &&
        Array.isArray(sample.data) &&
        sample.data.length > 0
      ) {
        const sampleRate = Math.round(
          number(sample.sampleRate, 44100, 8000, 192000),
        );
        // Keep imported projects bounded to two seconds of decoded mono audio.
        layer.granular.sample = {
          name:
            typeof sample.name === "string"
              ? sample.name.slice(0, 120)
              : "Imported texture",
          sampleRate,
          data: sample.data
            .slice(0, sampleRate * 2)
            .map((value) => number(value, 0, -1, 1)),
        };
      } else if (layer.granular.source === "sample") {
        layer.granular.source = "internal";
      }
      return layer;
    }),
    routes: [],
    lfos: defaults.lfos,
    interaction: {
      source: Math.round(number(input.interaction?.source, 1, 0, 2)) as
        0 | 1 | 2,
      target: Math.round(number(input.interaction?.target, 0, 0, 2)) as
        0 | 1 | 2,
      type: member(
        input.interaction?.type,
        ["none", "fm", "ring", "am"],
        "none",
      ),
      amount: number(input.interaction?.amount, 0.15, 0, 1),
    },
  };
  result.lfos = [0, 1].map((index) => {
    const lfo = input.lfos?.[index];
    return {
      shape: member(
        lfo?.shape,
        ["sine", "triangle", "square", "sample-hold"],
        defaults.lfos[index].shape,
      ),
      rate: number(lfo?.rate, defaults.lfos[index].rate, 0.05, 40),
      depth: number(lfo?.depth, 1, 0, 1),
      phase: number(lfo?.phase, 0, 0, 1),
    };
  }) as SynthArchitecture["lfos"];
  if (Array.isArray(input.routes))
    result.routes = input.routes.slice(0, 8).flatMap((route, index) => {
      if (!route || typeof route !== "object") return [];
      const target = route.target;
      const validTarget =
        target === "master.drive" ||
        layerIds.some((id) =>
          targets.some((name) => target === `${id}.${name}`),
        );
      if (!validTarget) return [];
      return [
        {
          id:
            typeof route.id === "string"
              ? route.id.slice(0, 60)
              : `route-${index}`,
          source: member(
            route.source,
            ["lfo1", "lfo2", "pitchEnv", "ampEnv", "random"],
            "lfo1",
          ),
          target: target as ModRoute["target"],
          amount: number(route.amount, 0, -1, 1),
        },
      ];
    });
  return result;
}

/** Migration is explicit: legacy renderSound patches remain byte-compatible. */
export function ensureArchitecture(p: SoundParams): SynthArchitecture {
  return sanitizeArchitecture(p.architecture, p);
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let z = Math.imul(state ^ (state >>> 15), 1 | state);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(t: number, e: LayerEnvelope): number {
  const attack = e.attack / 1000,
    decay = e.decay / 1000,
    release = e.release / 1000;
  if (t < 0 || t >= attack + decay + release) return 0;
  if (attack > 0 && t < attack) return t / attack;
  const elapsed = t - attack;
  const amplitude = Math.exp(
    -5 * (Math.min(elapsed, decay) / decay) ** e.curve,
  );
  return elapsed <= decay
    ? amplitude
    : amplitude * (1 - (elapsed - decay) / Math.max(1e-6, release));
}

function lfoValue(lfo: LFOParams, t: number, seed: number): number {
  const cycles = t * lfo.rate + lfo.phase;
  const phase = cycles - Math.floor(cycles);
  let value = 0;
  if (lfo.shape === "triangle") value = 1 - 4 * Math.abs(phase - 0.5);
  else if (lfo.shape === "square") value = phase < 0.5 ? 1 : -1;
  else if (lfo.shape === "sample-hold") {
    let n = Math.imul((Math.floor(cycles) + seed) | 0, 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    value = ((n ^ (n >>> 16)) >>> 0) / 2147483648 - 1;
  } else value = Math.sin(TAU * cycles);
  return value * lfo.depth;
}

// PolyBLEP removes the hard edges of dual oscillators at high percussion pitches.
function polyBlep(phase: number, increment: number): number {
  if (increment <= 0) return 0;
  if (phase < increment) {
    const x = phase / increment;
    return x + x - x * x - 1;
  }
  if (phase > 1 - increment) {
    const x = (phase - 1) / increment;
    return x * x + x + x + 1;
  }
  return 0;
}

function oscillator(
  phase: number,
  wave: SynthLayer["subtractive"]["waveform"],
  increment: number,
): number {
  const p = phase - Math.floor(phase);
  if (wave === "sawtooth") return 2 * p - 1 - polyBlep(p, increment);
  if (wave === "square")
    return (
      (p < 0.5 ? 1 : -1) +
      polyBlep(p, increment) -
      polyBlep((p + 0.5) % 1, increment)
    );
  if (wave === "triangle") return 1 - 4 * Math.abs(p - 0.5);
  return Math.sin(p * TAU);
}

const TABLE_LENGTH = 2048;
const FRAME_COUNT = 8;
const harmonicLimits = [1, 2, 4, 8, 16, 32, 64];
const tableCache = new Map<WavetableType, Float32Array[][]>();

function harmonicAmplitude(
  table: WavetableType,
  frame: number,
  harmonic: number,
): number {
  const morph = frame / (FRAME_COUNT - 1);
  if (table === "basic") {
    const sine = harmonic === 1 ? 1 : 0;
    const triangle =
      harmonic % 2 ? (harmonic % 4 === 1 ? 1 : -1) / harmonic ** 2 : 0;
    const saw = (harmonic % 2 ? 1 : -1) / harmonic;
    const square = harmonic % 2 ? 1 / harmonic : 0;
    if (morph < 1 / 3) return sine * (1 - morph * 3) + triangle * morph * 3;
    if (morph < 2 / 3)
      return triangle * (2 - morph * 3) + saw * (morph * 3 - 1);
    return saw * (3 - morph * 3) + square * (morph * 3 - 2);
  }
  if (table === "fold")
    return (
      (Math.cos(harmonic * (0.12 + morph * 1.8)) *
        Math.exp(-harmonic / (2 + morph * 22))) /
      Math.sqrt(harmonic)
    );
  if (table === "vowel") {
    const first = 2.4 + morph * 5.4,
      second = 9.5 - morph * 3.8;
    return (
      (0.25 * Math.exp(-harmonic / 7) +
        Math.exp(-(((harmonic - first) / 1.25) ** 2)) +
        0.65 * Math.exp(-(((harmonic - second) / 1.8) ** 2))) /
      Math.sqrt(harmonic)
    );
  }
  return (
    ((Math.sin(harmonic * (2.17 + morph * 4.3)) * 0.65 + 0.35) *
      Math.exp(-harmonic / (8 + morph * 42))) /
    Math.sqrt(harmonic)
  );
}

function getWavetable(table: WavetableType): Float32Array[][] {
  let bank = tableCache.get(table);
  if (bank) return bank;
  bank = harmonicLimits.map((limit) =>
    Array.from({ length: FRAME_COUNT }, (_, frame) => {
      const data = new Float32Array(TABLE_LENGTH);
      let peak = 0;
      for (let harmonic = 1; harmonic <= limit; harmonic++) {
        const amplitude = harmonicAmplitude(table, frame, harmonic);
        for (let i = 0; i < TABLE_LENGTH; i++)
          data[i] += Math.sin((TAU * harmonic * i) / TABLE_LENGTH) * amplitude;
      }
      for (const sample of data) peak = Math.max(peak, Math.abs(sample));
      if (peak > 0) for (let i = 0; i < TABLE_LENGTH; i++) data[i] /= peak;
      return data;
    }),
  );
  tableCache.set(table, bank);
  return bank;
}

/** The same interpolated, band-limited frames drive the oscillator and its UI preview. */
export function sampleWavetable(
  table: WavetableType,
  phase: number,
  position: number,
  warp = 0,
  frequency = 220,
  sampleRate = 44100,
): number {
  const bank = getWavetable(
    member(table, ["basic", "fold", "vowel", "metal"], "basic"),
  );
  return sampleBank(bank, phase, position, warp, frequency, sampleRate);
}

function sampleBank(
  bank: Float32Array[][],
  phase: number,
  position: number,
  warp: number,
  frequency: number,
  sampleRate: number,
): number {
  const allowed = Math.max(
    1,
    (sampleRate * 0.45) / Math.max(1, Math.abs(frequency)),
  );
  const band = clamp(
    Math.floor(Math.log2(allowed)),
    0,
    harmonicLimits.length - 1,
  );
  let cycle = phase - Math.floor(phase);
  const bend = clamp(warp, -1, 1);
  cycle = (cycle + Math.sin(cycle * TAU) * bend * 0.14 + 1) % 1;
  const sample = cycle * TABLE_LENGTH,
    sampleIndex = Math.floor(sample),
    fraction = sample - sampleIndex;
  const frame = clamp(position, 0, 1) * (FRAME_COUNT - 1),
    first = Math.floor(frame),
    blend = frame - first;
  const nextIndex = (sampleIndex + 1) % TABLE_LENGTH;
  const leftFrame = bank[band][first],
    rightFrame = bank[band][Math.min(first + 1, FRAME_COUNT - 1)];
  const left =
    leftFrame[sampleIndex] +
    (leftFrame[nextIndex] - leftFrame[sampleIndex]) * fraction;
  const right =
    rightFrame[sampleIndex] +
    (rightFrame[nextIndex] - rightFrame[sampleIndex]) * fraction;
  return left + (right - left) * blend;
}

const textureCache = new Map<SynthLayer["granular"]["texture"], Float32Array>();
const TEXTURE_RATE = 22050;

/** A real short source buffer for each internal grain texture, built once and reused. */
function getTexture(texture: SynthLayer["granular"]["texture"]): Float32Array {
  let data = textureCache.get(texture);
  if (data) return data;
  data = new Float32Array(TEXTURE_RATE);
  const seed = { metal: 3917, wood: 8063, noise: 2213, vocal: 9011 }[texture];
  const random = randomGenerator(seed);
  let low = 0,
    previous = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / TEXTURE_RATE,
      noise = random() * 2 - 1;
    low += 0.08 * (noise - low);
    const pulse = Math.exp(-(t % 0.09) * 72);
    let sample = noise;
    if (texture === "metal")
      sample =
        (Math.sin(TAU * t * 613) +
          Math.sin(TAU * t * 997) * 0.7 +
          Math.sin(TAU * t * 1733) * 0.45 +
          Math.sin(TAU * t * 2911) * 0.3 +
          noise * 0.22) *
        (0.26 + pulse * 0.32);
    else if (texture === "wood")
      sample =
        (low * 1.6 +
          Math.sin(TAU * t * 347) * 0.55 +
          Math.sin(TAU * t * 791) * 0.3) *
        pulse;
    else if (texture === "vocal")
      sample =
        (Math.sin(TAU * t * 220) * 0.3 +
          Math.sin(TAU * t * 660) * 0.42 +
          Math.sin(TAU * t * 1100) * 0.2 +
          Math.sin(TAU * t * 1540) * 0.12) *
          (0.65 + Math.sin(TAU * t * 3.4) * 0.35) +
        noise * 0.05;
    else {
      sample = noise - previous * 0.65;
      previous = noise;
    }
    data[i] = sample;
  }
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
  textureCache.set(texture, data);
  return data;
}

interface Grain {
  age: number;
  length: number;
  position: number;
}
interface LayerState {
  phases: number[];
  previousOperator: number;
  filter1: number;
  filter2: number;
  grains: Grain[];
  nextGrain: number;
  source?: Float32Array | number[];
  sourceRate: number;
  random: () => number;
  percussion?: Float32Array;
  table?: Float32Array[][];
  grainWindow?: Float32Array;
}
interface ModValues {
  pitch: number;
  cutoff: number;
  fmIndex: number;
  wtPosition: number;
  grainPosition: number;
  grainDensity: number;
  level: number;
}

export function modularDuration(p: SoundParams): number {
  const layers = p.architecture?.layers ?? [];
  const active = layers.filter((layer) => layer.enabled && layer.level > 0);
  const noiseDuration =
    p.noise.level > 0 && active.length > 0
      ? (p.noise.decay + Math.min(15, p.tone.attack) + 3) / 1000
      : 0;
  return Math.max(
    0.05,
    noiseDuration,
    ...active.map((layer) => {
      const env =
        (layer.envelope.attack +
          layer.envelope.decay +
          layer.envelope.release) /
        1000;
      return layer.engine === "percussion"
        ? Math.max(env, p.noise.decay / 1000 + (p.type === "clap" ? 0.05 : 0))
        : env;
    }),
  );
}

function fmSample(
  layer: SynthLayer,
  state: LayerState,
  frequency: number,
  sampleRate: number,
  t: number,
  modulation: number,
): number {
  const f = layer.fm;
  for (let i = 0; i < 4; i++)
    state.phases[i] +=
      clamp(frequency * f.ratios[i], -sampleRate * 0.45, sampleRate * 0.45) /
      sampleRate;
  const index =
    clamp(f.index + modulation * 16, 0, 40) *
    Math.exp((-5 * t) / (f.indexDecay / 1000));
  const op = (i: number, input = 0) =>
    Math.sin(TAU * state.phases[i] + input) *
    f.levels[i] *
    Math.exp((-5 * t) / (f.decays[i] / 1000));
  const feedback = state.previousOperator * f.feedback * 7;
  let sample = 0;
  switch (f.algorithm) {
    case "parallel": {
      const fourth = op(3, feedback);
      sample = op(0, (op(1) + op(2) + fourth) * index);
      state.previousOperator = fourth;
      break;
    }
    case "stack": {
      const fourth = op(3, feedback);
      sample = (op(0, op(1) * index) + op(2, fourth * index)) * 0.65;
      state.previousOperator = fourth;
      break;
    }
    case "feedback": {
      const fourth = op(3, feedback);
      const third = op(2, fourth * index);
      const second = op(1, third * index);
      sample = op(0, second * index + state.previousOperator * f.feedback * 5);
      state.previousOperator = sample;
      break;
    }
    default: {
      const fourth = op(3, feedback);
      sample = op(0, op(1, op(2, fourth * index) * index) * index);
      state.previousOperator = fourth;
    }
  }
  return sample;
}

function subtractiveSample(
  layer: SynthLayer,
  state: LayerState,
  frequency: number,
  rate: number,
  t: number,
  mod: ModValues,
): number {
  const s = layer.subtractive;
  const increment = clamp(frequency / rate, -0.45, 0.45);
  const secondIncrement = clamp(
    increment * 2 ** (s.detune / 1200),
    -0.45,
    0.45,
  );
  state.phases[0] += increment;
  state.phases[1] += secondIncrement;
  const source =
    oscillator(state.phases[0], s.waveform, Math.abs(increment)) *
      (1 - s.blend) +
    oscillator(state.phases[1], s.waveform2, Math.abs(secondIncrement)) *
      s.blend;
  const filterEnv = Math.exp(
    (-5 * t) / Math.max(0.005, layer.envelope.decay / 1000),
  );
  const cutoff = clamp(
    s.cutoff * 2 ** (s.filterEnvelope * filterEnv * 6 + mod.cutoff * 6),
    20,
    rate * 0.43,
  );
  // Topology-preserving state-variable filter; stable at high resonance/cutoff.
  const g = Math.tan((Math.PI * cutoff) / rate),
    k = 2 - s.resonance * 1.92;
  const a = 1 / (1 + g * (g + k));
  const v3 = source - state.filter2;
  const band = a * state.filter1 + g * a * v3;
  const low = state.filter2 + g * a * state.filter1 + g * g * a * v3;
  state.filter1 = 2 * band - state.filter1;
  state.filter2 = 2 * low - state.filter2;
  const high = source - k * band - low;
  const sample =
    s.filterType === "highpass"
      ? high
      : s.filterType === "bandpass"
        ? band
        : low;
  return Math.tanh(sample * (1 - s.resonance * 0.45));
}

function granularSample(
  layer: SynthLayer,
  state: LayerState,
  frequency: number,
  rate: number,
  index: number,
  mod: ModValues,
): number {
  const g = layer.granular,
    source = state.source!;
  const density = clamp(g.density * 2 ** (mod.grainDensity * 4), 1, 240);
  const size = state.grainWindow!.length;
  if (index >= state.nextGrain) {
    const position = clamp(g.position + mod.grainPosition, 0, 1);
    if (state.grains.length < 96)
      state.grains.push({
        age: 0,
        length: size,
        position:
          (position + (state.random() * 2 - 1) * g.spray * 0.5) *
          Math.max(1, source.length - 1),
      });
    const interval =
      (rate / density) * (1 + (state.random() * 2 - 1) * g.jitter * 0.85);
    state.nextGrain = index + Math.max(1, interval);
  }
  const speed =
    (((state.sourceRate / rate) * 2 ** (g.pitch / 12) * frequency) / 220) *
    (g.reverse ? -1 : 1);
  let sample = 0;
  for (let j = state.grains.length - 1; j >= 0; j--) {
    const grain = state.grains[j];
    if (grain.age >= grain.length) {
      state.grains.splice(j, 1);
      continue;
    }
    const position =
      ((grain.position % source.length) + source.length) % source.length;
    const first = Math.floor(position),
      fraction = position - first;
    const value =
      source[first] +
      (source[(first + 1) % source.length] - source[first]) * fraction;
    const window = state.grainWindow![grain.age];
    sample += value * window;
    grain.position += speed;
    grain.age++;
  }
  return (
    sample *
    clamp(Math.sqrt(2 / Math.max(0.25, (density * g.size) / 1000)), 0.15, 1.5)
  );
}

/** Layer DSP happens before the shared master effects, so cross-engine modulation is audible. */
export function renderModularDry(
  p: SoundParams,
  rate: number,
  renderPercussion: (params: SoundParams, sampleRate: number) => Float32Array,
): Float32Array {
  const architecture = p.architecture!;
  const length = Math.ceil((modularDuration(p) + 0.002) * rate);
  const output = new Float32Array(length);
  const states: LayerState[] = architecture.layers.map((layer, layerIndex) => {
    const state: LayerState = {
      phases: [0, 0, 0, 0],
      previousOperator: 0,
      filter1: 0,
      filter2: 0,
      grains: [],
      nextGrain: 0,
      sourceRate: TEXTURE_RATE,
      random: randomGenerator(p.seed + layerIndex * 991),
    };
    if (layer.engine === "granular") {
      const sample =
        layer.granular.source === "sample" ? layer.granular.sample : undefined;
      state.source = sample?.data?.length
        ? sample.data
        : getTexture(layer.granular.texture);
      state.sourceRate = sample?.sampleRate ?? TEXTURE_RATE;
      const windowLength = Math.max(
        2,
        Math.round((layer.granular.size * rate) / 1000),
      );
      state.grainWindow = Float32Array.from(
        { length: windowLength },
        (_, i) => 0.5 - Math.cos((TAU * i) / (windowLength - 1)) * 0.5,
      );
    }
    if (layer.engine === "wavetable")
      state.table = getWavetable(layer.wavetable.table);
    if (layer.engine === "percussion" && layer.enabled && layer.level > 0) {
      state.percussion = renderPercussion(
        {
          ...p,
          architecture: undefined,
          tone: {
            ...p.tone,
            frequency: clamp(
              p.tone.frequency * 2 ** (layer.tune / 12),
              20,
              12000,
            ),
            attack: layer.envelope.attack,
            decay: layer.envelope.decay,
            release: layer.envelope.release,
          },
          effects: {
            ...p.effects,
            drive: 0,
            bitDepth: 16,
            sampleRate: rate,
            reverb: 0,
            delay: 0,
          },
          mix: { volume: 1, pan: 0 },
        },
        rate,
      );
    }
    return state;
  });
  const interaction = architecture.interaction;
  const order = [
    interaction.source,
    ...[0, 1, 2].filter((index) => index !== interaction.source),
  ];
  const values = [0, 0, 0],
    previousValues = [0, 0, 0];
  const random = randomGenerator(p.seed ^ 0x6179);
  const hitRandom = random() * 2 - 1;
  const mods: ModValues[] = architecture.layers.map(() => ({
    pitch: 0,
    cutoff: 0,
    fmIndex: 0,
    wtPosition: 0,
    grainPosition: 0,
    grainDensity: 0,
    level: 0,
  }));
  const compiledRoutes = architecture.routes.map((route) => ({
    ...route,
    layer: layerIds.indexOf(route.target.split(".")[0] as LayerId),
    destination: route.target.split(".")[1] as ModDestination,
  }));
  const usesLfo1 = compiledRoutes.some((route) => route.source === "lfo1");
  const usesLfo2 = compiledRoutes.some((route) => route.source === "lfo2");
  const usesAmpEnv = compiledRoutes.some((route) => route.source === "ampEnv");
  const needsNoiseBed = !architecture.layers.some(
    (layer) =>
      layer.enabled && layer.level > 0 && layer.engine === "percussion",
  );
  const activeGain = Math.max(
    0,
    ...architecture.layers
      .filter((layer) => layer.enabled)
      .map((layer) => layer.level),
  );
  const noiseRandom = randomGenerator(p.seed);
  let noiseLow = 0,
    brown = 0,
    pink0 = 0,
    pink1 = 0,
    pink2 = 0,
    noiseHigh = 0,
    previousLow = 0;
  const noiseCoefficient =
    1 - Math.exp((-TAU * Math.min(p.noise.filter, rate * 0.45)) / rate);
  const highFrequency = {
    kick: 20,
    snare: 650,
    clap: 1100,
    hat: 5400,
    tom: 90,
    rim: 700,
    perc: 120,
    shaker: 2600,
  }[p.type];
  const highCoefficient = Math.exp(
    (-TAU * Math.min(highFrequency, rate * 0.3)) / rate,
  );
  const globalEnv: LayerEnvelope = {
    attack: p.tone.attack,
    decay: p.tone.decay,
    release: p.tone.release,
    curve: 1,
  };
  const noiseEnvParams: LayerEnvelope = {
    attack: Math.min(p.tone.attack, 15),
    decay: p.noise.decay,
    release: 3,
    curve: 1,
  };
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const pitchEnvelope = Math.exp((-5 * t) / (p.tone.pitchDecay / 1000));
    const sources = {
      lfo1: usesLfo1 ? lfoValue(architecture.lfos[0], t, p.seed) : 0,
      lfo2: usesLfo2 ? lfoValue(architecture.lfos[1], t, p.seed + 619) : 0,
      pitchEnv: pitchEnvelope,
      ampEnv: usesAmpEnv ? envelope(t, globalEnv) : 0,
      random: hitRandom,
    };
    for (const mod of mods) {
      mod.pitch =
        mod.cutoff =
        mod.fmIndex =
        mod.wtPosition =
        mod.grainPosition =
        mod.grainDensity =
        mod.level =
          0;
    }
    let driveModulation = 0;
    for (const route of compiledRoutes) {
      const amount = sources[route.source] * route.amount;
      if (route.target === "master.drive") driveModulation += amount;
      else mods[route.layer][route.destination] += amount;
    }
    for (const layerIndex of order) {
      const layer = architecture.layers[layerIndex],
        state = states[layerIndex],
        mod = mods[layerIndex];
      if (!layer.enabled || layer.level <= 0) {
        values[layerIndex] = 0;
        continue;
      }
      if (
        layer.engine !== "percussion" &&
        t >=
          (layer.envelope.attack +
            layer.envelope.decay +
            layer.envelope.release) /
            1000
      ) {
        values[layerIndex] = 0;
        continue;
      }
      const sourceValue =
        interaction.source === layerIndex
          ? previousValues[layerIndex]
          : values[interaction.source];
      const sourceLayer = architecture.layers[interaction.source];
      const interacting =
        interaction.target === layerIndex &&
        interaction.type !== "none" &&
        sourceLayer.enabled &&
        sourceLayer.level > 0;
      const baseFrequency = p.tone.frequency * 2 ** (layer.tune / 12);
      let frequency =
        baseFrequency *
        2 ** ((p.tone.pitchAmount * pitchEnvelope + mod.pitch * 24) / 12);
      if (interacting && interaction.type === "fm")
        frequency += sourceValue * interaction.amount * baseFrequency * 12;
      frequency = clamp(frequency, -rate * 0.43, rate * 0.43);
      let sample = 0;
      if (layer.engine === "percussion") {
        // Legacy body can participate as a modulator or in AM/ring destinations.
        const readPosition = state.phases[0];
        const first = Math.floor(readPosition),
          frac = readPosition - first;
        const pcm = state.percussion!;
        sample = (pcm[first] ?? 0) * (1 - frac) + (pcm[first + 1] ?? 0) * frac;
        const referenceFrequency =
          baseFrequency * 2 ** ((p.tone.pitchAmount * pitchEnvelope) / 12);
        state.phases[0] = Math.max(
          0,
          readPosition +
            clamp(frequency / Math.max(1, referenceFrequency), -8, 8),
        );
        if (layer.envelope.curve !== 1) {
          const originalEnv = envelope(t, { ...layer.envelope, curve: 1 });
          sample *=
            originalEnv > 1e-8 ? envelope(t, layer.envelope) / originalEnv : 0;
        }
      } else {
        if (layer.engine === "fm")
          sample = fmSample(layer, state, frequency, rate, t, mod.fmIndex);
        else if (layer.engine === "subtractive")
          sample = subtractiveSample(layer, state, frequency, rate, t, mod);
        else if (layer.engine === "wavetable") {
          state.phases[0] += frequency / rate;
          const w = layer.wavetable;
          const scan =
            w.scan *
            (w.scanRate === 0
              ? 1 - Math.exp(-8 * t)
              : Math.sin(TAU * t * w.scanRate));
          sample = sampleBank(
            state.table!,
            state.phases[0],
            w.position + scan + mod.wtPosition,
            w.warp,
            frequency,
            rate,
          );
        } else sample = granularSample(layer, state, frequency, rate, i, mod);
        sample *= envelope(t, layer.envelope);
      }
      if (interacting && interaction.type === "ring")
        sample *= 1 - interaction.amount + sourceValue * interaction.amount * 2;
      if (interacting && interaction.type === "am")
        sample *=
          1 -
          interaction.amount +
          (0.5 + sourceValue * 0.5) * interaction.amount;
      values[layerIndex] = sample * layer.level * clamp(1 + mod.level, 0, 2);
    }
    let sample = values[0] + values[1] + values[2];
    if (needsNoiseBed && activeGain > 0 && p.noise.level > 0) {
      const white = noiseRandom() * 2 - 1;
      let noise = white;
      if (p.noise.color === "pink") {
        pink0 = 0.99765 * pink0 + white * 0.099046;
        pink1 = 0.963 * pink1 + white * 0.2965164;
        pink2 = 0.57 * pink2 + white * 1.0526913;
        noise = (pink0 + pink1 + pink2 + white * 0.1848) * 0.26;
      } else if (p.noise.color === "brown") {
        brown = (brown + white * 0.045) / 1.025;
        noise = brown * 4.2;
      }
      noiseLow += noiseCoefficient * (noise - noiseLow);
      noiseHigh = highCoefficient * (noiseHigh + noiseLow - previousLow);
      previousLow = noiseLow;
      const noiseEnv = envelope(t, noiseEnvParams);
      sample += noiseHigh * noiseEnv * p.noise.level * activeGain * 1.4;
    }
    const drive = clamp(p.effects.drive + driveModulation, 0, 1);
    if (drive > 0) {
      const gain = 1 + drive * 14;
      sample =
        (Math.tanh(sample * gain) / Math.tanh(gain)) * (1 - drive * 0.22);
    }
    output[i] = Number.isFinite(sample) ? sample : 0;
    for (let j = 0; j < 3; j++) previousValues[j] = values[j];
  }
  return output;
}
