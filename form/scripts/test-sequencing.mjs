import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadDsp } from "./dsp-loader.mjs";

const { sequencing, grooves, audio, cleanup } = await loadDsp(["sequencing", "grooves", "audio"]);
after(cleanup);
const { STEP_DEFAULTS, createStepDetails, normalizeStepDetail, normalizeStepDetails, eventsForStep } = sequencing;
const { FACTORY_GROOVES } = grooves;

const grid = (length = 16, voices = 8) => Array.from({ length: voices }, () => Array(length).fill(false));
const close = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);
const context = (steps, details, step, cycle = 0, bpm = 120, swing = 0, seed, fill = false) =>
  eventsForStep(steps, details, step, cycle, bpm, swing, seed, fill);

test("absent step details preserve legacy downbeat accents and create independent objects", () => {
  const steps = grid();
  const details = createStepDetails(steps);
  assert.equal(details.length, 8);
  assert.deepEqual(details.map(row => row.length), Array(8).fill(16));
  assert.equal(details[0][0].velocity, 1);
  assert.equal(details[0][1].velocity, 0.86);
  assert.equal(details[0][4].velocity, 1);
  assert.deepEqual(details[0][0], STEP_DEFAULTS);
  details[0][0].velocity = 0.2;
  assert.equal(details[0][4].velocity, 1);
  assert.equal(details[1][0].velocity, 1);
  steps[0][1] = true;
  assert.equal(context(steps, undefined, 1)[0].velocity, 0.86);
});

test("normalization bounds finite controls, rounds discrete controls, and aligns malformed dimensions", () => {
  assert.deepEqual(normalizeStepDetail({ velocity: 7, probability: -1, ratchet: 9, timing: -9, pitch: 8.8 }, 3),
    { velocity: 1, probability: 0, ratchet: 4, timing: -0.45, pitch: 9 });
  assert.deepEqual(normalizeStepDetail({ velocity: NaN, probability: Infinity, ratchet: "4", timing: null, pitch: -Infinity }, 3),
    { velocity: 0.86, probability: 1, ratchet: 1, timing: 0, pitch: 0 });
  for (const invalid of [null, 4, "oops", [1], undefined]) assert.deepEqual(normalizeStepDetail(invalid), STEP_DEFAULTS);
  const steps = [[true, false, true], [], [false]];
  const source = [[{ velocity: 0.31 }], "bad", [{ ratchet: 2.5 }], [{ pitch: 100 }]];
  const copy = structuredClone(source);
  const details = normalizeStepDetails(steps, source);
  assert.deepEqual(details.map(row => row.length), [3, 0, 1]);
  assert.equal(details[0][0].velocity, 0.31);
  assert.equal(details[0][1].velocity, 0.86);
  assert.equal(details[2][0].ratchet, 3);
  assert.deepEqual(source, copy);
});

test("swing places odd hits later while every beat and loop retains its exact duration", () => {
  const steps = grid(); steps[0].fill(true);
  const starts = Array.from({ length: 16 }, (_, step) => step * 0.125 + context(steps, undefined, step, 0, 120, 40)[0].offset);
  close(starts[0], 0);
  close(starts[1], 0.175);
  close(starts[2], 0.25);
  close(starts[3], 0.425);
  for (let step = 0; step < 15; step++) close(starts[step + 1] - starts[step], step % 2 ? 0.075 : 0.175);
  close(16 * 0.125 + context(steps, undefined, 0, 1, 120, 40)[0].offset, 2);
});

test("ratchets stay inside both swung gaps rather than assuming equal step durations", () => {
  const steps = grid(); steps[0].fill(true);
  const details = createStepDetails(steps);
  details[0][0].ratchet = 4;
  details[0][1].ratchet = 4;
  const even = context(steps, details, 0, 0, 120, 40);
  const odd = context(steps, details, 1, 0, 120, 40);
  assert.equal(even.length, 4); assert.equal(odd.length, 4);
  even.forEach((event, index) => { close(event.offset, index * 0.175 / 4); assert.equal(event.ratchetIndex, index); });
  odd.forEach((event, index) => close(event.offset, 0.05 + index * 0.075 / 4));
  assert.ok(even.at(-1).offset < 0.175);
  assert.ok(odd.at(-1).offset < 0.125);
});

