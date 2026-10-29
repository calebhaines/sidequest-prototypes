import type {
  ExportOptions,
  PatternRenderOptions,
  PatternTrack,
  Preset,
  SoundParams,
  LayerId,
  VoiceType,
  WavBitDepth,
} from "./types";
import {
  cloneArchitecture,
  modularDuration,
  renderModularDry,
  sanitizeArchitecture,
} from "./modular";
import { drySignature, hasVoiceFx, normalizeVoiceFx, processVoiceFx, processVoiceFxAsync, voiceEffects, voiceFxTail, type VoiceFxBank } from "./voice-effects";
import { prepareStereo } from "./export-utils";
import { createHybridPresets } from "./hybrid-presets";
import { createFactoryPresets, FACTORY_KITS } from "./factory-sounds";
import { eventsForStep, normalizeStepDetail } from "./sequencing";
import { normalizeSoundLocks, type SoundLocks } from "./sound-locks";
export { FACTORY_KITS } from "./factory-sounds";
export {
  createDefaultArchitecture,
  createLayer,
  ensureArchitecture,
  ENGINE_LABELS,
  sampleWavetable,
} from "./modular";

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

export function cloneParams(params: SoundParams): SoundParams {
  return {
    ...params,
    tone: { ...params.tone },
    noise: { ...params.noise },
    effects: { ...params.effects },
    mix: { ...params.mix },
    galleyFx: normalizeVoiceFx(params.galleyFx),
    ...(params.architecture
      ? { architecture: cloneArchitecture(params.architecture) }
      : {}),
  };
}

/** Listen to one engine at full layer level without changing the saved mix. */
export function createLayerPreview(
  input: SoundParams,
  id: LayerId,
): SoundParams {
  const params = sanitizeParams(input);
  const architecture = sanitizeArchitecture(params.architecture, params);
  const selected = architecture.layers.find((layer) => layer.id === id)!;
  params.architecture = {
    ...architecture,
    layers: architecture.layers.map((layer) => ({
      ...layer,
      enabled: layer.id === id,
      level: layer.id === id ? 1 : layer.level,
    })),
    interaction: { ...architecture.interaction, type: "none" },
  };
  // The shared noise bed belongs to the mix; percussion's noise is part of its engine.
  if (selected.engine !== "percussion") params.noise.level = 0;
  return params;
}

const base: SoundParams = {
  name: "Stockpot sub",
  type: "kick",
  seed: 1207,
  tone: {
    frequency: 48,
    pitchDecay: 42,
    pitchAmount: 36,
    waveform: "sine",
    attack: 0.3,
    decay: 360,
    release: 50,
  },
  noise: { level: 0.045, color: "white", filter: 7500, decay: 12 },
  effects: {
    drive: 0.12,
    bitDepth: 16,
    sampleRate: 48000,
    reverb: 0,
    delay: 0,
  },
  mix: { volume: 0.8, pan: 0 },
};

type PresetPatch = Partial<
  Omit<SoundParams, "tone" | "noise" | "effects" | "mix">
> & {
  tone?: Partial<SoundParams["tone"]>;
  noise?: Partial<SoundParams["noise"]>;
  effects?: Partial<SoundParams["effects"]>;
  mix?: Partial<SoundParams["mix"]>;
};

function preset(
  id: string,
  name: string,
  category: string,
  type: VoiceType,
  patch: PresetPatch = {},
): Preset {
  const params: SoundParams = {
    ...base,
    ...patch,
    name,
    type,
    tone: { ...base.tone, ...patch.tone },
    noise: { ...base.noise, ...patch.noise },
    effects: { ...base.effects, ...patch.effects },
    mix: { ...base.mix, ...patch.mix },
  };
  return { id, name, category, type, params };
}

