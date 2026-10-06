import { cloneParams, sanitizeParams } from "./audio";
import { ensureArchitecture } from "./modular";
import type { SoundParams } from "./types";

export type BurnerControl = "pitch" | "length" | "body" | "snap" | "air" | "heat";
export type BurnerControls = Record<BurnerControl, number>;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/** These are ordinary saved synthesis parameters, never a second hidden sound. */
export function getBurnerControls(input: SoundParams): BurnerControls {
  const p = sanitizeParams(input);
  const architecture = ensureArchitecture(p);
  const layers = architecture.layers;
  const audibleLevel = (index: number) => layers[index].enabled ? layers[index].level : 0;
  const active = layers.filter(layer => layer.enabled && layer.level > 0);
  return {
    pitch: p.tone.frequency,
    length: active.length
      ? Math.max(...active.map(layer => layer.envelope.decay))
      : p.tone.decay,
    body: audibleLevel(0),
    snap: audibleLevel(1),
    air: layers[2].enabled ? layers[2].level : p.noise.level,
    heat: p.effects.drive,
  };
}

/** Length preserves the recipe's short transient/long body relationships. */
export function setBurnerControl(
  input: SoundParams,
  key: BurnerControl,
  value: number,
): SoundParams {
  const p = cloneParams(sanitizeParams(input));
  if (!Number.isFinite(value)) return p;
  if (key === "pitch") p.tone.frequency = clamp(value, 20, 12000);
  else if (key === "heat") p.effects.drive = clamp(value, 0, 1);
  else if (key === "length") {
    const factor = clamp(value, 5, 3000) / getBurnerControls(p).length;
    p.tone.decay = clamp(p.tone.decay * factor, 5, 3000);
    p.tone.release = clamp(p.tone.release * factor, 0, 1500);
    p.tone.pitchDecay = clamp(p.tone.pitchDecay * factor, 1, 1500);
    p.noise.decay = clamp(p.noise.decay * factor, 5, 3000);
    if (p.architecture) {
      p.architecture.layers.forEach(layer => {
        layer.envelope.decay = clamp(layer.envelope.decay * factor, 5, 3000);
        layer.envelope.release = clamp(layer.envelope.release * factor, 0, 1500);
        layer.fm.decays = layer.fm.decays.map(decay => clamp(decay * factor, 1, 3000)) as typeof layer.fm.decays;
        layer.fm.indexDecay = clamp(layer.fm.indexDecay * factor, 1, 3000);
      });
    }
  } else {
    const architecture = ensureArchitecture(p);
    p.architecture = architecture;
    const index = key === "body" ? 0 : key === "snap" ? 1 : 2;
    const level = clamp(value, 0, 1);
    if (key === "air" && !architecture.layers[2].enabled) p.noise.level = level;
    else {
      architecture.layers[index].level = level;
      // Keep the air fader on the same ingredient at zero; a deliberate deep
      // engine toggle, rather than a fader movement, selects the noise fallback.
      architecture.layers[index].enabled = key === "air" || level > 0;
    }
  }
  return sanitizeParams(p);
}

export const BURNER_CONTROL_HELP: Record<BurnerControl, string> = {
  pitch: "The drum's fundamental pitch. All three layers follow it.",
  length: "Shorten or stretch the recipe's body, air, and envelopes together.",
  body: "Level of layer A: the drum's weight and main character.",
  snap: "Level of layer B: the short attack or second ingredient.",
  air: "Level of layer C's texture. When C is off, this adjusts the noise bed.",
  heat: "Saturation across the complete sound: warm to scorched.",
};