test("signed microtiming can precede nominal start, with a single safe initial loop clamp", () => {
  const steps = grid(); steps[0][0] = steps[0][2] = true;
  const details = createStepDetails(steps);
  details[0][0].timing = details[0][2].timing = -0.4;
  close(context(steps, details, 0, 0)[0].offset, 0);
  close(context(steps, details, 0, 1)[0].offset, -0.05);
  close(context(steps, details, 2, 0)[0].offset, -0.05);
  assert.ok(2 * 0.125 + context(steps, details, 2)[0].offset > 0);
});

test("late timing and extreme swing cannot move a ratchet past the next swung start", () => {
  const steps = grid(); steps[0][1] = true;
  const details = createStepDetails(steps);
  Object.assign(details[0][1], { timing: 0.45, ratchet: 4 });
  const events = context(steps, details, 1, 0, 30, 75);
  assert.equal(events.length, 4);
  assert.ok(events.every(event => event.offset >= 0.375 && event.offset < 0.5));
  assert.ok(events.every((event, index) => !index || event.offset > events[index - 1].offset));
});

test("probability is deterministic by parent step, independent of call order, and varies across cycles", () => {
  const steps = grid(); steps.forEach(row => row.fill(true));
  const details = createStepDetails(steps);
  details.forEach(row => row.forEach(detail => Object.assign(detail, { probability: 0.5, ratchet: 4 })));
  const state = JSON.stringify(details);
  const forward = Array.from({ length: 16 }, (_, step) => context(steps, details, step, 3, 123, 19, 98765));
  const backward = Array.from({ length: 16 }, (_, index) => context(steps, details, 15 - index, 3, 123, 19, 98765)).reverse();
  assert.deepEqual(forward, backward);
  const otherLoop = Array.from({ length: 16 }, (_, step) => context(steps, details, step, 4, 123, 19, 98765));
  const otherSeed = Array.from({ length: 16 }, (_, step) => context(steps, details, step, 3, 123, 19, 98766));
  assert.notDeepEqual(forward, otherLoop);
  assert.notDeepEqual(forward, otherSeed);
  for (const events of forward) for (let voice = 0; voice < 8; voice++) assert.ok([0, 4].includes(events.filter(event => event.voice === voice).length));
  assert.equal(JSON.stringify(details), state);
});

test("probability zero and silent velocity emit no hits; probability one always emits the full group", () => {
  const steps = grid(); steps[0][0] = steps[1][0] = steps[2][0] = true;
  const details = createStepDetails(steps);
  Object.assign(details[0][0], { probability: 0, ratchet: 4 });
  Object.assign(details[1][0], { velocity: 0, ratchet: 4 });
  Object.assign(details[2][0], { probability: 1, ratchet: 3, velocity: 0.37, pitch: -7 });
  for (let cycle = 0; cycle < 20; cycle++) {
    const events = context(steps, details, 0, cycle);
    assert.equal(events.length, 3);
    assert.ok(events.every(event => event.voice === 2 && event.velocity === 0.37 && event.pitch === -7));
  }
});

test("muting one voice does not reroll another voice's probability", () => {
  const steps = grid(); steps[0].fill(true); steps[6].fill(true);
  const details = createStepDetails(steps);
  details[6].forEach(detail => detail.probability = 0.57);
  const muted = steps.map((row, voice) => voice === 0 ? row.map(() => false) : [...row]);
  for (let cycle = 0; cycle < 3; cycle++) for (let step = 0; step < 16; step++) {
    assert.deepEqual(context(steps, details, step, cycle).filter(event => event.voice === 6), context(muted, details, step, cycle));
  }
});

