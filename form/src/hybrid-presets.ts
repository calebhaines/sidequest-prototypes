import { createDefaultArchitecture, createLayer } from "./modular";
import type {
  ModRoute,
  Preset,
  SoundParams,
  SynthArchitecture,
  SynthEngine,
  SynthLayer,
  VoiceType,
} from "./types";

type LayerPatch = {
  envelope?: Partial<SynthLayer["envelope"]>;
  subtractive?: Partial<SynthLayer["subtractive"]>;
  fm?: Partial<SynthLayer["fm"]>;
  wavetable?: Partial<SynthLayer["wavetable"]>;
  granular?: Partial<SynthLayer["granular"]>;
};

function layer(
  engine: SynthEngine,
  level: number,
  decay: number,
  release: number,
  tune = 0,
  patch: LayerPatch = {},
): SynthLayer {
  const l = createLayer(engine);
  l.level = level;
  l.tune = tune;
  l.envelope = { ...l.envelope, decay, release, curve: 1.3, ...patch.envelope };
  l.subtractive = { ...l.subtractive, ...patch.subtractive };
  l.fm = {
    ...l.fm,
    decays: [
      Math.min(3000, decay * 3),
      Math.max(15, decay * 0.9),
      Math.max(10, decay * 0.6),
      Math.max(6, decay * 0.35),
    ],
    ...patch.fm,
  };
  l.wavetable = { ...l.wavetable, ...patch.wavetable };
  l.granular = { ...l.granular, ...patch.granular };
  return l;
}

