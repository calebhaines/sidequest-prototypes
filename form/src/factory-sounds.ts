import { createDefaultArchitecture, createLayer } from "./modular";
import type { Preset, SoundParams, SynthEngine, VoiceType } from "./types";

export interface FactoryKit {
  id: string;
  name: string;
  description: string;
  color: string;
  presetIds: string[];
}

type Recipe = {
  slug: string;
  name: string;
  type: VoiceType;
  frequency: number;
  decay: number;
  sweep: number;
  sweepTime: number;
  noise: number;
  noiseDecay: number;
  snap: number;
  air: number;
  heat: number;
  description: string;
  engine?: SynthEngine;
  waveform?: SoundParams["tone"]["waveform"];
  color?: SoundParams["noise"]["color"];
  fmIndex?: number;
  fmRatio?: number;
  crush?: number;
  sampleRate?: number;
  table?: "basic" | "fold" | "vowel" | "metal";
};

const enamel: Recipe[] = [
  { slug: "stock", name: "Stock kick", type: "kick", frequency: 49, decay: 420, sweep: 30, sweepTime: 34, noise: .018, noiseDecay: 8, snap: .09, air: .018, heat: .08, description: "Deep sine body with a small beater click." },
  { slug: "ticket", name: "Ticket snare", type: "snare", frequency: 183, decay: 142, sweep: 7, sweepTime: 18, noise: .68, noiseDecay: 176, snap: .075, air: .055, heat: .11, description: "Dry twin-tone body and crisp white-noise wires." },
  { slug: "prep", name: "Prep clap", type: "clap", frequency: 890, decay: 76, sweep: 0, sweepTime: 20, noise: .88, noiseDecay: 170, snap: .025, air: .035, heat: .05, description: "Four tight handclap bursts, with no room wash." },
  { slug: "lid", name: "Lid hat", type: "hat", frequency: 5100, decay: 58, sweep: 0, sweepTime: 12, noise: .5, noiseDecay: 54, snap: .04, air: .055, heat: .025, description: "Short six-oscillator metal with a clean air edge." },
  { slug: "hob", name: "Hob tom", type: "tom", frequency: 129, decay: 292, sweep: 11, sweepTime: 44, noise: .035, noiseDecay: 18, snap: .065, air: .02, heat: .045, description: "Round descending tom, ready for pitched fills." },
  { slug: "tray", name: "Tray rim", type: "rim", frequency: 947, decay: 55, sweep: 5, sweepTime: 12, noise: .105, noiseDecay: 16, snap: .08, air: .025, heat: .045, description: "A quick woody tick with a harder rim at the front." },
  { slug: "call", name: "Call bell", type: "perc", frequency: 547, decay: 178, sweep: 0, sweepTime: 18, noise: .015, noiseDecay: 9, snap: .09, air: .012, heat: .055, engine: "fm", fmIndex: 2.8, fmRatio: 1.414, description: "Inharmonic FM bell for syncopation and melody." },
  { slug: "salt", name: "Salt shaker", type: "shaker", frequency: 2900, decay: 35, sweep: 0, sweepTime: 16, noise: .64, noiseDecay: 95, snap: .02, air: .06, heat: .025, color: "pink", description: "Soft pink grains; accented steps turn it into a groove." },
];
const iron: Recipe[] = [
  { slug: "weight", name: "Iron kick", type: "kick", frequency: 59, decay: 255, sweep: 40, sweepTime: 22, noise: .06, noiseDecay: 8, snap: .17, air: .025, heat: .28, description: "Firm, forward kick with a clipped beater and heavy centre." },
  { slug: "slam", name: "Tray slam", type: "snare", frequency: 206, decay: 125, sweep: 11, sweepTime: 15, noise: .74, noiseDecay: 153, snap: .145, air: .095, heat: .29, waveform: "triangle", description: "A dense metal backbeat with a hard, short body." },
  { slug: "hood", name: "Hood clap", type: "clap", frequency: 1240, decay: 64, sweep: 1, sweepTime: 9, noise: .81, noiseDecay: 127, snap: .075, air: .1, heat: .2, description: "Close, bright claps that stay readable in a busy beat." },
  { slug: "knife", name: "Knife hat", type: "hat", frequency: 6320, decay: 45, sweep: 2, sweepTime: 8, noise: .48, noiseDecay: 46, snap: .075, air: .045, heat: .14, description: "Sharp steel ticks with a lean, high-frequency edge." },
  { slug: "coil", name: "Coil tom", type: "tom", frequency: 101, decay: 228, sweep: 17, sweepTime: 31, noise: .075, noiseDecay: 22, snap: .13, air: .03, heat: .22, waveform: "triangle", description: "Low, muscular tom with a fast bending attack." },
  { slug: "punch", name: "Punch rim", type: "rim", frequency: 1450, decay: 41, sweep: 8, sweepTime: 8, noise: .19, noiseDecay: 14, snap: .145, air: .04, heat: .21, waveform: "triangle", description: "A bright rimshot for offbeats and frantic ratchets." },
  { slug: "valve", name: "Valve knock", type: "perc", frequency: 363, decay: 135, sweep: 9, sweepTime: 18, noise: .025, noiseDecay: 20, snap: .2, air: .055, heat: .22, engine: "fm", fmIndex: 6.8, fmRatio: 2.414, description: "A metallic FM clonk with a hollow pressure-vessel body." },
  { slug: "fryer", name: "Fryer rattle", type: "shaker", frequency: 4250, decay: 50, sweep: 2, sweepTime: 11, noise: .76, noiseDecay: 88, snap: .055, air: .11, heat: .12, description: "Hard sizzling grains that cut through distorted drums." },
];
const cold: Recipe[] = [
  { slug: "freezer", name: "Freezer sub", type: "kick", frequency: 43, decay: 620, sweep: 25, sweepTime: 47, noise: .008, noiseDecay: 8, snap: .11, air: .012, heat: .045, engine: "subtractive", description: "Clean dual-oscillator sub with a pinpoint digital attack." },
  { slug: "receipt", name: "Receipt snap", type: "snare", frequency: 224, decay: 128, sweep: 6, sweepTime: 12, noise: .58, noiseDecay: 144, snap: .09, air: .095, heat: .075, engine: "fm", fmIndex: 4.1, fmRatio: 1.483, description: "Electronic membrane and white-noise fizz, tightly gated." },
  { slug: "printer", name: "Printer clap", type: "clap", frequency: 1060, decay: 52, sweep: 0, sweepTime: 12, noise: .78, noiseDecay: 115, snap: .08, air: .06, heat: .05, crush: 12, sampleRate: 32000, description: "A compact, slightly crunchy electronic handclap." },
  { slug: "crystal", name: "Crystal hat", type: "hat", frequency: 3870, decay: 71, sweep: 0, sweepTime: 11, noise: .3, noiseDecay: 82, snap: .03, air: .065, heat: .035, engine: "fm", fmIndex: 5.2, fmRatio: 1.731, description: "Icy FM partials with a fine white-noise fringe." },
  { slug: "ice", name: "Ice tom", type: "tom", frequency: 172, decay: 235, sweep: 12, sweepTime: 33, noise: .02, noiseDecay: 17, snap: .06, air: .03, heat: .045, engine: "fm", fmIndex: 1.7, fmRatio: 2, description: "A hollow tuned tom with a clean electronic pitch drop." },
  { slug: "timer", name: "Timer tick", type: "rim", frequency: 1820, decay: 39, sweep: 12, sweepTime: 10, noise: .055, noiseDecay: 11, snap: .09, air: .025, heat: .07, engine: "wavetable", table: "fold", description: "A clipped folded-wave tick; tiny changes in pitch make big patterns." },
  { slug: "glass", name: "Glass ping", type: "perc", frequency: 627, decay: 266, sweep: 3, sweepTime: 25, noise: .012, noiseDecay: 12, snap: .075, air: .02, heat: .04, engine: "fm", fmIndex: 3.1, fmRatio: 3.141, description: "Clear glassy FM percussion with an inharmonic tail." },
  { slug: "bag", name: "Ice bag", type: "shaker", frequency: 3350, decay: 52, sweep: 0, sweepTime: 9, noise: .61, noiseDecay: 112, snap: .035, air: .095, heat: .035, crush: 11, sampleRate: 28000, description: "Dry, pixel-edged noise that works beautifully with ghost notes." },
];
const late: Recipe[] = [
  { slug: "night", name: "Night kick", type: "kick", frequency: 54, decay: 315, sweep: 24, sweepTime: 29, noise: .025, noiseDecay: 11, snap: .07, air: .025, heat: .16, waveform: "triangle", description: "Warm mid-weight kick, rounded enough for broken rhythms." },
  { slug: "napkin", name: "Napkin snare", type: "snare", frequency: 158, decay: 150, sweep: 5, sweepTime: 26, noise: .7, noiseDecay: 181, snap: .05, air: .075, heat: .13, color: "pink", description: "Soft cloth-like noise wrapped around a low snare body." },
  { slug: "flour", name: "Flour hands", type: "clap", frequency: 773, decay: 81, sweep: 0, sweepTime: 21, noise: .93, noiseDecay: 207, snap: .035, air: .04, heat: .08, color: "pink", description: "Loose, dusty handclaps for laid-back and crooked grooves." },
  { slug: "ajar", name: "Lid ajar", type: "hat", frequency: 4390, decay: 176, sweep: 1, sweepTime: 13, noise: .4, noiseDecay: 201, snap: .025, air: .09, heat: .055, description: "A longer open metal wash; lower Length for a closed hat." },
  { slug: "bowl", name: "Odd bowl", type: "tom", frequency: 237, decay: 252, sweep: -8, sweepTime: 55, noise: .06, noiseDecay: 32, snap: .055, air: .055, heat: .08, engine: "fm", fmIndex: 1.4, fmRatio: 1.414, description: "A rubbery, upward-bending bowl tone for unexpected fills." },
  { slug: "board", name: "Board block", type: "rim", frequency: 733, decay: 62, sweep: 3, sweepTime: 13, noise: .16, noiseDecay: 23, snap: .085, air: .018, heat: .08, color: "brown", description: "Low wooden cross-stick that leaves room around the beat." },
  { slug: "wobble", name: "Wobble bell", type: "perc", frequency: 419, decay: 303, sweep: -11, sweepTime: 88, noise: .03, noiseDecay: 30, snap: .065, air: .035, heat: .09, engine: "wavetable", table: "vowel", description: "A crooked vowel bell that rises after the strike." },
  { slug: "pepper", name: "Pepper drift", type: "shaker", frequency: 2270, decay: 62, sweep: 0, sweepTime: 19, noise: .77, noiseDecay: 151, snap: .025, air: .055, heat: .075, color: "brown", description: "A soft dark shaker with a little loose air between grains." },
];