test("Fill is ephemeral, touches only active closing hits, and respects probability and existing ratchets", () => {
  const steps = grid(32); [24, 28, 29, 30].forEach(step => steps[0][step] = true);
  const details = createStepDetails(steps);
  details[0][29].ratchet = 3;
  details[0][30].probability = 0;
  const before = JSON.stringify({ steps, details });
  assert.equal(context(steps, details, 24, 0, 120, 0, undefined, true).length, 1);
  assert.equal(context(steps, details, 28, 0, 120, 0, undefined, true).length, 2);
  assert.equal(context(steps, details, 29, 0, 120, 0, undefined, true).length, 3);
  assert.equal(context(steps, details, 30, 0, 120, 0, undefined, true).length, 0);
  assert.equal(context(steps, details, 31, 0, 120, 0, undefined, true).length, 0);
  assert.equal(context(steps, details, 28).length, 1);
  assert.equal(JSON.stringify({ steps, details }), before);
});

test("ragged or empty grids and nonfinite scheduling arguments remain bounded", () => {
  assert.deepEqual(eventsForStep([], undefined, 0, 0, 120, 0), []);
  assert.deepEqual(eventsForStep([[]], undefined, NaN, Infinity, NaN, NaN), []);
  const steps = [[true], [false, true], []];
  assert.deepEqual(context(steps, undefined, 1).map(event => event.voice), [0, 1]);
  for (const value of [-Infinity, NaN, Infinity]) {
    const events = context(steps, undefined, value, value, value, value, value);
    assert.ok(events.length && events.every(event => Object.values(event).every(Number.isFinite)));
  }
});

test("twelve complete factory grooves have genuine second-bar changes and distinct musical fingerprints", () => {
  assert.equal(FACTORY_GROOVES.length, 12);
  assert.equal(new Set(FACTORY_GROOVES.map(value => value.id)).size, 12);
  assert.equal(new Set(FACTORY_GROOVES.map(value => JSON.stringify(value.steps))).size, 12);
  let expressiveHits = 0;
  for (const groove of FACTORY_GROOVES) {
    assert.ok(groove.description.length >= 50);
    assert.ok(groove.tempo >= 70 && groove.tempo <= 150);
    assert.ok(groove.swing >= 0 && groove.swing <= 60);
    assert.equal(groove.length, 32);
    assert.equal(groove.steps.length, 8);
    assert.equal(groove.stepDetails.length, 8);
    assert.ok(groove.steps.every(row => row.length === groove.length && row.every(value => typeof value === "boolean")));
    assert.deepEqual(groove.stepDetails, normalizeStepDetails(groove.steps, groove.stepDetails));
    assert.notEqual(JSON.stringify(groove.steps.map(row => row.slice(0, 16))), JSON.stringify(groove.steps.map(row => row.slice(16))));
    assert.ok(groove.steps[0].some(Boolean), `${groove.name} has no kick`);
    assert.ok(groove.steps[1].some(Boolean), `${groove.name} has no backbeat`);
    for (let voice = 0; voice < 8; voice++) for (let step = 0; step < 32; step++) {
      if (!groove.steps[voice][step]) continue;
      const detail = groove.stepDetails[voice][step];
      if (detail.ratchet > 1 || detail.probability < 1 || detail.pitch || detail.timing) expressiveHits++;
    }
    for (let step = 0; step < 32; step++) {
      const events = context(groove.steps, groove.stepDetails, step, 0, groove.tempo, groove.swing);
      assert.ok(events.every(event => event.offset > -1 && event.offset < 1 && event.velocity > 0));
    }
  }
  assert.ok(expressiveHits >= 70, `Only ${expressiveHits} expressive hits`);
  assert.equal(FACTORY_GROOVES[0].id, "opening-service");
});

