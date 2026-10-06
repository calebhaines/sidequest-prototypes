import { createStepDetails, normalizeStepDetail, type StepDetail } from "./sequencing";

export type FactoryGroove = {
  id: string;
  name: string;
  description: string;
  tempo: number;
  swing: number;
  length: 16 | 32;
  steps: boolean[][];
  stepDetails: StepDetail[][];
};

type Hit = number | ({ at: number } & Partial<StepDetail>);
const h = (at: number, velocity: number, detail: Partial<StepDetail> = {}): Hit =>
  ({ at, velocity, ...detail });

/** Voice order is always kick, snare, clap, hat, tom, rim, percussion, shaker. */
function groove(
  id: string, name: string, description: string, tempo: number, swing: number,
  lanes: Hit[][],
): FactoryGroove {
  const length = 32;
  const steps = Array.from({ length: 8 }, () => Array<boolean>(length).fill(false));
  const stepDetails = createStepDetails(steps);
  lanes.forEach((lane, voice) => lane.forEach(hit => {
    const at = typeof hit === "number" ? hit : hit.at;
    steps[voice][at] = true;
    stepDetails[voice][at] = normalizeStepDetail(typeof hit === "number" ? undefined : hit, at);
  }));
  return { id, name, description, tempo, swing, length, steps, stepDetails };
}

/**
 * Deliberately authored two-bar recipes. Kits and grooves are independent:
 * loading one of these never changes the eight saved burner sounds.
 */
