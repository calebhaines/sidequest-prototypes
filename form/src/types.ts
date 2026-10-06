export type VoiceType =
  "kick" | "snare" | "clap" | "hat" | "tom" | "rim" | "perc" | "shaker";
export type ToneWaveform = "sine" | "triangle" | "square" | "sawtooth";
export type NoiseColor = "white" | "pink" | "brown";
export type WavBitDepth = 16 | 24 | 32;

export type SynthEngine =
  "percussion" | "subtractive" | "fm" | "wavetable" | "granular";
export type LayerId = "a" | "b" | "c";
export type WavetableType = "basic" | "fold" | "vowel" | "metal";
export type ModSource = "lfo1" | "lfo2" | "pitchEnv" | "ampEnv" | "random";
export type ModDestination =
  | "pitch"
  | "cutoff"
  | "fmIndex"
  | "wtPosition"
  | "grainPosition"
  | "grainDensity"
  | "level";
export type ModTarget = `${LayerId}.${ModDestination}` | "master.drive";

export interface LayerEnvelope {
  /** Envelope times are in milliseconds; curve controls the decay slope. */
  attack: number;
  decay: number;
  release: number;
  curve: number;
}

export interface GrainSample {
  name: string;
  sampleRate: number;
  /** Mono decoded PCM, embedded in saved projects for offline use. */
  data: number[];
}

export interface SynthLayer {
  id: LayerId;
  enabled: boolean;
  engine: SynthEngine;
  level: number;
  tune: number;
  envelope: LayerEnvelope;
  subtractive: {
    waveform: ToneWaveform;
    waveform2: ToneWaveform;
    detune: number;
    blend: number;
    cutoff: number;
    resonance: number;
    filterType: "lowpass" | "highpass" | "bandpass";
    /** Bipolar filter envelope depth, scaled to six octaves. */
    filterEnvelope: number;
  };
  fm: {
    algorithm: "cascade" | "parallel" | "feedback" | "stack";
    ratios: [number, number, number, number];
    levels: [number, number, number, number];
    /** Independent operator amplitude-decay times in milliseconds. */
    decays: [number, number, number, number];
    feedback: number;
    index: number;
    indexDecay: number;
  };
  wavetable: {
    table: WavetableType;
    position: number;
    scan: number;
    scanRate: number;
    warp: number;
  };
  granular: {
    source: "internal" | "sample";
    position: number;
    size: number;
    density: number;
    spray: number;
    jitter: number;
    pitch: number;
    reverse: boolean;
    texture: "metal" | "wood" | "noise" | "vocal";
    sample?: GrainSample;
  };
}

export interface LFOParams {
  shape: "sine" | "triangle" | "square" | "sample-hold";
  rate: number;
  depth: number;
  phase: number;
}

export interface ModRoute {
  id: string;
  source: ModSource;
  target: ModTarget;
  amount: number;
}

export interface SynthArchitecture {
  layers: SynthLayer[];
  routes: ModRoute[];
  lfos: [LFOParams, LFOParams];
  interaction: {
    source: 0 | 1 | 2;
    target: 0 | 1 | 2;
    type: "none" | "fm" | "ring" | "am";
    amount: number;
  };
}

export interface SoundParams {
  name: string;
  type: VoiceType;
  seed: number;
  tone: {
    frequency: number;
    pitchDecay: number;
    pitchAmount: number;
    waveform: ToneWaveform;
    attack: number;
    decay: number;
    release: number;
  };
  noise: {
    level: number;
    color: NoiseColor;
    filter: number;
    decay: number;
  };
  effects: {
    drive: number;
    bitDepth: number;
    sampleRate: number;
    reverb: number;
    delay: number;
  };
  mix: { volume: number; pan: number };
  architecture?: SynthArchitecture;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  type: VoiceType;
  params: SoundParams;
  /** Previous banks remain addressable for saved favourites and old projects. */
  archive?: boolean;
  description?: string;
  kitId?: string;
}

export interface PatternTrack {
  params: SoundParams;
  steps: boolean[];
  muted?: boolean;
  velocities?: number[];
  stepDetails?: import("./sequencing").StepDetail[];
}

export interface PatternRenderOptions {
  sampleRate?: number;
  swing?: number;
  bars?: number;
  tail?: boolean;
}

export interface ExportOptions {
  sampleRate?: number;
  bitDepth?: WavBitDepth;
  normalize?: boolean;
  trim?: boolean;
}