/** The bank is intentionally made from editable synthesis parameters, not samples. */
export const ARCHIVE_PRESETS: Preset[] = [
  preset("sub-foundation", "Stockpot sub", "Analog", "kick"),
  preset("warehouse", "Walk-in kick", "Analog", "kick", {
    tone: { frequency: 57, pitchAmount: 31, pitchDecay: 30, decay: 255 },
    effects: { drive: 0.4 },
  }),
  preset("808-bloom", "808 low boil", "Classic", "kick", {
    tone: {
      frequency: 42,
      pitchAmount: 25,
      pitchDecay: 62,
      decay: 850,
      release: 130,
    },
    noise: { level: 0.018 },
    effects: { drive: 0.05 },
  }),
  preset("909-punch", "909 plate punch", "Classic", "kick", {
    tone: { frequency: 60, pitchAmount: 43, pitchDecay: 22, decay: 220 },
    noise: { level: 0.15, decay: 8 },
    effects: { drive: 0.3 },
  }),
  preset("concrete", "Cast-iron kick", "Industrial", "kick", {
    tone: { frequency: 45, waveform: "triangle", pitchAmount: 48, decay: 390 },
    effects: { drive: 0.72, bitDepth: 10, sampleRate: 18000 },
  }),
  preset("dry-snap", "Dry service", "Analog", "snare", {
    tone: {
      frequency: 185,
      pitchAmount: 7,
      pitchDecay: 22,
      decay: 110,
      release: 35,
    },
    noise: { level: 0.8, color: "white", filter: 11000, decay: 190 },
    effects: { drive: 0.14 },
  }),
  preset("tape-snare", "Ticket snare", "Acoustic", "snare", {
    tone: {
      frequency: 165,
      pitchAmount: 10,
      pitchDecay: 18,
      waveform: "triangle",
      decay: 140,
    },
    noise: { level: 0.72, color: "pink", filter: 6300, decay: 235 },
    effects: { drive: 0.28 },
  }),
  preset("gated-chrome", "Hood gate", "Industrial", "snare", {
    tone: { frequency: 220, pitchAmount: 14, decay: 130 },
    noise: { level: 0.9, filter: 14000, decay: 160 },
    effects: { drive: 0.5, reverb: 0.3 },
  }),
  preset("pixel-snare", "Timer snare", "Digital", "snare", {
    tone: { frequency: 240, waveform: "square", pitchAmount: 5, decay: 85 },
    noise: { level: 0.7, filter: 8500, decay: 130 },
    effects: { bitDepth: 7, sampleRate: 10000, drive: 0.3 },
  }),
  preset("room-hands", "Prep clap", "Acoustic", "clap", {
    tone: { frequency: 780, pitchAmount: 2, decay: 65 },
    noise: { level: 0.95, color: "pink", filter: 10500, decay: 180 },
    effects: { reverb: 0.2, drive: 0.12 },
  }),
  preset("dusty-clap", "Flour clap", "Classic", "clap", {
    tone: { frequency: 930, pitchAmount: 0, decay: 50 },
    noise: { level: 0.9, color: "brown", filter: 7800, decay: 150 },
    effects: { drive: 0.22, bitDepth: 12, sampleRate: 28000 },
  }),
  preset("stadium-clap", "Full service", "Experimental", "clap", {
    tone: { frequency: 1100, decay: 90 },
    noise: { level: 0.88, filter: 13000, decay: 260 },
    effects: { reverb: 0.6, delay: 0.13 },
  }),
  preset("closed-metal", "Lid closed", "Analog", "hat", {
    tone: {
      frequency: 4100,
      pitchAmount: 1,
      pitchDecay: 10,
      waveform: "square",
      decay: 52,
      release: 12,
    },
    noise: { level: 0.55, filter: 15000, decay: 55 },
    effects: { drive: 0.1 },
    mix: { volume: 0.55, pan: 0.08 },
  }),
  preset("open-air", "Hood open", "Classic", "hat", {
    tone: {
      frequency: 4700,
      pitchAmount: 0,
      waveform: "square",
      decay: 300,
      release: 60,
    },
    noise: { level: 0.65, filter: 17000, decay: 360 },
    effects: { drive: 0.06 },
    mix: { volume: 0.48, pan: 0.12 },
  }),
  preset("glass-hat", "Glass rack", "Digital", "hat", {
    tone: { frequency: 5500, pitchAmount: 4, pitchDecay: 16, decay: 105 },
    noise: { level: 0.2, filter: 13000, decay: 130 },
    effects: { reverb: 0.22, delay: 0.12 },
    mix: { volume: 0.5, pan: -0.15 },
  }),
  preset("broken-circuit", "Broken timer", "Industrial", "hat", {
    tone: { frequency: 3300, waveform: "sawtooth", pitchAmount: 12, decay: 90 },
    noise: { level: 0.45, filter: 8500, decay: 90 },
    effects: { bitDepth: 6, sampleRate: 11000, drive: 0.4 },
    mix: { volume: 0.55 },
  }),
  preset("low-orbit", "Low stockpot", "Analog", "tom", {
    tone: {
      frequency: 110,
      pitchAmount: 12,
      pitchDecay: 60,
      decay: 340,
      release: 60,
    },
    noise: { level: 0.04, color: "pink", filter: 3500, decay: 30 },
    effects: { drive: 0.12 },
  }),
  preset("high-orbit", "High saucepan", "Analog", "tom", {
    tone: { frequency: 210, pitchAmount: 10, pitchDecay: 45, decay: 250 },
    noise: { level: 0.055, filter: 5000, decay: 18 },
  }),
  preset("ceramic", "Ceramic bowl", "Acoustic", "tom", {
    tone: {
      frequency: 280,
      pitchAmount: 8,
      pitchDecay: 26,
      waveform: "triangle",
      decay: 280,
    },
    noise: { level: 0.14, color: "pink", filter: 4600, decay: 44 },
    effects: { reverb: 0.14 },
  }),
  preset("wood-click", "Board click", "Acoustic", "rim", {
    tone: {
      frequency: 830,
      pitchAmount: 5,
      pitchDecay: 12,
      decay: 45,
      release: 14,
    },
    noise: { level: 0.2, color: "brown", filter: 6500, decay: 18 },
    effects: { drive: 0.08 },
    mix: { volume: 0.65 },
  }),
  preset("rim-shot", "Tray rim", "Classic", "rim", {
    tone: {
      frequency: 1300,
      pitchAmount: 10,
      pitchDecay: 10,
      waveform: "triangle",
      decay: 68,
    },
    noise: { level: 0.28, filter: 10000, decay: 25 },
    effects: { drive: 0.22 },
    mix: { volume: 0.6 },
  }),
  preset("laser-rim", "Timer rim", "Digital", "rim", {
    tone: { frequency: 1800, pitchAmount: 24, pitchDecay: 28, decay: 110 },
    noise: { level: 0.05, decay: 10 },
    effects: { delay: 0.3, reverb: 0.16 },
    mix: { volume: 0.5, pan: -0.2 },
  }),
  preset("fm-droplet", "FM reduction", "Digital", "perc", {
    tone: {
      frequency: 480,
      pitchAmount: 19,
      pitchDecay: 70,
      decay: 290,
      release: 75,
    },
    noise: { level: 0.025, filter: 5000, decay: 20 },
    effects: { reverb: 0.13, drive: 0.08 },
    mix: { volume: 0.65, pan: -0.12 },
  }),
  preset("cowbell", "Order bell", "Classic", "perc", {
    tone: {
      frequency: 560,
      pitchAmount: 0,
      waveform: "square",
      decay: 150,
      release: 30,
    },
    noise: { level: 0.02, decay: 9 },
    effects: { drive: 0.22 },
    mix: { volume: 0.5 },
  }),
  preset("alien-pluck", "Strange garnish", "Experimental", "perc", {
    tone: {
      frequency: 340,
      pitchAmount: -15,
      pitchDecay: 120,
      decay: 490,
      release: 90,
    },
    noise: { level: 0.09, color: "brown", filter: 2800, decay: 70 },
    effects: { delay: 0.3, reverb: 0.3, drive: 0.17 },
    mix: { volume: 0.6 },
  }),
  preset("digital-pebble", "Diced bits", "Digital", "perc", {
    tone: {
      frequency: 1250,
      pitchAmount: 28,
      pitchDecay: 18,
      waveform: "triangle",
      decay: 90,
    },
    noise: { level: 0.13, decay: 15 },
    effects: { bitDepth: 8, sampleRate: 15000, drive: 0.25 },
    mix: { volume: 0.6 },
  }),
  preset("sand-grain", "Salt shaker", "Acoustic", "shaker", {
    tone: { frequency: 3200, pitchAmount: 0, decay: 35, release: 15 },
    noise: { level: 0.86, color: "pink", filter: 14000, decay: 95 },
    effects: { drive: 0.06 },
    mix: { volume: 0.6, pan: 0.2 },
  }),
  preset("cabasa", "Pepper shaker", "Acoustic", "shaker", {
    tone: { frequency: 2800, pitchAmount: 2, decay: 75 },
    noise: { level: 0.8, color: "brown", filter: 10500, decay: 180 },
    effects: { drive: 0.15 },
    mix: { volume: 0.65, pan: -0.18 },
  }),
  preset("neon-rattle", "Counter rattle", "Experimental", "shaker", {
    tone: {
      frequency: 4400,
      pitchAmount: 9,
      pitchDecay: 50,
      waveform: "triangle",
      decay: 125,
    },
    noise: { level: 0.74, filter: 16000, decay: 160 },
    effects: { bitDepth: 10, reverb: 0.2, delay: 0.15 },
    mix: { volume: 0.55, pan: 0.25 },
  }),
  preset("vinyl-dust", "Flour dust", "Lo-fi", "shaker", {
    tone: { frequency: 2100, pitchAmount: 0, decay: 55 },
    noise: { level: 0.95, color: "brown", filter: 6200, decay: 140 },
    effects: { bitDepth: 9, sampleRate: 16000, drive: 0.2 },
    mix: { volume: 0.65, pan: -0.1 },
  }),
  ...createHybridPresets(base),
].map(recipe => ({ ...recipe, archive: true }));

export const CURRENT_PRESETS: Preset[] = createFactoryPresets(base);
export const PRESETS: Preset[] = [...CURRENT_PRESETS, ...ARCHIVE_PRESETS];

export const presetBank = PRESETS;

export function buildDefaultKit(): SoundParams[] {
  return buildFactoryKit(FACTORY_KITS[0].id);
}

export function buildFactoryKit(id: string): SoundParams[] {
  const kit = FACTORY_KITS.find(kit => kit.id === id);
  if (!kit) throw new Error("Choose a HOTPLATE factory kit.");
  return kit.presetIds.map(id => cloneParams(CURRENT_PRESETS.find(preset => preset.id === id)!.params));
}