test("the production WAV renderer agrees sample-for-sample with helper-scheduled pitched stereo hits", () => {
  const sampleRate = 8000, bpm = 125, swing = 35, bars = 2;
  const sounds = [audio.PRESETS.find(value => value.id === "dry-snap").params,
    audio.PRESETS.find(value => value.id === "sub-foundation").params].map(audio.cloneParams);
  sounds[0].mix.volume = sounds[1].mix.volume = 0.13;
  sounds[0].mix.pan = -0.45; sounds[1].mix.pan = 0.25;
  const steps = grid(16, 2);
  [0, 3, 7, 10, 15].forEach(step => steps[0][step] = true);
  [0, 6, 11, 14].forEach(step => steps[1][step] = true);
  const details = createStepDetails(steps);
  Object.assign(details[0][0], { velocity: 0.67, pitch: 3, timing: -0.2 });
  Object.assign(details[0][3], { velocity: 0.42, pitch: -5, ratchet: 3, timing: -0.06 });
  Object.assign(details[0][7], { velocity: 0.37, probability: 0.45, pitch: 7, ratchet: 2 });
  Object.assign(details[0][15], { velocity: 0.53, timing: 0.15 });
  Object.assign(details[1][0], { velocity: 0.6, pitch: -4 });
  Object.assign(details[1][11], { velocity: 0.4, probability: 0.6, pitch: 5, ratchet: 2 });
  const tracks = sounds.map((params, voice) => ({ params, steps: steps[voice], stepDetails: details[voice] }));
  const actual = audio.renderPattern(tracks, bpm, { sampleRate, bars, swing: swing / 100, tail: false });
  const frames = Math.ceil(16 * bars * 15 / bpm * sampleRate);
  const expected = [new Float32Array(frames), new Float32Array(frames)];
  const rendered = sounds.map(sound => audio.renderSound(sound, sampleRate));
  for (let absolute = 0; absolute < 16 * bars; absolute++) {
    const events = context(steps, details, absolute % 16, Math.floor(absolute / 16), bpm, swing);
    for (const event of events) {
      const samples = rendered[event.voice], rate = 2 ** (event.pitch / 12);
      const pan = sounds[event.voice].mix.pan;
      const gains = [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];
      const offset = Math.round((absolute * 15 / bpm + event.offset) * sampleRate);
      const count = Math.min(frames - offset, Math.ceil(samples.length / rate));
      for (let frame = 0; frame < count; frame++) {
        const position = frame * rate, index = Math.floor(position), fraction = position - index;
        const sample = (samples[index] ?? 0) * (1 - fraction) + (samples[index + 1] ?? 0) * fraction;
        expected[0][offset + frame] += sample * gains[0] * event.velocity;
        expected[1][offset + frame] += sample * gains[1] * event.velocity;
      }
    }
  }
  assert.equal(actual[0].length, frames);
  let maximumDifference = 0, peak = 0;
  for (let channel = 0; channel < 2; channel++) for (let frame = 0; frame < frames; frame++) {
    maximumDifference = Math.max(maximumDifference, Math.abs(actual[channel][frame] - expected[channel][frame]));
    peak = Math.max(peak, Math.abs(actual[channel][frame]));
  }
  assert.ok(peak > 0.01 && peak < 1, `Invalid audible peak ${peak}`);
  assert.ok(maximumDifference < 2e-7, `Live/export helper mismatch ${maximumDifference}`);
});

test("every new factory groove renders audible finite PCM with the current default eight-burner kit", () => {
  const sounds = audio.buildDefaultKit();
  for (const groove of FACTORY_GROOVES) {
    const rendered = audio.renderPattern(sounds.map((params, voice) => ({ params, steps: groove.steps[voice], stepDetails: groove.stepDetails[voice] })),
      groove.tempo, { sampleRate: 8000, swing: groove.swing / 100, tail: false });
    let peak = 0, power = 0;
    for (const channel of rendered) for (const sample of channel) {
      assert.ok(Number.isFinite(sample), groove.name);
      peak = Math.max(peak, Math.abs(sample)); power += sample * sample;
    }
    assert.ok(peak > 0.1 && peak <= 1.001, `${groove.name}: peak ${peak}`);
    assert.ok(Math.sqrt(power / (rendered[0].length * 2)) > 0.01, `${groove.name} too quiet`);
  }
});