/** Hybrid patches intentionally expose synthesis settings instead of hiding recorded hits. */
export function createHybridPresets(template: SoundParams): Preset[] {
  let sequence = 0;
  const patch = (
    id: string,
    name: string,
    type: VoiceType,
    frequency: number,
    pitchAmount: number,
    pitchDecay: number,
    layers: SynthLayer[],
    interaction: Partial<SynthArchitecture["interaction"]> = {},
    routes: ModRoute[] = [],
    effects: Partial<SoundParams["effects"]> = {},
    noise = 0.035,
  ): Preset => {
    const architecture = createDefaultArchitecture(type);
    architecture.layers = layers.map((l, index) => ({
      ...l,
      id: (["a", "b", "c"] as const)[index],
    }));
    architecture.interaction = { ...architecture.interaction, ...interaction };
    architecture.routes = routes;
    const decay = Math.max(...layers.map((l) => l.envelope.decay));
    const params: SoundParams = {
      ...template,
      name,
      type,
      seed: 8101 + sequence++,
      architecture,
      tone: {
        ...template.tone,
        frequency,
        pitchAmount,
        pitchDecay,
        attack: 0.4,
        decay,
        release: 40,
      },
      noise: {
        ...template.noise,
        level: noise,
        decay: Math.min(200, decay),
        filter: type === "hat" || type === "shaker" ? 15000 : 11000,
      },
      effects: {
        ...template.effects,
        drive: 0.08,
        reverb: 0,
        delay: 0,
        ...effects,
      },
      mix: {
        ...template.mix,
        volume: type === "hat" || type === "shaker" ? 0.6 : 0.78,
      },
    };
    return { id, name, category: "Hybrid", type, params };
  };
  return [
    patch(
      "furnace-kick",
      "Burner kick",
      "kick",
      52,
      36,
      36,
      [
        layer("subtractive", 0.72, 310, 35, 0, {
          subtractive: {
            waveform: "sine",
            waveform2: "sawtooth",
            blend: 0.04,
            cutoff: 140,
            resonance: 0.12,
            filterEnvelope: 0.55,
          },
        }),
        layer("fm", 0.25, 28, 7, 24, {
          fm: {
            algorithm: "feedback",
            ratios: [1, 3.12, 8, 11],
            levels: [1, 0.8, 0.32, 0.1],
            index: 12,
            indexDecay: 14,
            feedback: 0.22,
          },
        }),
        layer("granular", 0.11, 32, 4, 12, {
          granular: {
            texture: "metal",
            size: 7,
            density: 110,
            position: 0.6,
            spray: 0.25,
            jitter: 0.1,
          },
        }),
      ],
      { source: 1, target: 0, type: "fm", amount: 0.08 },
      [],
      { drive: 0.2 },
      0.018,
    ),
    patch(
      "velvet-sub",
      "Thick stock",
      "kick",
      42,
      24,
      48,
      [
        layer("wavetable", 0.82, 740, 110, 0, {
          wavetable: {
            table: "basic",
            position: 0.03,
            scan: 0.08,
            scanRate: 2,
            warp: -0.1,
          },
        }),
        layer("granular", 0.14, 24, 5, 24, {
          granular: {
            texture: "wood",
            size: 8,
            density: 120,
            position: 0.12,
            spray: 0.05,
            jitter: 0.03,
          },
        }),
        layer("subtractive", 0.09, 75, 15, 12, {
          subtractive: {
            blend: 0.12,
            cutoff: 700,
            resonance: 0.05,
            filterEnvelope: 0.2,
          },
        }),
      ],
      { source: 1, target: 0, type: "am", amount: 0.1 },
      [],
      { drive: 0.045 },
      0.012,
    ),
    patch(
      "chrome-snare",
      "Steel snare",
      "snare",
      190,
      9,
      16,
      [
        layer("fm", 0.55, 125, 25, 0, {
          fm: {
            algorithm: "parallel",
            ratios: [1, 1.47, 2.8, 4.12],
            levels: [1, 0.65, 0.8, 0.25],
            index: 4,
            indexDecay: 75,
            feedback: 0.06,
          },
        }),
        layer("granular", 0.53, 175, 30, 12, {
          granular: {
            texture: "metal",
            size: 12,
            density: 150,
            position: 0.62,
            spray: 0.35,
            jitter: 0.25,
          },
        }),
        layer("subtractive", 0.2, 42, 8, 24, {
          subtractive: {
            waveform: "square",
            waveform2: "sawtooth",
            blend: 0.4,
            filterType: "highpass",
            cutoff: 2500,
            resonance: 0.15,
          },
        }),
      ],
      { source: 1, target: 0, type: "ring", amount: 0.18 },
      [],
      { drive: 0.15 },
      0.12,
    ),
    patch(
      "fracture-snare",
      "Cracked plate",
      "snare",
      170,
      8,
      20,
      [
        layer("subtractive", 0.48, 130, 22, 0, {
          subtractive: {
            waveform: "triangle",
            waveform2: "square",
            blend: 0.25,
            detune: 17,
            filterType: "bandpass",
            cutoff: 2200,
            resonance: 0.45,
            filterEnvelope: 0.4,
          },
        }),
        layer("wavetable", 0.45, 160, 20, 30, {
          wavetable: {
            table: "metal",
            position: 0.55,
            scan: -0.38,
            scanRate: 9,
            warp: 0.2,
          },
        }),
        layer("granular", 0.3, 120, 15, 12, {
          granular: {
            texture: "noise",
            size: 6,
            density: 165,
            position: 0.7,
            spray: 0.45,
            jitter: 0.55,
            reverse: true,
          },
        }),
      ],
      { source: 1, target: 0, type: "fm", amount: 0.13 },
      [
        {
          id: "fracture-scan",
          source: "lfo2",
          target: "b.wtPosition",
          amount: 0.16,
        },
      ],
      { drive: 0.23 },
      0.08,
    ),
    patch(
      "molecular-clap",
      "Mise clap",
      "clap",
      900,
      0,
      20,
      [
        layer("granular", 0.67, 210, 30, 0, {
          granular: {
            texture: "noise",
            size: 14,
            density: 85,
            position: 0.5,
            spray: 0.25,
            jitter: 0.12,
          },
        }),
        layer("wavetable", 0.14, 85, 10, -12, {
          wavetable: {
            table: "fold",
            position: 0.12,
            scan: 0.4,
            scanRate: 12,
            warp: 0.2,
          },
        }),
        layer("percussion", 0.32, 170, 20),
      ],
      { source: 1, target: 0, type: "am", amount: 0.28 },
      [],
      { reverb: 0.15 },
      0.55,
    ),
    patch(
      "dust-hands",
      "Flour hands",
      "clap",
      760,
      0,
      20,
      [
        layer("percussion", 0.4, 130, 25),
        layer("granular", 0.52, 165, 22, 0, {
          granular: {
            texture: "wood",
            size: 20,
            density: 90,
            position: 0.12,
            spray: 0.4,
            jitter: 0.2,
            reverse: true,
          },
        }),
        layer("subtractive", 0.15, 40, 6, 12, {
          subtractive: {
            waveform: "sawtooth",
            blend: 0.4,
            filterType: "highpass",
            cutoff: 1800,
            resonance: 0.22,
          },
        }),
      ],
      { source: 1, target: 0, type: "am", amount: 0.16 },
      [],
      { drive: 0.17 },
      0.65,
    ),
    patch(
      "magnet-hat",
      "Induction hat",
      "hat",
      1200,
      0,
      15,
      [
        layer("fm", 0.45, 65, 10, 0, {
          fm: {
            algorithm: "stack",
            ratios: [1, 1.342, 1.917, 2.713],
            levels: [1, 0.68, 0.51, 0.32],
            index: 11,
            indexDecay: 35,
            feedback: 0.09,
          },
        }),
        layer("subtractive", 0.35, 55, 8, 24, {
          subtractive: {
            waveform: "square",
            waveform2: "square",
            blend: 0.5,
            detune: 31,
            filterType: "highpass",
            cutoff: 6500,
            resonance: 0.18,
          },
        }),
        layer("granular", 0.25, 70, 12, 12, {
          granular: {
            texture: "metal",
            size: 6,
            density: 120,
            position: 0.72,
            spray: 0.3,
            jitter: 0.2,
          },
        }),
      ],
      { source: 0, target: 1, type: "ring", amount: 0.32 },
      [],
      {},
      0.09,
    ),
    patch(
      "ice-shards",
      "Ice bucket",
      "hat",
      2800,
      2,
      30,
      [
        layer("wavetable", 0.55, 185, 35, 0, {
          wavetable: {
            table: "metal",
            position: 0.78,
            scan: -0.32,
            scanRate: 14,
            warp: 0.22,
          },
        }),
        layer("granular", 0.3, 240, 45, 0, {
          granular: {
            texture: "metal",
            size: 14,
            density: 60,
            position: 0.5,
            spray: 0.7,
            jitter: 0.35,
            pitch: 7,
            reverse: true,
          },
        }),
        layer("fm", 0.2, 130, 25, 0, {
          fm: {
            algorithm: "parallel",
            ratios: [1, 1.62, 3.13, 5.3],
            levels: [1, 0.4, 0.5, 0.2],
            index: 3.5,
            indexDecay: 90,
            feedback: 0.05,
          },
        }),
      ],
      {},
      [
        {
          id: "ice-drift",
          source: "lfo2",
          target: "a.wtPosition",
          amount: 0.2,
        },
      ],
      { reverb: 0.1 },
      0.04,
    ),
    patch(
      "ceramic-hybrid",
      "Bowl tom",
      "tom",
      142,
      14,
      52,
      [
        layer("fm", 0.7, 350, 55, 0, {
          fm: {
            algorithm: "stack",
            ratios: [1, 1.5, 2.75, 5.11],
            levels: [1, 0.3, 0.5, 0.16],
            index: 2.7,
            indexDecay: 75,
            feedback: 0.08,
          },
        }),
        layer("granular", 0.15, 60, 8, 0, {
          granular: {
            texture: "wood",
            size: 12,
            density: 75,
            position: 0.16,
            spray: 0.12,
            jitter: 0.08,
          },
        }),
        layer("subtractive", 0.12, 120, 20, 12, {
          subtractive: {
            blend: 0.1,
            cutoff: 900,
            resonance: 0.38,
            filterEnvelope: 0.25,
          },
        }),
      ],
      { source: 1, target: 0, type: "fm", amount: 0.08 },
      [],
      {},
      0.025,
    ),
    patch(
      "talking-tom",
      "Talking stockpot",
      "tom",
      110,
      9,
      75,
      [
        layer("wavetable", 0.6, 310, 55, 0, {
          wavetable: {
            table: "vowel",
            position: 0.3,
            scan: 0.55,
            scanRate: 3.5,
            warp: 0.14,
          },
        }),
        layer("fm", 0.3, 170, 25, 12, {
          fm: {
            ratios: [1, 1, 2, 3],
            levels: [1, 0.7, 0.32, 0.2],
            index: 3,
            indexDecay: 80,
            feedback: 0.03,
          },
        }),
        layer("granular", 0.22, 180, 30, 0, {
          granular: {
            texture: "vocal",
            size: 32,
            density: 60,
            position: 0.35,
            spray: 0.3,
            jitter: 0.1,
          },
        }),
      ],
      { source: 1, target: 0, type: "fm", amount: 0.1 },
      [
        {
          id: "talk-formant",
          source: "pitchEnv",
          target: "a.wtPosition",
          amount: 0.18,
        },
      ],
      {},
      0.025,
    ),
    patch(
      "nail-rim",
      "Tray edge",
      "rim",
      1100,
      4,
      12,
      [
        layer("fm", 0.65, 55, 8, 0, {
          fm: {
            algorithm: "feedback",
            ratios: [1, 2.37, 5.09, 8.61],
            levels: [1, 0.6, 0.35, 0.18],
            index: 9,
            indexDecay: 18,
            feedback: 0.44,
          },
        }),
        layer("granular", 0.15, 28, 4, 0, {
          granular: {
            texture: "wood",
            size: 7,
            density: 55,
            position: 0.08,
            spray: 0.08,
            jitter: 0.05,
          },
        }),
        layer("wavetable", 0.2, 35, 5, -12, {
          wavetable: {
            table: "fold",
            position: 0.35,
            scan: 0.1,
            scanRate: 18,
            warp: 0.16,
          },
        }),
      ],
      { source: 2, target: 0, type: "ring", amount: 0.2 },
      [],
      {},
      0.035,
    ),
    patch(
      "wood-pixel",
      "Board bits",
      "rim",
      790,
      3,
      18,
      [
        layer("subtractive", 0.55, 65, 10, 0, {
          subtractive: {
            waveform: "triangle",
            waveform2: "square",
            blend: 0.15,
            detune: 4,
            filterType: "bandpass",
            cutoff: 1100,
            resonance: 0.6,
            filterEnvelope: -0.3,
          },
        }),
        layer("granular", 0.35, 60, 8, 0, {
          granular: {
            texture: "wood",
            size: 8,
            density: 90,
            position: 0.2,
            spray: 0.1,
            jitter: 0.07,
          },
        }),
        layer("fm", 0.18, 18, 4, 12, {
          fm: {
            ratios: [1, 0.5, 3, 7],
            levels: [1, 0.4, 0.2, 0.1],
            index: 1,
            indexDecay: 10,
            feedback: 0.02,
          },
        }),
      ],
      {},
      [{ id: "wood-filter", source: "lfo1", target: "a.cutoff", amount: 0.16 }],
      { bitDepth: 12, sampleRate: 24000 },
      0.025,
    ),
    patch(
      "glass-droplet",
      "Sauce drop",
      "perc",
      460,
      12,
      90,
      [
        layer("fm", 0.66, 320, 70, 0, {
          fm: {
            ratios: [1, 2, 3.01, 5.17],
            levels: [1, 0.65, 0.35, 0.1],
            index: 5,
            indexDecay: 110,
            feedback: 0.06,
          },
        }),
        layer("wavetable", 0.23, 170, 30, 12, {
          wavetable: { position: 0.05, scan: 0.3, scanRate: 2.3, warp: 0.08 },
        }),
        layer("granular", 0.14, 110, 20, 0, {
          granular: {
            texture: "metal",
            size: 18,
            density: 35,
            position: 0.8,
            spray: 0.2,
            jitter: 0.1,
          },
        }),
      ],
      { source: 1, target: 0, type: "ring", amount: 0.14 },
      [],
      { reverb: 0.14 },
      0.025,
    ),
    patch(
      "orbit-bell",
      "Service bell",
      "perc",
      540,
      -7,
      180,
      [
        layer("fm", 0.6, 600, 110, 0, {
          fm: {
            algorithm: "parallel",
            ratios: [1, 2.76, 4.08, 6.79],
            levels: [1, 0.6, 0.75, 0.3],
            index: 7.5,
            indexDecay: 220,
            feedback: 0.08,
          },
        }),
        layer("wavetable", 0.24, 360, 65, -12, {
          wavetable: {
            table: "vowel",
            position: 0.12,
            scan: 0.55,
            scanRate: 1.8,
            warp: -0.1,
          },
        }),
        layer("granular", 0.17, 200, 35, 0, {
          granular: {
            texture: "vocal",
            size: 35,
            density: 40,
            position: 0.44,
            spray: 0.15,
            jitter: 0.1,
            reverse: true,
          },
        }),
      ],
      {},
      [
        {
          id: "orbit-formant",
          source: "lfo2",
          target: "b.wtPosition",
          amount: 0.18,
        },
      ],
      { delay: 0.12 },
      0.02,
    ),
    patch(
      "sand-engine",
      "Salt mill",
      "shaker",
      2300,
      0,
      20,
      [
        layer("granular", 0.68, 105, 16, 0, {
          granular: {
            texture: "noise",
            size: 5,
            density: 165,
            position: 0.5,
            spray: 0.7,
            jitter: 0.6,
          },
        }),
        layer("subtractive", 0.2, 75, 12, -12, {
          subtractive: {
            waveform: "sawtooth",
            waveform2: "square",
            blend: 0.2,
            detune: 19,
            filterType: "highpass",
            cutoff: 4000,
            resonance: 0.12,
            filterEnvelope: 0.15,
          },
        }),
        layer("wavetable", 0.12, 70, 10, 12, {
          wavetable: {
            table: "fold",
            position: 0.35,
            scan: 0.3,
            scanRate: 18,
            warp: 0.3,
          },
        }),
      ],
      { source: 1, target: 0, type: "am", amount: 0.25 },
      [],
      { bitDepth: 12 },
      0.06,
    ),
    patch(
      "mutant-cabasa",
      "Pepper incident",
      "shaker",
      1800,
      2,
      45,
      [
        layer("granular", 0.55, 195, 25, 0, {
          granular: {
            texture: "wood",
            size: 9,
            density: 145,
            position: 0.45,
            spray: 0.65,
            jitter: 0.5,
            pitch: 3,
            reverse: true,
          },
        }),
        layer("wavetable", 0.3, 150, 25, -12, {
          wavetable: {
            table: "vowel",
            position: 0.6,
            scan: -0.45,
            scanRate: 7,
            warp: 0.12,
          },
        }),
        layer("fm", 0.2, 80, 12, 12, {
          fm: {
            algorithm: "feedback",
            ratios: [1, 1.2, 2.414, 3.61],
            levels: [1, 0.55, 0.3, 0.12],
            index: 4,
            indexDecay: 30,
            feedback: 0.18,
          },
        }),
      ],
      { source: 2, target: 1, type: "fm", amount: 0.12 },
      [
        {
          id: "cabasa-position",
          source: "lfo2",
          target: "a.grainPosition",
          amount: 0.22,
        },
      ],
      {},
      0.06,
    ),
  ];
}