export const FACTORY_GROOVES: FactoryGroove[] = [
  groove("opening-service", "Opening service",
    "A solid four-on-the-floor pulse, crisp offbeats, and a small second-bar lift.", 118, 0, [
      [0, 4, 8, 12, 16, 20, 24, 28, h(31, 0.48)],
      [h(4, 0.84), h(12, 0.92), h(20, 0.84), h(28, 0.96)],
      [h(12, 0.68, { timing: 0.025 }), h(28, 0.78, { timing: 0.025 })],
      [h(2, 0.64), h(6, 0.73), h(10, 0.64), h(14, 0.78), h(18, 0.64), h(22, 0.73), h(26, 0.64), h(29, 0.25), h(30, 0.8)],
      [h(27, 0.38, { pitch: 2 }), h(31, 0.48, { pitch: -2 })],
      [],
      [h(7, 0.38), h(23, 0.4), h(31, 0.25, { probability: 0.65 })],
      [h(1, 0.24), h(3, 0.35), h(5, 0.23), h(7, 0.38), h(9, 0.24), h(11, 0.35), h(13, 0.23), h(15, 0.42), h(17, 0.24), h(19, 0.35), h(21, 0.23), h(23, 0.38), h(25, 0.24), h(27, 0.35), h(29, 0.23), h(31, 0.36, { ratchet: 2 })],
    ]),
  groove("counter-current", "Counter current",
    "A clipped electro conversation: syncopated kick, dry backbeat, and answering toms.", 126, 0, [
      [0, h(3, 0.73), 6, 10, h(14, 0.66), 16, 19, 22, h(25, 0.64), 30],
      [4, 12, 20, 28, h(31, 0.25, { probability: 0.75, timing: -0.025 })],
      [h(12, 0.44), h(28, 0.5)],
      [h(0, 0.38), h(2, 0.68), h(4, 0.32), h(6, 0.7), h(8, 0.38), h(10, 0.68), h(12, 0.32), h(14, 0.78), h(16, 0.38), h(18, 0.68), h(20, 0.32), h(22, 0.7), h(24, 0.38), h(26, 0.68), h(29, 0.35), h(30, 0.65, { ratchet: 2 })],
      [h(7, 0.48, { pitch: 3 }), h(15, 0.55, { pitch: -3 }), h(23, 0.48, { pitch: 3 }), h(27, 0.4, { pitch: -2 }), h(31, 0.57, { pitch: -5 })],
      [h(5, 0.32), h(21, 0.32), h(27, 0.27, { probability: 0.6 })],
      [h(9, 0.43, { pitch: 4 }), h(25, 0.5, { pitch: 7 })],
      [],
    ]),
  groove("swinging-door", "Swinging door",
    "A shuffling garage pocket with tucked-in snare ghosts and a late-bar hat flourish.", 132, 32, [
      [0, h(6, 0.79), 10, h(15, 0.62), 16, h(22, 0.79), 25, h(30, 0.73)],
      [4, h(7, 0.22, { probability: 0.8, timing: -0.04 }), 12, h(19, 0.25), 20, h(26, 0.22, { probability: 0.7 }), 28],
      [h(4, 0.32, { timing: 0.035 }), h(20, 0.32, { timing: 0.035 })],
      [h(0, 0.25), h(2, 0.72), h(3, 0.31), h(6, 0.68), h(9, 0.28), h(10, 0.72), h(11, 0.31), h(14, 0.68), h(16, 0.25), h(18, 0.72), h(19, 0.31), h(22, 0.68), h(25, 0.28), h(26, 0.72), h(30, 0.56, { ratchet: 3 })],
      [],
      [h(5, 0.37), h(13, 0.34), h(21, 0.37), h(29, 0.42)],
      [h(8, 0.34), h(24, 0.38), h(31, 0.23, { probability: 0.6, pitch: 2 })],
      [h(1, 0.24), h(5, 0.28), h(9, 0.24), h(13, 0.3), h(17, 0.24), h(21, 0.28), h(25, 0.24), h(29, 0.3)],
    ]),
  groove("cold-storage", "Cold storage",
    "Unhurried dub space: a heavy centre, rim answers, and percussion that leaves room.", 76, 12, [
      [0, h(11, 0.69), 16, h(23, 0.68), h(30, 0.6)],
      [h(8, 0.95, { timing: 0.05 }), h(24, 0.98, { timing: 0.05 })],
      [],
      [h(2, 0.42), h(6, 0.51), h(10, 0.42), h(14, 0.54), h(18, 0.42), h(22, 0.51), h(26, 0.42), h(30, 0.47)],
      [h(15, 0.43, { pitch: -4 }), h(29, 0.33, { pitch: -2, probability: 0.7 })],
      [h(4, 0.56, { timing: 0.055 }), h(12, 0.48), h(20, 0.56, { timing: 0.055 }), h(27, 0.42)],
      [h(7, 0.4, { pitch: -5 }), h(19, 0.38), h(31, 0.46, { pitch: -2 })],
      [h(3, 0.2), h(7, 0.28), h(11, 0.2), h(15, 0.29), h(19, 0.2), h(23, 0.28), h(27, 0.2), h(31, 0.27, { probability: 0.85 })],
    ]),
  groove("split-service", "Split service",
    "A broken-beat kick skips around a dependable snare, with soft rolling ghosts.", 108, 16, [
      [0, h(3, 0.7), 7, h(10, 0.81), 16, h(18, 0.66), 23, h(26, 0.81), h(31, 0.57)],
      [4, h(9, 0.23, { timing: 0.04 }), 12, h(15, 0.25, { probability: 0.6 }), 20, h(25, 0.23, { timing: 0.04 }), 28, h(30, 0.27)],
      [h(12, 0.43), h(28, 0.46)],
      [h(0, 0.35), h(2, 0.63), h(5, 0.3), h(6, 0.58), h(8, 0.35), h(10, 0.63), h(13, 0.3), h(14, 0.58), h(16, 0.35), h(18, 0.63), h(21, 0.3), h(22, 0.58), h(24, 0.35), h(26, 0.63), h(29, 0.3), h(31, 0.41, { ratchet: 2 })],
      [h(14, 0.42, { pitch: 3 }), h(29, 0.49, { pitch: -3 })],
      [h(6, 0.3, { timing: -0.03 }), h(22, 0.3, { timing: -0.03 })],
      [h(11, 0.4), h(19, 0.37, { pitch: 2 }), h(27, 0.43)],
      [h(1, 0.23), h(7, 0.32), h(9, 0.23), h(15, 0.32), h(17, 0.23), h(23, 0.32), h(25, 0.23), h(31, 0.26)],
    ]),
  groove("night-shift", "Night shift",
    "A straight industrial stomp with metallic offbeats and one pressure-release roll.", 128, 0, [
      [0, 4, 8, 12, 16, 20, 24, 28, h(30, 0.8), h(31, 0.56)],
      [h(4, 0.94), h(12, 1), h(20, 0.94), h(28, 1)],
      [h(4, 0.63), h(12, 0.7), h(20, 0.63), h(28, 0.7)],
      [h(2, 0.64), h(6, 0.64), h(10, 0.64), h(14, 0.7), h(18, 0.64), h(22, 0.64), h(26, 0.64), h(30, 0.61, { ratchet: 4 })],
      [h(7, 0.65, { pitch: -2 }), h(15, 0.65, { pitch: -5 }), h(23, 0.65, { pitch: -2 }), h(27, 0.45, { pitch: 2 })],
      [h(1, 0.49), h(9, 0.49), h(17, 0.49), h(25, 0.49)],
      [h(3, 0.55, { pitch: 5 }), h(11, 0.55, { pitch: -3 }), h(19, 0.55, { pitch: 5 }), h(29, 0.64, { pitch: -3 })],
      [],
    ]),
  groove("half-portion", "Half portion",
    "A wide halftime backbeat with brisk little hats and a two-bar kick conversation.", 86, 8, [
      [0, h(6, 0.74), h(11, 0.65), 16, h(19, 0.7), h(26, 0.76), h(30, 0.56)],
      [h(8, 1, { timing: 0.035 }), h(15, 0.2, { probability: 0.65 }), h(24, 1, { timing: 0.035 }), h(29, 0.21)],
      [h(8, 0.52, { timing: 0.05 }), h(24, 0.58, { timing: 0.05 })],
      [h(0, 0.36), h(2, 0.64), h(3, 0.28), h(6, 0.64), h(7, 0.28), h(10, 0.64), h(11, 0.28), h(14, 0.48, { ratchet: 2 }), h(16, 0.36), h(18, 0.64), h(19, 0.28), h(22, 0.64), h(23, 0.28), h(26, 0.64), h(30, 0.44, { ratchet: 3 })],
      [h(28, 0.42, { pitch: -4 })],
      [h(4, 0.33), h(20, 0.33)],
      [h(13, 0.32, { pitch: 4 }), h(31, 0.4, { pitch: 7 })],
      [],
    ]),
  groove("seven-orders", "Seven orders",
    "Seven percussion accents walk across the backbeat; the second bar turns the phrase.", 112, 14, [
      [0, h(6, 0.82), 10, 16, h(21, 0.82), 26],
      [4, 12, 20, 28],
      [h(12, 0.4), h(28, 0.45)],
      [h(2, 0.62), h(6, 0.57), h(10, 0.62), h(14, 0.57), h(18, 0.62), h(22, 0.57), h(26, 0.62), h(30, 0.57)],
      [h(7, 0.44, { pitch: 2 }), h(23, 0.44, { pitch: -2 })],
      [h(3, 0.32), h(19, 0.32), h(31, 0.25, { probability: 0.7 })],
      [h(0, 0.55), h(5, 0.41, { pitch: 3 }), h(9, 0.49), h(14, 0.4, { pitch: -2 }), h(18, 0.55), h(23, 0.41, { pitch: 3 }), h(27, 0.49, { pitch: -2 })],
      [h(1, 0.24), h(7, 0.31), h(11, 0.24), h(15, 0.31), h(17, 0.24), h(21, 0.31), h(25, 0.24), h(29, 0.31)],
    ]),
  groove("side-burner", "Side burner",
    "A buoyant syncopated percussion weave with a steady low pulse and bright shaker accents.", 114, 6, [
      [0, h(6, 0.72), 8, h(14, 0.72), 16, h(22, 0.72), 24, h(29, 0.63)],
      [h(4, 0.75), h(12, 0.79), h(20, 0.75), h(28, 0.84)],
      [],
      [h(2, 0.43), h(6, 0.43), h(10, 0.43), h(14, 0.43), h(18, 0.43), h(22, 0.43), h(26, 0.43), h(30, 0.48)],
      [h(3, 0.52, { pitch: 3 }), h(7, 0.38, { pitch: -3 }), h(11, 0.48, { pitch: 3 }), h(15, 0.41, { pitch: -3 }), h(19, 0.52, { pitch: 3 }), h(23, 0.38, { pitch: -3 }), h(27, 0.48, { pitch: 2 }), h(31, 0.43, { pitch: -5 })],
      [h(0, 0.37), h(5, 0.53), h(10, 0.37), h(13, 0.49), h(16, 0.37), h(21, 0.53), h(26, 0.37), h(30, 0.49)],
      [h(2, 0.44, { timing: 0.03 }), h(9, 0.4), h(14, 0.44, { timing: 0.03 }), h(18, 0.44), h(25, 0.4), h(29, 0.33, { probability: 0.8 })],
      [h(0, 0.27), h(1, 0.19), h(3, 0.35), h(4, 0.27), h(5, 0.19), h(7, 0.35), h(8, 0.27), h(9, 0.19), h(11, 0.35), h(12, 0.27), h(13, 0.19), h(15, 0.35), h(16, 0.27), h(17, 0.19), h(19, 0.35), h(20, 0.27), h(21, 0.19), h(23, 0.35), h(24, 0.27), h(25, 0.19), h(27, 0.35), h(28, 0.27), h(29, 0.19), h(31, 0.4)],
    ]),
  groove("empty-plates", "Empty plates",
    "A sparse, gently lopsided pocket; every rim and quiet hat has somewhere to land.", 92, 22, [
      [0, h(10, 0.73), 16, h(27, 0.69)],
      [h(4, 0.74, { timing: 0.045 }), h(12, 0.78, { timing: 0.045 }), h(20, 0.74, { timing: 0.045 }), h(28, 0.81, { timing: 0.045 })],
      [],
      [h(2, 0.45), h(7, 0.25, { probability: 0.7 }), h(10, 0.43), h(14, 0.48), h(18, 0.45), h(23, 0.25, { probability: 0.7 }), h(26, 0.43), h(31, 0.36)],
      [],
      [h(6, 0.41), h(15, 0.27), h(22, 0.41), h(30, 0.3)],
      [h(13, 0.28, { pitch: -3 }), h(25, 0.32, { pitch: 3 })],
      [h(3, 0.2), h(11, 0.2), h(19, 0.2), h(29, 0.2)],
    ]),
  groove("rolling-boil", "Rolling boil",
    "A fast broken rhythm with restrained ghosts, pitched tom answers, and a closing hat roll.", 146, 12, [
      [0, h(5, 0.74), 10, h(14, 0.69), 16, h(21, 0.74), 26, h(31, 0.62)],
      [4, h(7, 0.2), h(9, 0.25, { timing: -0.03 }), 12, h(15, 0.23, { probability: 0.65 }), 20, h(23, 0.2), 28, h(30, 0.34, { ratchet: 2 })],
      [h(12, 0.43), h(28, 0.48)],
      [h(0, 0.4), h(2, 0.68), h(3, 0.28), h(6, 0.62), h(8, 0.4), h(10, 0.68), h(11, 0.28), h(14, 0.62), h(16, 0.4), h(18, 0.68), h(19, 0.28), h(22, 0.62), h(24, 0.4), h(26, 0.68), h(27, 0.28), h(31, 0.46, { ratchet: 4 })],
      [h(13, 0.44, { pitch: 3 }), h(15, 0.4, { pitch: -3 }), h(29, 0.52, { pitch: 5 }), h(31, 0.43, { pitch: -5 })],
      [h(6, 0.28), h(22, 0.28)],
      [h(1, 0.28), h(17, 0.28), h(25, 0.31, { pitch: 2 })],
      [h(1, 0.2), h(5, 0.24), h(9, 0.2), h(13, 0.24), h(17, 0.2), h(21, 0.24), h(25, 0.2), h(29, 0.24)],
    ]),
  groove("wrong-utensil", "Wrong utensil",
    "An off-kilter stop-start pattern: displaced accents stay anchored by a clear two-bar backbeat.", 123, 18, [
      [0, h(3, 0.71), 9, h(14, 0.8), 16, h(18, 0.68), 25, h(29, 0.76)],
      [4, h(11, 0.23, { probability: 0.75 }), 12, 20, h(23, 0.27, { timing: -0.04 }), 28],
      [h(12, 0.47, { timing: 0.04 }), h(28, 0.5, { timing: 0.04 })],
      [h(1, 0.43), h(2, 0.67), h(6, 0.61), h(7, 0.25, { probability: 0.65 }), h(10, 0.61), h(13, 0.33), h(15, 0.5, { ratchet: 2 }), h(17, 0.43), h(18, 0.67), h(22, 0.61), h(26, 0.61), h(29, 0.33), h(31, 0.47, { ratchet: 3 })],
      [h(5, 0.4, { pitch: 4 }), h(14, 0.45, { pitch: -2 }), h(21, 0.4, { pitch: 7 }), h(30, 0.45, { pitch: -4 })],
      [h(8, 0.43), h(19, 0.32), h(24, 0.43)],
      [h(6, 0.39, { pitch: -3 }), h(11, 0.28, { probability: 0.6 }), h(23, 0.37, { pitch: 3 }), h(27, 0.3)],
      [h(0, 0.2), h(5, 0.24), h(9, 0.2), h(13, 0.24), h(16, 0.2), h(21, 0.24), h(25, 0.2), h(30, 0.24)],
    ]),
];