const kitRecipes = [
  { id: "enamel", name: "Enamel", description: "Clean, warm electronic essentials. The everyday service.", color: "#edbd76", recipes: enamel },
  { id: "iron", name: "Cast iron", description: "Punch, steel, and controlled scorch. Built for pressure.", color: "#e57c55", recipes: iron },
  { id: "cold", name: "Cold store", description: "Sub, FM glass, and clipped digital edges. Keep chilled.", color: "#86b8c2", recipes: cold },
  { id: "late", name: "After hours", description: "Dusty, warm, and slightly unsteady. The kitchen stays open.", color: "#bfa5cd", recipes: late },
];

export const FACTORY_KITS: FactoryKit[] = kitRecipes.map(kit => ({
  id: kit.id,
  name: kit.name,
  description: kit.description,
  color: kit.color,
  presetIds: kit.recipes.map(recipe => `hp3-${kit.id}-${recipe.slug}`),
}));

/** All sounds are editable recipes: no downloaded samples or opaque hidden macros. */
export function createFactoryPresets(template: SoundParams): Preset[] {
  let sequence = 0;
  return kitRecipes.flatMap(kit => kit.recipes.map(recipe => {
    const p: SoundParams = {
      ...template,
      name: recipe.name,
      type: recipe.type,
      seed: 0x48503300 + sequence++,
      tone: {
        ...template.tone,
        frequency: recipe.frequency,
        pitchAmount: recipe.sweep,
        pitchDecay: recipe.sweepTime,
        waveform: recipe.waveform ?? "sine",
        attack: recipe.type === "shaker" ? 1.5 : .3,
        decay: recipe.decay,
        release: recipe.type === "kick" || recipe.type === "tom" ? 30 : 12,
      },
      noise: {
        level: recipe.noise,
        color: recipe.color ?? "white",
        filter: recipe.type === "kick" || recipe.type === "tom" ? 8000 : recipe.type === "shaker" ? 13000 : 16000,
        decay: recipe.noiseDecay,
      },
      effects: { drive: recipe.heat, bitDepth: recipe.crush ?? 16, sampleRate: recipe.sampleRate ?? 48000, reverb: 0, delay: 0 },
      mix: { volume: recipe.type === "hat" ? .49 : recipe.type === "shaker" ? .45 : recipe.type === "rim" ? .58 : recipe.type === "perc" ? .63 : .78, pan: recipe.type === "hat" ? .08 : recipe.type === "shaker" ? -.12 : 0 },
    };
    const a = createLayer(recipe.engine ?? "percussion", "a");
    a.level = recipe.type === "kick" || recipe.type === "tom" ? .91 : .79;
    a.envelope = { attack: p.tone.attack, decay: recipe.decay, release: p.tone.release, curve: 1 };
    a.subtractive = { ...a.subtractive, waveform: "sine", waveform2: "triangle", blend: .075, cutoff: 370, resonance: .08, filterEnvelope: .12 };
    a.fm = { ...a.fm, algorithm: "parallel", ratios: [1, recipe.fmRatio ?? 1.483, 2.718, 4.12], levels: [1, .72, .23, .08], decays: [recipe.decay * 2, recipe.decay * .75, recipe.decay * .48, recipe.decay * .25], index: recipe.fmIndex ?? 2.4, indexDecay: recipe.decay * .7, feedback: .025 };
    a.wavetable = { ...a.wavetable, table: recipe.table ?? "basic", position: recipe.table === "vowel" ? .39 : .16, scan: recipe.table === "vowel" ? -.12 : .045, scanRate: 0, warp: 0 };
    const b = createLayer("fm", "b");
    b.level = recipe.snap;
    b.tune = Math.min(48, Math.max(-36, 12 * Math.log2((recipe.type === "kick" || recipe.type === "tom" ? 760 : recipe.type === "hat" || recipe.type === "shaker" ? 6200 : 1750) / recipe.frequency)));
    b.envelope = { attack: .2, decay: recipe.type === "kick" ? 18 : recipe.type === "clap" ? 12 : 25, release: 4, curve: 1.25 };
    b.fm = { ...b.fm, algorithm: "parallel", ratios: [1, 2.414, 3.17, 7.11], levels: [1, .72, .29, .13], decays: [65, 25, 15, 9], index: recipe.type === "kick" ? 3.3 : 5.5, indexDecay: 13, feedback: .045 };
    const c = createLayer("granular", "c");
    c.level = recipe.air;
    c.tune = Math.min(48, Math.max(-48, 12 * Math.log2(220 / recipe.frequency)));
    c.envelope = { attack: .8, decay: recipe.noiseDecay, release: 7, curve: 1 };
    c.granular = { ...c.granular, texture: "noise", source: "internal", size: recipe.type === "kick" ? 5 : 9, density: 150, position: .35, spray: .4, jitter: .12, pitch: 0, reverse: false };
    p.architecture = createDefaultArchitecture(recipe.type, p.tone);
    p.architecture.layers = [a, b, c];
    return { id: `hp3-${kit.id}-${recipe.slug}`, name: recipe.name, category: kit.name, type: recipe.type, kitId: kit.id, description: recipe.description, params: p };
  }));
}