/** Imported patches are bounded here as well as in the controls. */
export function sanitizeParams(input: SoundParams): SoundParams {
  const p: SoundParams = {
    ...base,
    ...input,
    tone: { ...base.tone, ...input?.tone },
    noise: { ...base.noise, ...input?.noise },
    effects: { ...base.effects, ...input?.effects },
    mix: { ...base.mix, ...input?.mix },
    galleyFx: normalizeVoiceFx(input?.galleyFx),
  };
  p.seed = Math.trunc(finite(p.seed, 1207)) >>> 0;
  p.type = [
    "kick",
    "snare",
    "clap",
    "hat",
    "tom",
    "rim",
    "perc",
    "shaker",
  ].includes(p.type)
    ? p.type
    : "perc";
  p.tone.frequency = clamp(finite(p.tone.frequency, 100), 20, 12000);
  p.tone.pitchDecay = clamp(finite(p.tone.pitchDecay, 40), 1, 1500);
  p.tone.pitchAmount = clamp(finite(p.tone.pitchAmount, 0), -48, 72);
  p.tone.attack = clamp(finite(p.tone.attack, 0.5), 0, 1000);
  p.tone.decay = clamp(finite(p.tone.decay, 150), 5, 3000);
  p.tone.release = clamp(finite(p.tone.release, 30), 0, 1500);
  if (!["sine", "triangle", "square", "sawtooth"].includes(p.tone.waveform))
    p.tone.waveform = "sine";
  p.noise.level = clamp(finite(p.noise.level, 0.2), 0, 1);
  p.noise.filter = clamp(finite(p.noise.filter, 8000), 80, 20000);
  p.noise.decay = clamp(finite(p.noise.decay, 120), 5, 3000);
  if (!["white", "pink", "brown"].includes(p.noise.color))
    p.noise.color = "white";
  p.effects.drive = clamp(finite(p.effects.drive, 0), 0, 1);
  p.effects.bitDepth = Math.round(clamp(finite(p.effects.bitDepth, 16), 4, 16));
  p.effects.sampleRate = clamp(
    finite(p.effects.sampleRate, 48000),
    4000,
    48000,
  );
  p.effects.reverb = clamp(finite(p.effects.reverb, 0), 0, 1);
  p.effects.delay = clamp(finite(p.effects.delay, 0), 0, 1);
  p.mix.volume = clamp(finite(p.mix.volume, 0.8), 0, 1);
  p.mix.pan = clamp(finite(p.mix.pan, 0), -1, 1);
  if (input?.architecture)
    p.architecture = sanitizeArchitecture(input.architecture, p);
  return p;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let z = Math.imul(state ^ (state >>> 15), 1 | state);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const RANDOM_VARIATIONS = 8;
function hasHitRandom(params: SoundParams): boolean {
  return !!params.architecture?.routes.some(
    (route) => route.source === "random" && route.amount !== 0,
  );
}

/** A pre-renderable variation pool keeps random routes responsive during playback. */
function hitVariation(params: SoundParams, index: number): SoundParams {
  return index === 0
    ? params
    : { ...params, seed: (params.seed + Math.imul(index, 0x9e3779b9)) >>> 0 };
}

function oscillator(
  phase: number,
  waveform: SoundParams["tone"]["waveform"],
): number {
  const position = phase - Math.floor(phase);
  switch (waveform) {
    case "triangle":
      return 1 - 4 * Math.abs(position - 0.5);
    case "square":
      return position < 0.5 ? 1 : -1;
    case "sawtooth":
      return 2 * position - 1;
    default:
      return Math.sin(phase * TAU);
  }
}

function envelope(
  t: number,
  attack: number,
  decay: number,
  release: number,
): number {
  if (t < 0 || t >= attack + decay + release) return 0;
  if (attack > 0 && t < attack) return t / attack;
  const elapsed = t - attack;
  const amplitude = Math.exp((-5 * Math.min(elapsed, decay)) / decay);
  if (elapsed <= decay) return amplitude;
  return amplitude * (1 - (elapsed - decay) / Math.max(0.000001, release));
}

/** Deterministic offline DSP. No server, audio permissions, or realtime context needed. */
export function renderSound(
  input: SoundParams,
  requestedRate = 44100,
): Float32Array {
  const p = sanitizeParams(input);
  const sampleRate = Math.round(
    clamp(finite(requestedRate, 44100), 8000, 192000),
  );
  const attack = p.tone.attack / 1000;
  const decay = p.tone.decay / 1000;
  const release = p.tone.release / 1000;
  const noiseDecay = p.noise.decay / 1000;
  const pitchDecay = p.tone.pitchDecay / 1000;
  const dryDuration = p.architecture
    ? modularDuration(p)
    : Math.max(
        attack + decay + release,
        noiseDecay + attack + (p.type === "clap" ? 0.05 : 0),
      );
  const fxTail = Math.max(
    p.effects.reverb > 0 ? 1.45 : 0,
    p.effects.delay > 0 ? 0.9 : 0,
  );
  const duration = clamp(dryDuration + fxTail + 0.012, 0.055, 6);
  const length = Math.ceil(duration * sampleRate);
  const output = new Float32Array(length);
  const random = seededRandom(p.seed);
  const phases = [0, 0, 0, 0, 0, 0];
  const hatRatios = [0.34, 0.51, 0.78, 1, 1.31, 1.71];
  let brown = 0,
    pink0 = 0,
    pink1 = 0,
    pink2 = 0,
    low = 0,
    previousLow = 0,
    high = 0;
  const lowCoefficient =
    1 -
    Math.exp((-TAU * Math.min(p.noise.filter, sampleRate * 0.45)) / sampleRate);
  const highCutoff = (
    {
      kick: 20,
      snare: 650,
      clap: 1100,
      hat: 5400,
      tom: 90,
      rim: 700,
      perc: 120,
      shaker: 2600,
    } as const
  )[p.type];
  const highCoefficient = Math.exp(
    (-TAU * Math.min(highCutoff, sampleRate * 0.3)) / sampleRate,
  );
  const quantization = 2 ** (p.effects.bitDepth - 1);
  const rateStep = Math.min(sampleRate, p.effects.sampleRate) / sampleRate;
  let holdPhase = 1,
    heldSample = 0;
  const driveGain = 1 + p.effects.drive * 14;
  const driveNormalization = Math.tanh(driveGain);
  const dryLength = Math.min(
    length,
    Math.ceil((dryDuration + 0.002) * sampleRate),
  );
  if (p.architecture) {
    const dry = renderModularDry(p, sampleRate, renderSound);
    for (let i = 0; i < Math.min(dry.length, length); i++) {
      holdPhase += rateStep;
      if (holdPhase >= 1) {
        holdPhase -= Math.floor(holdPhase);
        heldSample = Math.round(dry[i] * quantization) / quantization;
      }
      output[i] = heldSample;
    }
  } else
    for (let i = 0; i < dryLength; i++) {
      const t = i / sampleRate;
      const pitch = p.tone.pitchAmount * Math.exp((-5 * t) / pitchDecay);
      const frequency = Math.min(
        sampleRate * 0.43,
        p.tone.frequency * 2 ** (pitch / 12),
      );
      phases[0] += frequency / sampleRate;
      phases[1] += (frequency * 1.483) / sampleRate;
      phases[2] += (frequency * 2.17) / sampleRate;
      const toneEnvelope = envelope(t, attack, decay, release);
      let tone = oscillator(phases[0], p.tone.waveform);
      let toneWeight = 0.85;
      switch (p.type) {
        case "kick":
          tone =
            tone * 0.92 +
            Math.sin(phases[0] * TAU * 2) * 0.08 * Math.exp(-t * 35);
          break;
        case "snare":
          tone = tone * 0.6 + oscillator(phases[1], p.tone.waveform) * 0.4;
          toneWeight = 0.45;
          break;
        case "clap":
          tone = tone * 0.6 + oscillator(phases[2], p.tone.waveform) * 0.4;
          toneWeight = 0.13;
          break;
        case "hat": {
          let metallic = 0;
          for (let k = 0; k < 6; k++) {
            if (k > 2)
              phases[k] +=
                Math.min(frequency * hatRatios[k], sampleRate * 0.43) /
                sampleRate;
            const phase = k <= 2 ? phases[k] * hatRatios[k] : phases[k];
            metallic += oscillator(phase, p.tone.waveform);
          }
          tone = metallic / 6;
          toneWeight = 0.5;
          break;
        }
        case "tom":
          tone =
            tone * 0.76 +
            Math.sin(phases[1] * TAU) * 0.16 +
            Math.sin(phases[2] * TAU) * 0.08;
          break;
        case "rim":
          tone =
            tone * 0.48 +
            oscillator(phases[1], p.tone.waveform) * 0.32 +
            oscillator(phases[2], p.tone.waveform) * 0.2;
          toneWeight = 0.72;
          break;
        case "perc": {
          const fm = Math.sin(phases[1] * TAU) * Math.exp(-t * 14) * 1.6;
          tone =
            oscillator(phases[0] + fm / TAU, p.tone.waveform) * 0.68 +
            oscillator(phases[2], p.tone.waveform) * 0.32;
          toneWeight = 0.8;
          break;
        }
        case "shaker":
          tone = tone * 0.5 + oscillator(phases[2], p.tone.waveform) * 0.5;
          toneWeight = 0.13;
          break;
      }
      const white = random() * 2 - 1;
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
      low += lowCoefficient * (noise - low);
      high = highCoefficient * (high + low - previousLow);
      previousLow = low;
      let noiseEnvelope = envelope(
        t,
        Math.min(attack, 0.015),
        noiseDecay,
        0.003,
      );
      if (p.type === "clap") {
        noiseEnvelope = 0;
        for (const offset of [0, 0.011, 0.025, 0.041]) {
          const elapsed = t - offset;
          if (elapsed >= 0)
            noiseEnvelope +=
              Math.exp(-elapsed * (offset === 0.041 ? 5 / noiseDecay : 210)) *
              Math.min(1, elapsed * 1800);
        }
        noiseEnvelope *= 0.68;
        if (t > noiseDecay + 0.05) noiseEnvelope = 0;
      } else if (p.type === "shaker") {
        noiseEnvelope *= 0.48 + 0.52 * Math.sin(t * 430) ** 2;
      }
      let sample =
        tone * toneEnvelope * toneWeight +
        high *
          noiseEnvelope *
          p.noise.level *
          (p.type === "hat" ? 1.45 : p.type === "shaker" ? 2 : 1.4);
      if (p.effects.drive > 0)
        sample =
          (Math.tanh(sample * driveGain) / driveNormalization) *
          (1 - p.effects.drive * 0.22);
      holdPhase += rateStep;
      if (holdPhase >= 1) {
        holdPhase -= Math.floor(holdPhase);
        heldSample = Math.round(sample * quantization) / quantization;
      }
      output[i] = heldSample;
    }

  if (p.effects.reverb > 0 || p.effects.delay > 0) {
    const dry = output.slice();
    if (p.effects.reverb > 0) {
      const delays = [0.0311, 0.0437, 0.0613, 0.0797].map((time) =>
        Math.max(1, Math.round(time * sampleRate)),
      );
      const lines = delays.map((delay) => new Float32Array(delay));
      const feedbacks = [0.76, 0.71, 0.67, 0.63];
      for (let i = 0; i < length; i++) {
        let wet = 0;
        for (let k = 0; k < lines.length; k++) {
          const index = i % delays[k];
          const value = lines[k][index];
          lines[k][index] = dry[i] * 0.4 + value * feedbacks[k];
          wet += value;
        }
        output[i] =
          dry[i] * (1 - p.effects.reverb * 0.14) +
          wet * p.effects.reverb * 0.31;
      }
    }
    if (p.effects.delay > 0) {
      const delaySamples = Math.round(0.125 * sampleRate);
      for (let tap = 1; tap <= 6; tap++) {
        const offset = delaySamples * tap;
        const gain = p.effects.delay * 0.48 ** tap;
        for (let i = offset; i < length; i++)
          output[i] += dry[i - offset] * gain;
      }
    }
  }
  const fadeIn = Math.max(1, Math.round(sampleRate * 0.0004));
  const fadeOut = Math.max(1, Math.round(sampleRate * 0.008));
  let dcInput = 0,
    dcOutput = 0;
  const dcCoefficient = Math.exp((-TAU * 12) / sampleRate);
  for (let i = 0; i < length; i++) {
    const current = output[i];
    const filtered = current - dcInput + dcCoefficient * dcOutput;
    dcInput = current;
    dcOutput = filtered;
    let sample = filtered * p.mix.volume;
    if (i < fadeIn) sample *= i / fadeIn;
    if (i >= length - fadeOut) sample *= (length - 1 - i) / fadeOut;
    output[i] = clamp(sample, -0.98, 0.98);
  }
  return output;
}

/** A strike receives its own patch; the saved burner never changes. */
export function applySoundLocks(input: SoundParams, value?: SoundLocks): SoundParams {
  const locks = normalizeSoundLocks(value, true), p = cloneParams(input);
  if (locks.pan !== undefined) p.mix.pan = locks.pan;
  if (locks.level !== undefined) p.mix.volume = locks.level;
  if (locks.drive !== undefined) p.effects.drive = locks.drive;
  if (locks.tone !== undefined) p.noise.filter = 40 * (20000 / 40) ** locks.tone;
  if (locks.decay !== undefined) {
    p.tone.decay = locks.decay * 1000; p.noise.decay = locks.decay * 1000;
    if (p.architecture) p.architecture.layers.forEach(layer => { layer.envelope.decay = locks.decay! * 1000; });
  }
  return p;
}
/** Match a per-hit Web Audio low-pass after pitch playback, not before it. */
function lockedFilterSamples(samples: Float32Array, sampleRate: number, pitch: number, locks?: SoundLocks): { samples: Float32Array; rate: number } {
  const rate = 2 ** (clamp(pitch, -48, 48) / 12);
  if (locks?.cutoff === undefined && locks?.resonance === undefined) return { samples, rate };
  const frames = Math.ceil(samples.length / rate), output = new Float32Array(frames);
  const frequency = clamp(locks.cutoff ?? 20000, 20, sampleRate * .45), q = locks.resonance ?? Math.SQRT1_2;
  const w = TAU * frequency / sampleRate, cosine = Math.cos(w), alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = (1 - cosine) / 2 / a0, b1 = (1 - cosine) / a0, b2 = b0, a1 = -2 * cosine / a0, a2 = (1 - alpha) / a0;
  let z1 = 0, z2 = 0;
  const fade = Math.min(Math.round(sampleRate * .008), Math.floor(frames / 2));
  for (let frame = 0; frame < frames; frame++) {
    const position = frame * rate, at = Math.floor(position), fraction = position - at;
    const x = (samples[at] ?? 0) * (1 - fraction) + (samples[at + 1] ?? 0) * fraction;
    const y = clamp(b0 * x + z1, -8, 8);
    z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y;
    output[frame] = y * Math.min(1, (frames - frame - 1) / Math.max(1, fade));
  }
  return { samples: output, rate: 1 };
}

export function waveformPeaks(samples: Float32Array, count = 96): number[] {
  count = Math.floor(clamp(finite(count, 96), 1, 8192));
  const peaks = new Array<number>(count).fill(0);
  let maximum = 0;
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * samples.length) / count);
    const end = Math.max(
      start + 1,
      Math.floor(((i + 1) * samples.length) / count),
    );
    let peak = 0;
    for (let j = start; j < Math.min(end, samples.length); j++)
      if (Math.abs(samples[j]) > Math.abs(peak)) peak = samples[j];
    peaks[i] = peak;
    maximum = Math.max(maximum, Math.abs(peak));
  }
  return maximum > 0 ? peaks.map((peak) => peak / maximum) : peaks;
}

export function normalizeSamples(
  samples: Float32Array,
  peakDb = -1,
): Float32Array {
  const output = samples.slice();
  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  if (peak <= 1e-10) return output;
  const gain = 10 ** (clamp(peakDb, -60, 0) / 20) / peak;
  for (let i = 0; i < output.length; i++) output[i] *= gain;
  return output;
}

export function trimSilence(
  samples: Float32Array,
  sampleRate = 44100,
  threshold = 0.0005,
): Float32Array {
  let start = 0,
    end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < threshold)
    start++;
  if (start === samples.length)
    return new Float32Array(Math.max(1, Math.round(sampleRate * 0.01)));
  while (end > start && Math.abs(samples[end]) < threshold) end--;
  const margin = Math.round(sampleRate * 0.003);
  const result = samples.slice(
    Math.max(0, start - margin),
    Math.min(samples.length, end + margin + 1),
  );
  const fade = Math.min(
    result.length,
    Math.max(1, Math.round(sampleRate * 0.002)),
  );
  for (let i = 0; i < fade; i++) result[result.length - 1 - i] *= i / fade;
  return result;
}

/** Standard signed PCM WAV. Channel arrays are interleaved for stereo exports. */
export function encodeWav(
  samples: Float32Array | Float32Array[],
  sampleRate = 44100,
  bitDepth: WavBitDepth = 24,
): Blob {
  if (![16, 24, 32].includes(bitDepth))
    throw new Error("WAV bit depth must be 16, 24, or 32.");
  sampleRate = Math.round(clamp(finite(sampleRate, 44100), 8000, 192000));
  const channels = Array.isArray(samples) ? samples : [samples];
  if (channels.length < 1 || channels.length > 2)
    throw new Error("WAV export supports mono or stereo.");
  const length = Math.max(...channels.map((channel) => channel.length));
  const bytesPerSample = bitDepth / 8;
  const dataSize = length * channels.length * bytesPerSample;
  const padding = dataSize % 2;
  const buffer = new ArrayBuffer(44 + dataSize + padding);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize + padding, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * bytesPerSample, true);
  view.setUint16(32, channels.length * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const channel of channels) {
      const raw = channel[i] ?? 0;
      const sample = clamp(Number.isFinite(raw) ? raw : 0, -1, 1);
      const integer = Math.round(
        sample * (sample < 0 ? 2 ** (bitDepth - 1) : 2 ** (bitDepth - 1) - 1),
      );
      if (bitDepth === 16) view.setInt16(offset, integer, true);
      else if (bitDepth === 24) {
        view.setUint8(offset, integer & 0xff);
        view.setUint8(offset + 1, (integer >> 8) & 0xff);
        view.setUint8(offset + 2, (integer >> 16) & 0xff);
      } else view.setInt32(offset, integer, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** The original mono synthesis is kept separate from each voice's stereo rack. */
export function renderVoiceStereo(input: SoundParams, requestedRate = 44100, tempo = 120, tailSeconds?: number): Float32Array[] {
  const params = sanitizeParams(input), sampleRate = Math.round(clamp(finite(requestedRate, 44100), 8000, 192000));
  const tail = tailSeconds ?? voiceFxTail(params.galleyFx, tempo, sampleRate);
  if (!Number.isFinite(tail) || tail < 0 || tail > 15) throw new Error("Choose a HOTPLATE effect tail between zero and fifteen seconds.");
  const mono = renderSound(params, sampleRate), pan = params.mix.pan;
  const frames = mono.length + Math.ceil(tail * sampleRate);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < mono.length; i++) { left[i] = mono[i] * l; right[i] = mono[i] * r; }
  processVoiceFx(params.galleyFx, left, right, sampleRate, tempo);
  return [left, right];
}

export function exportSound(
  params: SoundParams,
  options: ExportOptions = {},
): Blob {
  const sampleRate = options.sampleRate ?? 44100;
  if (hasVoiceFx(params.galleyFx)) {
    const channels = prepareStereo(renderVoiceStereo(params, sampleRate), options.normalize === true, options.trim === true);
    return encodeWav(channels, sampleRate, options.bitDepth ?? 24);
  }
  let samples = renderSound(params, sampleRate);
  if (options.trim) samples = trimSilence(samples, sampleRate);
  if (options.normalize) samples = normalizeSamples(samples);
  return encodeWav(samples, sampleRate, options.bitDepth ?? 24);
}

/** Renders whole loops at exact sample positions and includes the final effect tail. */
export function renderPattern(
  tracks: PatternTrack[],
  bpm: number,
  options: PatternRenderOptions = {},
): Float32Array[] {
  const sampleRate = Math.round(
    clamp(finite(options.sampleRate ?? 44100, 44100), 8000, 192000),
  );
  const stepTime = 60 / clamp(finite(bpm, 120), 30, 300) / 4;
  const bars = Math.round(clamp(finite(options.bars ?? 1, 1), 1, 64));
  const swing = clamp(finite(options.swing ?? 0, 0), 0, 0.75);
  const stepsPerBar = Math.max(
    16,
    ...tracks.map((track) => track.steps.length),
  );
  const rendered = tracks.map((track) => ({
      track,
      samples: renderSound(track.params, sampleRate),
      variations: new Map<number, Float32Array>(),
      strikes: new Map<string, { samples: Float32Array; rate: number }>(),
      hits: 0,
    }));
  const sequence = tracks.map(track => Array.from({ length: stepsPerBar }, (_, step) =>
    !track.muted && !!track.steps[step % Math.max(1, track.steps.length)]));
  const details = tracks.map(track => Array.from({ length: stepsPerBar }, (_, step) => {
    const position = step % Math.max(1, track.steps.length);
    // The public render API historically defaults to unity. Legacy app
    // callers explicitly supply their 1/.86 accents; new grids save details.
    return normalizeStepDetail(track.stepDetails?.[position] ?? {
      velocity: track.velocities?.[position] ?? 1,
    }, position);
  }));
  let tail =
    options.tail === false
      ? 0
      : Math.max(
          0,
          ...rendered.map(({ track, samples }, voice) => {
            if (track.muted) return 0;
            const lowestPitch = Math.min(0, ...details[voice].filter((detail, step) =>
              sequence[voice][step] && detail.velocity > 0 && detail.probability > 0).map(detail => detail.pitch));
            return samples.length / sampleRate / 2 ** (lowestPitch / 12) + voiceFxTail(track.params.galleyFx, bpm, sampleRate);
          }),
        );
  if (options.tail !== false) tracks.forEach((track, voice) => {
    const durations = new Map<number, number>();
    details[voice].forEach((detail, step) => {
      if (!sequence[voice][step] || detail.velocity === 0 || detail.probability === 0 || detail.locks?.decay === undefined) return;
      let duration = durations.get(detail.locks.decay);
      if (duration === undefined) { duration = renderSound(applySoundLocks(track.params, detail.locks), sampleRate).length / sampleRate; durations.set(detail.locks.decay, duration); }
      tail = Math.max(tail, duration / 2 ** (detail.pitch / 12) + voiceFxTail(track.params.galleyFx, bpm, sampleRate));
    });
  });
  const length = Math.ceil((stepsPerBar * bars * stepTime + tail) * sampleRate);
  const left = new Float32Array(length),
    right = new Float32Array(length);
  const voiceBuffers = tracks.map(track => !track.muted && hasVoiceFx(track.params.galleyFx) ? [new Float32Array(length), new Float32Array(length)] : null);
  for (let step = 0; step < stepsPerBar * bars; step++) {
    const position = step % stepsPerBar;
    const events = eventsForStep(sequence, details, position, Math.floor(step / stepsPerBar), bpm, swing * 100);
    for (const event of events) {
      const renderedVoice = rendered[event.voice];
      const { track, samples, variations, strikes } = renderedVoice;
      const sound = event.locks ? applySoundLocks(track.params, event.locks) : track.params;
      const pan = clamp(finite(sound.mix.pan, 0), -1, 1);
      const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
      const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
      let hitSamples = samples;
      let variation = 0;
      if (hasHitRandom(track.params)) {
        variation = renderedVoice.hits++ % RANDOM_VARIATIONS;
        if (variation > 0) {
          if (!variations.has(variation))
            variations.set(
              variation,
              renderSound(hitVariation(track.params, variation), sampleRate),
            );
          hitSamples = variations.get(variation)!;
        }
      }
      let rate = 2 ** (event.pitch / 12);
      if (event.locks) {
        const key = JSON.stringify([event.locks, variation, event.pitch]);
        let strike = strikes.get(key);
        if (!strike) {
          strike = lockedFilterSamples(renderSound(hitVariation(sound, variation), sampleRate), sampleRate, event.pitch, event.locks);
          if (strikes.size >= 64) strikes.delete(strikes.keys().next().value!);
          strikes.set(key, strike);
        }
        hitSamples = strike.samples; rate = strike.rate;
      }
      const offset = Math.max(0, Math.round((step * stepTime + event.offset) * sampleRate));
      const frames = Math.min(length - offset, Math.ceil(hitSamples.length / rate));
      for (let i = 0; i < frames; i++) {
        const source = i * rate, at = Math.floor(source), blend = source - at;
        const sample = (hitSamples[at] ?? 0) * (1 - blend) + (hitSamples[at + 1] ?? 0) * blend;
        (voiceBuffers[event.voice]?.[0] ?? left)[offset + i] += sample * leftGain * event.velocity;
        (voiceBuffers[event.voice]?.[1] ?? right)[offset + i] += sample * rightGain * event.velocity;
      }
    }
  }
  voiceBuffers.forEach((buffer, index) => {
    if (!buffer) return;
    processVoiceFx(tracks[index].params.galleyFx, buffer[0], buffer[1], sampleRate, bpm);
    for (let i = 0; i < length; i++) { left[i] += buffer[0][i]; right[i] += buffer[1][i]; }
  });
  let peak = 1;
  for (let i = 0; i < length; i++)
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  if (peak > 1)
    for (let i = 0; i < length; i++) {
      left[i] *= 0.98 / peak;
      right[i] *= 0.98 / peak;
    }
  return [left, right];
}

export type NativePatternEvent = { voice: number; at: number; velocity: number; pitch?: number; duration?: number; locks?: SoundLocks };
/** Exact imported note clips use the same sound renderer as native sequencer hits. */
export function renderExactPatternEvents(
  sounds: SoundParams[],
  events: NativePatternEvent[],
  options: { durationSeconds: number; sampleRate?: number; tailSeconds?: number; master?: number; tempo?: number },
): Float32Array[] {
  const seconds = options.durationSeconds;
  const tail = options.tailSeconds ?? 0;
  const sampleRate = options.sampleRate ?? 48000;
  const master = options.master ?? .72;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600 ||
      !Number.isFinite(tail) || tail < 0 || tail > 15 ||
      !Number.isFinite(sampleRate) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isFinite(master) || master < 0 || master > 1 ||
      !Array.isArray(events) || events.length > 8192)
    throw new Error("Invalid HOTPLATE exact pattern render bounds.");
  const frames = Math.max(1, Math.ceil((seconds + tail) * sampleRate));
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const voiceBuffers = sounds.map(sound => hasVoiceFx(sound.galleyFx) ? [new Float32Array(frames), new Float32Array(frames)] : null);
  const cache = new Map<string, { samples: Float32Array; rate: number }>();
  for (let index = 0; index < events.length; index++) {
    const event = events[index], base = sounds[event.voice];
    if (!Number.isInteger(event.voice) || !base || !Number.isFinite(event.at) || event.at < 0 || event.at >= seconds ||
        !Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 1 ||
        (event.pitch !== undefined && !Number.isFinite(event.pitch)))
      throw new Error("Invalid HOTPLATE exact scheduled note.");
    const locks = normalizeSoundLocks(event.locks, true), sound = Object.keys(locks).length ? applySoundLocks(base, locks) : base;
    const variation = hasHitRandom(sound) ? index % RANDOM_VARIATIONS : 0;
    const key = JSON.stringify([event.voice, variation, event.pitch ?? 0, locks]);
    let strike = cache.get(key);
    if (!strike) {
      strike = lockedFilterSamples(renderSound(hitVariation(sound, variation), sampleRate), sampleRate, event.pitch ?? 0, locks);
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, strike);
    }
    const { samples, rate } = strike;
    const offset = Math.round(event.at * sampleRate);
    const pan = clamp(finite(sound.mix.pan, 0), -1, 1);
    const gain = event.velocity * (voiceBuffers[event.voice] ? 1 : master);
    const leftGain = Math.cos((pan + 1) * Math.PI / 4) * gain;
    const rightGain = Math.sin((pan + 1) * Math.PI / 4) * gain;
    for (let frame = 0, count = Math.min(frames - offset, Math.ceil(samples.length / rate)); frame < count; frame++) {
      const position = frame * rate, at = Math.floor(position), blend = position - at;
      const value = (samples[at] ?? 0) * (1 - blend) + (samples[at + 1] ?? 0) * blend;
      (voiceBuffers[event.voice]?.[0] ?? left)[offset + frame] += value * leftGain;
      (voiceBuffers[event.voice]?.[1] ?? right)[offset + frame] += value * rightGain;
    }
  }
  voiceBuffers.forEach((buffer, index) => {
    if (!buffer) return;
    processVoiceFx(sounds[index].galleyFx, buffer[0], buffer[1], sampleRate, options.tempo ?? 120);
    for (let i = 0; i < frames; i++) { left[i] += buffer[0][i] * master; right[i] += buffer[1][i] * master; }
  });
  let peak = 1;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  if (peak > 1) for (let i = 0; i < frames; i++) {
    left[i] *= .98 / peak;
    right[i] *= .98 / peak;
  }
  return [left, right];
}
/** Arbitrary beat clips use FORM's native synthesis and pan/effect processing. */
export async function renderNativeEvents(
  sounds: SoundParams[], events: NativePatternEvent[],
  options: { durationSeconds: number; tailSeconds?: number; signal?: AbortSignal; master?: number; tempo?: number },
): Promise<{ pcm: Float32Array; sampleRate: number; channels: number; duration: number }> {
  const check = () => options.signal?.throwIfAborted();
  check();
  const seconds = options.durationSeconds, tail = options.tailSeconds ?? 3;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600 || !Number.isFinite(tail) || tail < 0 || tail > 15 || !Array.isArray(events) || events.length > 8192)
    throw new Error("Invalid FORM pattern render bounds.");
  const master = options.master ?? .72;
  const snapshot = sounds.map(cloneParams), eventSnapshot = events.map(event => ({ ...event, ...(event.locks ? { locks: normalizeSoundLocks(event.locks, true) } : {}) })), sampleRate = 48000;
  const frames = Math.max(1, Math.ceil((seconds + tail) * sampleRate));
  const voiceBuffers = snapshot.map(sound => hasVoiceFx(sound.galleyFx) ? [new Float32Array(frames), new Float32Array(frames)] : null);
  const pcm = new Float32Array(frames * 2), cache = new Map<string, { samples: Float32Array; rate: number }>();
  for (let index = 0; index < eventSnapshot.length; index++) {
    const event = eventSnapshot[index], base = snapshot[event.voice];
    if (!base || !Number.isFinite(event.at) || event.at < 0 || event.at >= seconds || !Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 1)
      throw new Error("Invalid FORM scheduled note.");
    const locks = normalizeSoundLocks(event.locks, true), sound = Object.keys(locks).length ? applySoundLocks(base, locks) : base;
    const variation = hasHitRandom(sound) ? index % RANDOM_VARIATIONS : 0;
    const key = JSON.stringify([event.voice, variation, event.pitch ?? 0, locks]);
    let strike = cache.get(key);
    if (!strike) {
      strike = lockedFilterSamples(renderSound(hitVariation(sound, variation), sampleRate), sampleRate, event.pitch ?? 0, locks);
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, strike);
    }
    const { samples, rate } = strike;
    const offset = Math.round(event.at * sampleRate), count = Math.min(frames - offset, Math.ceil(samples.length / rate));
    const pan = clamp(sound.mix.pan, -1, 1), gain = event.velocity * (voiceBuffers[event.voice] ? 1 : master);
    const left = Math.cos((pan + 1) * Math.PI / 4) * gain, right = Math.sin((pan + 1) * Math.PI / 4) * gain;
    for (let frame = 0; frame < count; frame++) {
      const position = frame * rate, at = Math.floor(position), mix = position - at;
      const value = (samples[at] || 0) * (1 - mix) + (samples[at + 1] || 0) * mix;
      const buffer = voiceBuffers[event.voice];
      if (buffer) { buffer[0][offset + frame] += value * left; buffer[1][offset + frame] += value * right; }
      else { pcm[(offset + frame) * 2] += value * left; pcm[(offset + frame) * 2 + 1] += value * right; }
    }
    if (index % 16 === 0) { check(); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
  }
  for (let index = 0; index < voiceBuffers.length; index++) {
    const buffer = voiceBuffers[index]; if (!buffer) continue;
    await processVoiceFxAsync(snapshot[index].galleyFx, buffer[0], buffer[1], sampleRate, options.tempo ?? 120, options.signal);
    for (let i = 0; i < frames; i++) { pcm[i * 2] += buffer[0][i] * master; pcm[i * 2 + 1] += buffer[1][i] * master; }
  }
  let peak = 1; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  const trim = peak > 1 ? .98 / peak : 1, fade = Math.min(1440, Math.floor(frames / 2));
  for (let frame = 0; frame < frames; frame++) {
    const level = trim * Math.min(1, (frames - frame - 1) / fade);
    pcm[frame * 2] *= level; pcm[frame * 2 + 1] *= level;
  }
  check(); return { pcm, sampleRate, channels: 2, duration: frames / sampleRate };
}

/** Audio starts on a user gesture and is kept behind a master safety compressor. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private sourceNotes = new Map<AudioBufferSourceNode, { scope: string; gain: GainNode; start: number; velocity: number; voice: number; cancelledAt?: number; cancelEnd?: number }>();
  private sourceCuts = new Map<string, number>();
  private cache = new Map<string, AudioBuffer>();
  private epoch = 0;
  private masterVolume = 0.72;
  private voiceBank: VoiceFxBank | null = null;
  private fxPreparing: Promise<void> | null = null;
  private voiceState: SoundParams[] = [];
  private voiceFxActive = Array<boolean>(8).fill(false);
  private tempo = 120;
  private fxClock = { tempo: 120, beat: 0, time: 0, playing: false };
  private hostClock: { tempo?: number; bpm?: number; beat?: number; audioTime?: number; when?: number; time?: number; revision?: number; playing?: boolean } | null = null;

  get audioContext(): AudioContext | null {
    return this.context;
  }

  async resume(): Promise<void> {
    if (!this.context || this.context.state === "closed") {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextClass =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (!AudioContextClass)
        throw new Error("This browser does not support Web Audio.");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = this.masterVolume;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -5;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.08;
      this.master.connect(limiter).connect(this.context.destination);
      const context = this.context, master = this.master, effects = voiceEffects();
      this.fxPreparing = effects ? effects.prepare(context).then(() => {
        if (this.context !== context || context.state === "closed") return;
        this.voiceBank = effects.createBank(context, master, { voiceCount: 8, tempo: this.tempo });
        this.syncVoiceEffects(); this.voiceBank.setClock(this.fxClock);
        if (this.hostClock) this.followTransport(this.hostClock);
      }) : null;
    }
    if (this.context.state === "suspended") await this.context.resume();
    await this.fxPreparing;
  }

  private syncVoiceEffects(): void {
    for (let voice = 0; voice < 8; voice++) {
      const slots = normalizeVoiceFx(this.voiceState[voice]?.galleyFx);
      this.voiceFxActive[voice] = hasVoiceFx(slots); this.voiceBank?.setVoice(voice, slots);
    }
  }

  setVoiceState(sounds: SoundParams[], tempo = this.tempo): void {
    const previousTempo = this.tempo;
    this.voiceState = sounds.map(cloneParams); this.tempo = clamp(finite(tempo, 120), 30, 300);
    this.syncVoiceEffects();
    if (!this.hostClock && this.tempo !== previousTempo) this.setVoiceClock({ tempo: this.tempo });
  }

  setVoiceClock(clock: { tempo?: number; beat?: number; time?: number; playing?: boolean }): void {
    const now = finite(clock.time ?? NaN, this.context?.currentTime ?? 0);
    const priorBeat = this.fxClock.beat + (this.fxClock.playing ? now - this.fxClock.time : 0) * this.fxClock.tempo / 60;
    this.fxClock = { tempo: clamp(finite(clock.tempo ?? NaN, this.fxClock.tempo), 30, 300), beat: finite(clock.beat ?? NaN, priorBeat), time: now, playing: typeof clock.playing === "boolean" ? clock.playing : this.fxClock.playing };
    this.voiceBank?.setClock(this.fxClock);
  }

  getVoiceEffectMeters(index: number): unknown { return this.voiceBank?.getMeters(index) ?? [null, null]; }

  followTransport(clock: { tempo?: number; bpm?: number; beat?: number; audioTime?: number; when?: number; time?: number; revision?: number; playing?: boolean }): void {
    if (!clock || typeof clock !== "object") return;
    const previous = this.hostClock; this.hostClock = { ...clock };
    if (!this.context) return;
    const time = finite(clock.audioTime ?? NaN, finite(clock.when ?? NaN, finite(clock.time ?? NaN, this.context.currentTime)));
    // A host seek/stop starts a new performance history, while ordinary clock
    // anchors must leave this voice's delay, reverb and detector memory intact.
    if ((previous && Number.isFinite(clock.revision) && clock.revision !== previous.revision) || (clock.playing === false && previous?.playing !== false)) {
      const boundary = Math.max(this.context.currentTime, time);
      this.finishCancelledVoiceFxSources(boundary); this.voiceBank?.reset(undefined, boundary);
    }
    this.setVoiceClock({ tempo: clock.tempo ?? clock.bpm ?? this.tempo, beat: clock.beat ?? 0, time, playing: clock.playing !== false });
  }

  private finishCancelledVoiceFxSources(boundary: number): void {
    if (!this.context || !this.voiceBank) return;
    for (const [source, note] of this.sourceNotes) {
      // Only old, already-cancelled FX sources can refill the just-reset rack.
      // A separate live source or a newly queued epoch must keep its schedule.
      if (!this.voiceFxActive[note.voice] || note.cancelledAt === undefined || note.cancelledAt > boundary || note.cancelEnd === undefined || note.cancelEnd <= boundary) continue;
      const from = Math.max(this.context.currentTime, note.cancelledAt);
      const level = note.velocity * clamp(1 - (from - note.cancelledAt) / .008, 0, 1);
      note.gain.gain.cancelScheduledValues(from);
      note.gain.gain.setValueAtTime(boundary > from ? level : 0, from);
      if (boundary > from) note.gain.gain.linearRampToValueAtTime(0, boundary);
      try { source.stop(boundary); } catch { /* Already ended. */ }
      note.cancelEnd = boundary;
    }
  }

  now(): number {
    return this.context?.currentTime ?? 0;
  }

  private cachedBuffer(params: SoundParams): AudioBuffer {
    if (!this.context)
      throw new Error("Resume the audio engine before preparing a sound.");
    const key = drySignature(params);
    let buffer = this.cache.get(key);
    if (!buffer) {
      const samples = renderSound(params, this.context.sampleRate);
      buffer = this.context.createBuffer(
        1,
        samples.length,
        this.context.sampleRate,
      );
      buffer.getChannelData(0).set(samples);
      if (this.cache.size >= 64)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, buffer);
    }
    return buffer;
  }

  /** Warm the kit before setting transport time so cold synthesis cannot smear hits. */
  async preload(sounds: SoundParams[]): Promise<void> {
    const epoch = this.epoch;
    await this.resume();
    for (const input of sounds) {
      if (
        epoch !== this.epoch ||
        !this.context ||
        this.context.state === "closed"
      )
        return;
      const params = sanitizeParams(input);
      const variations = hasHitRandom(params) ? RANDOM_VARIATIONS : 1;
      for (let index = 0; index < variations; index++) {
        if (epoch !== this.epoch || !this.context) return;
        const variant = hitVariation(params, index);
        if (!this.cache.has(drySignature(variant))) {
          this.cachedBuffer(variant);
          // Permit a pending stop or UI update between the expensive voice renders.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    }
  }

  async play(params: SoundParams, velocity = 1, when?: number, pitch = 0, locks?: SoundLocks, voice = 0): Promise<void> {
    const epoch = this.epoch;
    await this.resume();
    if (epoch !== this.epoch || !this.context || !this.master) return;
    this.schedulePrepared(params, velocity, when, pitch, "native", locks, voice);
  }

  schedulePrepared(params: SoundParams, velocity = 1, when?: number, pitch = 0, scope = "native", inputLocks?: SoundLocks, voice = 0): void {
    if (!this.context || !this.master) throw new Error("Prepare FORM before scheduling notes.");
    const at = Math.max(this.context.currentTime, when ?? this.context.currentTime);
    if (at >= (this.sourceCuts.get(scope) ?? Infinity)) return;
    const locks = normalizeSoundLocks(inputLocks, true);
    let p = sanitizeParams(Object.keys(locks).length ? applySoundLocks(params, locks) : params);
    if (hasHitRandom(p))
      p = hitVariation(p, Math.floor(Math.random() * RANDOM_VARIATIONS));
    const buffer = this.cachedBuffer(p);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, clamp(finite(pitch, 0), -48, 48) / 12);
    const gain = this.context.createGain();
    gain.gain.value = clamp(finite(velocity, 1), 0, 1);
    const pan = this.context.createStereoPanner();
    pan.pan.value = p.mix.pan;
    let filter: BiquadFilterNode | undefined;
    if (locks.cutoff !== undefined || locks.resonance !== undefined) {
      filter = this.context.createBiquadFilter(); filter.type = "lowpass";
      filter.frequency.value = clamp(locks.cutoff ?? 20000, 20, this.context.sampleRate * .45);
      filter.Q.value = 20 * Math.log10(locks.resonance ?? Math.SQRT1_2);
      source.connect(filter).connect(gain);
      const duration = buffer.duration / source.playbackRate.value, fade = Math.min(.008, duration / 2);
      gain.gain.setValueAtTime(gain.gain.value, at + duration - fade);
      gain.gain.linearRampToValueAtTime(0, at + duration);
    } else source.connect(gain);
    if (!Number.isInteger(voice) || voice < 0 || voice > 7) throw new Error("Choose a HOTPLATE voice from 1 to 8.");
    const slots = normalizeVoiceFx(params.galleyFx);
    if (hasVoiceFx(slots) && !this.voiceBank) throw new Error("Prepare HOTPLATE’s GALLEY voice effects before scheduling notes.");
    this.voiceFxActive[voice] = hasVoiceFx(slots); this.voiceBank?.setVoice(voice, slots);
    gain.connect(pan);
    const detachFx = this.voiceBank ? this.voiceBank.connectSource(voice, pan) : (pan.connect(this.master), () => {});
    this.sources.add(source);
    this.sourceNotes.set(source, { scope, gain, start: at, velocity: gain.gain.value, voice });
    source.onended = () => {
      this.sources.delete(source);
      this.sourceNotes.delete(source);
      source.disconnect();
      gain.disconnect();
      detachFx(); pan.disconnect();
      filter?.disconnect();
    };
    source.start(
      Math.max(this.context.currentTime, when ?? this.context.currentTime),
    );
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp(finite(volume, 0.72), 0, 1);
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.masterVolume,
        this.context.currentTime,
        0.01,
      );
  }

  cancelNativeNotes({ source, when }: { source?: string; when?: number } = {}): void {
    if (!this.context) return;
    const at = Math.max(this.context.currentTime, when ?? this.context.currentTime);
    if (!Number.isFinite(at)) throw new Error("Provide a valid cancellation timestamp.");
    if (source === undefined) this.sourceCuts.clear();
    else if (when !== undefined && at > this.context.currentTime) this.sourceCuts.set(source, Math.min(this.sourceCuts.get(source) ?? Infinity, at));
    else this.sourceCuts.delete(source);
    for (const [node, note] of this.sourceNotes) {
      if (source !== undefined && note.scope !== source) continue;
      note.cancelledAt = at; note.cancelEnd = at + .009;
      note.gain.gain.cancelScheduledValues(at);
      note.gain.gain.setValueAtTime(note.start >= at ? 0 : note.velocity, at);
      note.gain.gain.linearRampToValueAtTime(0, at + .008);
      try { node.stop(at + .009); } catch { /* Already ended. */ }
    }
  }

  stopAll(): void {
    this.epoch++;
    this.voiceBank?.reset();
    this.setVoiceClock({ playing: false });
    this.sourceCuts.clear();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
    this.sourceNotes.clear();
  }

  async close(): Promise<void> {
    this.stopAll();
    this.cache.clear();
    if (this.context && this.context.state !== "closed")
      await this.context.close();
    this.voiceBank?.dispose(); this.voiceBank = null; this.fxPreparing = null;
    this.context = null;
    this.master = null;
  }
}
