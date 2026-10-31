import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDsp } from "./dsp-loader.mjs";
const form = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shared = existsSync(resolve(form, "shared/voice-effects.js")) ? resolve(form, "shared") : resolve(form, "../shared");
const galley = existsSync(resolve(shared, "galley-effects/effects.js")) ? resolve(shared, "galley-effects") : resolve(form, "../loom");
globalThis.window = globalThis;
for (const name of ["vocal-catalog.js", "utility-catalog.js", "filter-catalog.js", "creative-catalog.js", "preamp-catalog.js", "tape-catalog.js", "char-catalog.js", "effects-catalog.js", "vocal-dsp.js", "utility-dsp.js", "filter-dsp.js", "creative-dsp.js", "broiler-pedals.js", "compressor-dsp.js", "preamp-dsp.js", "tape-dsp.js", "char-dsp.js", "effects.js"]) vm.runInThisContext(readFileSync(resolve(galley, name), "utf8"), { filename: name });
vm.runInThisContext(readFileSync(resolve(shared, "voice-effects.js"), "utf8"), { filename: "voice-effects.js" });
const { audio, "voice-effects": helpers, cleanup } = await loadDsp(["audio", "voice-effects"]);
after(cleanup);
const { cloneParams, sanitizeParams, renderSound, renderVoiceStereo, renderPattern, renderExactPatternEvents, renderNativeEvents, AudioEngine } = audio;
const fx = (type, patch = {}) => ({ type, params: { ...LoomEffectsCatalog.find(effect => effect.id === type).defaults, ...patch } });
function sound() { const value = cloneParams(audio.ARCHIVE_PRESETS[0].params); value.tone.decay = 70; value.tone.release = 10; value.noise.level = 0; value.effects.reverb = 0; value.effects.delay = 0; value.mix.volume = .06; delete value.architecture; return value; }
const peak = values => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
function difference(a, b) { let sum = 0, max = 0; for (let i = 0; i < a.length; i++) { sum += (a[i] - b[i]) ** 2; max = Math.max(max, Math.abs(a[i] - b[i])); } return { rms: Math.sqrt(sum / a.length), max }; }

test("legacy empty racks normalize independently and malformed supplied snapshots reject", () => {
  const before = sound(); delete before.galleyFx;
  const first = sanitizeParams(before), second = sanitizeParams(before);
  assert.deepEqual(first.galleyFx, [null, null]); assert.notEqual(first.galleyFx, second.galleyFx);
  for (const value of [null, [], [null], [null, null, null], [{ type: "missing", params: {} }, null]]) assert.throws(() => sanitizeParams({ ...before, galleyFx: value }));
  for (const patch of [{ cutoff: "100" }, { cutoff: 1e6 }, { bypass: "false" }]) assert.throws(() => sanitizeParams({ ...before, galleyFx: [fx("prism", patch), null] }));
  const missing = fx("prism"); delete missing.params.mid; assert.throws(() => sanitizeParams({ ...before, galleyFx: [missing, null] }));
  const p = { ...before, galleyFx: [fx("velvet", { model: "opto-2a" }), fx("saute", { model: "tube-610" })] };
  const copied = cloneParams(p); assert.deepEqual(copied.galleyFx, p.galleyFx); copied.galleyFx[0].params.threshold = -40; assert.notEqual(copied.galleyFx[0].params.threshold, p.galleyFx[0].params.threshold);
});

test("the native mono synthesis and cache identity remain dry when rack controls change", () => {
  const dry = sound(), wet = { ...dry, galleyFx: [fx("cinder", { drive: 30, mix: 1 }), fx("vestige")] };
  assert.deepEqual(renderSound(dry, 16000), renderSound(wet, 16000));
  assert.equal(helpers.drySignature(dry), helpers.drySignature(wet));
  const engine = new AudioEngine(); engine.context = { sampleRate: 16000, createBuffer: (_, n, rate) => { const data = new Float32Array(n); return { sampleRate: rate, getChannelData: () => data }; } };
  assert.equal(engine.cachedBuffer(dry), engine.cachedBuffer(wet), "editing an FX parameter should not render a new source sample");
});

test("all sixteen canonical GALLEY models render finite stereo one shots", () => {
  assert.equal(LoomEffectsCatalog.length, 16);
  for (const definition of LoomEffectsCatalog) {
    const base = sound(), source = JSON.stringify(base);
    const channels = renderVoiceStereo({ ...base, galleyFx: [fx(definition.id), null] }, 8000, 123, 0);
    assert.equal(channels.length, 2); assert.equal(channels[0].length, channels[1].length);
    assert(channels.every(channel => channel.every(Number.isFinite)), definition.name);
    assert(peak(channels[0]) > 0 || peak(channels[1]) > 0, definition.name);
    assert.equal(JSON.stringify(base), source);
  }
});

test("overlapping strikes share one persistent nonlinear voice chain and do not colour another voice", () => {
  const base = sound(), slots = [fx("velvet", { threshold: -48, ratio: 16, attack: .2, release: 1500, makeup: 0, mix: 1 }), fx("cinder", { drive: 18, output: -6, mix: 1 })];
  const steps = Array.from({ length: 16 }, (_, i) => i < 5), tracks = [{ params: base, steps }];
  const dry = renderPattern(tracks, 180, { sampleRate: 16000, tail: false });
  const expected = dry.map(channel => channel.slice()); helpers.processVoiceFx(slots, expected[0], expected[1], 16000, 180);
  const actual = renderPattern([{ params: { ...base, galleyFx: slots }, steps }], 180, { sampleRate: 16000, tail: false });
  assert.deepEqual(actual, expected, "chain must process the complete voice sum exactly once");
  const other = sound(); other.mix.pan = .8; other.tone.frequency = 913;
  const second = { params: other, steps: steps.map((_, i) => i === 2 || i === 8) }, isolated = renderPattern([second], 180, { sampleRate: 16000, tail: false });
  const mixed = renderPattern([{ params: { ...base, galleyFx: slots }, steps }, second], 180, { sampleRate: 16000, tail: false });
  for (let channel = 0; channel < 2; channel++) assert.deepEqual(mixed[channel], Float32Array.from(actual[channel], (value, i) => value + isolated[channel][i]));
});

test("stereo wet one shots retain native timing, spatial tails and exact bypass", () => {
  const base = sound(), slots = [fx("parallax", { clock: "free", time: 120, feedback: .6, spread: 1, mix: 1 }), null];
  const dry = renderVoiceStereo(base, 16000), wet = renderVoiceStereo({ ...base, galleyFx: slots }, 16000);
  assert(wet[0].length > dry[0].length + 16000 / 2); assert(peak(wet[0].subarray(dry[0].length)) > 1e-5 || peak(wet[1].subarray(dry[1].length)) > 1e-5);
  assert.deepEqual(renderVoiceStereo({ ...base, galleyFx: [fx("parallax", { bypass: true }), null] }, 16000), dry);
  const instant = renderVoiceStereo({ ...base, galleyFx: [fx("saute", { model: "clean", drive: 0, colour: 0 }), null] }, 16000, 120, 0);
  for (let c = 0; c < 2; c++) assert.equal(difference(instant[c], dry[c]).max, 0, "the transparent preamp adds no buffer latency");
});

test("exact-note and hosted print paths retain source FX before master gain", async () => {
  const base = sound(), wet = { ...base, galleyFx: [fx("cinder", { drive: 24, output: -6, mix: 1 }), null] }, events = [{ voice: 0, at: .125, velocity: .7 }, { voice: 0, at: .15, velocity: .6 }];
  const full = renderExactPatternEvents([wet], events, { durationSeconds: 1, tailSeconds: .4, sampleRate: 16000, master: 1, tempo: 105 });
  const quiet = renderExactPatternEvents([wet], events, { durationSeconds: 1, tailSeconds: .4, sampleRate: 16000, master: .2, tempo: 105 });
  for (let c = 0; c < 2; c++) assert(difference(Float32Array.from(full[c], x => x * .2), quiet[c]).max < 2e-8);
  const printed = await renderNativeEvents([wet], events, { durationSeconds: 1, tailSeconds: .4, master: .2, tempo: 105 });
  const exact = renderExactPatternEvents([wet], events, { durationSeconds: 1, tailSeconds: .4, sampleRate: 48000, master: .2, tempo: 105 });
  for (let frame = 0; frame < exact[0].length - 1440; frame++) for (let c = 0; c < 2; c++) assert.equal(printed.pcm[frame * 2 + c], exact[c][frame]);
  const controller = new AbortController(), promise = renderNativeEvents([wet], events, { durationSeconds: 4, tailSeconds: 2, signal: controller.signal }); setTimeout(() => controller.abort(), 0);
  await assert.rejects(promise, error => error.name === "AbortError");
});

test("live scheduling routes the explicit burner index, retains dry cache, clock continuity and cleanup", async () => {
  const realApi = globalThis.KitchenVoiceEffects, realContext = globalThis.AudioContext;
  const parameter = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v, at) { this.value = v; this.rampEnd = at; }, cancelScheduledValues() {} });
  const node = () => ({ connections: [], connect(next) { this.connections.push(next); return next; }, disconnect() { this.connections = []; } });
  class Context {
    state = "running"; currentTime = 1; sampleRate = 8000; destination = node();
    createGain() { return Object.assign(node(), { gain: parameter() }); }
    createDynamicsCompressor() { return Object.assign(node(), Object.fromEntries(["threshold", "knee", "ratio", "attack", "release"].map(key => [key, parameter()]))); }
    createStereoPanner() { return Object.assign(node(), { pan: parameter() }); }
    createBufferSource() { return Object.assign(node(), { playbackRate: parameter(), start(at) { this.started = at; }, stop(at) { (this.stops ||= []).push(at); } }); }
    createBuffer(_, frames, rate) { const data = new Float32Array(frames); return { duration: frames / rate, sampleRate: rate, getChannelData: () => data }; }
    async resume() {} async close() { this.state = "closed"; }
  }
  const routes = [], clocks = [], settings = [], bank = {
    setVoice(index, slots) { settings.push({ index, slots }); }, input() { return node(); },
    connectSource(index, source) { routes.push({ index, source, detached: false }); const entry = routes.at(-1); return () => { entry.detached = true; }; },
    setClock(clock) { clocks.push({ ...clock }); }, setAudible() {}, reset() { this.resets = (this.resets || 0) + 1; }, dispose() { this.disposed = true; }, getMeters(index) { return [{ index }]; },
  };
  globalThis.AudioContext = Context;
  globalThis.KitchenVoiceEffects = { ...realApi, prepare: async () => {}, createBank: () => bank };
  const engine = new AudioEngine();
  try {
    const sounds = Array.from({ length: 8 }, sound); sounds[3].galleyFx = [fx("cinder", { mix: 1 }), null];
    engine.setVoiceState(sounds, 120); await engine.play(sounds[3], .7, 1.1, 0, undefined, 3);
    assert.equal(routes.at(-1).index, 3); assert.equal(settings.filter(value => value.index === 3).at(-1).slots[0].type, "cinder");
    const cached = engine.cachedBuffer(sounds[3]), changed = cloneParams(sounds[3]); changed.galleyFx[0].params.drive = 24;
    const count = clocks.length; engine.setVoiceState(sounds.map((p, i) => i === 3 ? changed : p), 120);
    assert.equal(clocks.length, count, "FX editing must not restart synced modulation"); assert.equal(engine.cachedBuffer(changed), cached);
    engine.setVoiceClock({ tempo: 120, beat: 8, time: 1, playing: true }); engine.audioContext.currentTime = 1.5; engine.setVoiceState(sounds, 90);
    assert.equal(clocks.at(-1).beat, 9); assert.equal(clocks.at(-1).tempo, 90);
    assert.deepEqual(engine.getVoiceEffectMeters(3), [{ index: 3 }]);
    const resets = bank.resets || 0;
    engine.followTransport({ tempo: 90, beat: 9, when: 1.5, revision: 1, playing: true });
    engine.followTransport({ tempo: 90, beat: 10, when: 2, revision: 1, playing: true });
    assert.equal(bank.resets || 0, resets, "ordinary host anchors must preserve FX history");
    engine.followTransport({ tempo: 90, beat: 0, when: 2, revision: 2, playing: true });
    assert.equal(bank.resets, resets + 1, "host seek must clear old voice FX history");
    engine.followTransport({ tempo: 90, beat: 0, when: 2, revision: 2, playing: false });
    assert.equal(bank.resets, resets + 2, "host stop must clear old voice FX history");
    engine.followTransport({ tempo: 90, beat: 0, when: 2, revision: 2, playing: false });
    assert.equal(bank.resets, resets + 2, "repeated stopped anchors must not repeatedly reset FX");
    const source = [...engine.sources][0];
    engine.followTransport({ tempo: 90, beat: 0, when: 1.5, revision: 3, playing: true });
    engine.cancelNativeNotes({ source: "native", when: 1.5 });
    assert.equal(source.stops.at(-1), 1.509);
    engine.schedulePrepared(sound(), .5, 1.5, 0, "dry", undefined, 0);
    const drySource = [...engine.sources].at(-1); engine.cancelNativeNotes({ source: "dry", when: 1.5 });
    engine.schedulePrepared(sounds[3], .5, 1.506, 0, "new-epoch", undefined, 3);
    const freshSource = [...engine.sources].at(-1);
    engine.followTransport({ tempo: 90, beat: 0, when: 1.505, revision: 4, playing: true });
    assert.equal(source.stops.at(-1), 1.505, "an old cancelled FX fade must stop feeding the reset rack at a seek boundary");
    assert.equal(engine.sourceNotes.get(source).gain.gain.rampEnd, 1.505);
    assert.equal(drySource.stops.at(-1), 1.509, "empty native cancellation keeps its original fade");
    assert.equal(freshSource.stops?.length || 0, 0, "new queued notes must not be cut by old-epoch cleanup");
    const calls = source.stops.length;
    engine.followTransport({ tempo: 90, beat: 0, when: 1.7, revision: 5, playing: true });
    assert.equal(source.stops.length, calls, "a later clock boundary must not extend an already completed cancellation");
    engine.audioContext.currentTime = 1.6;
    engine.cancelNativeNotes({ source: "new-epoch" });
    engine.followTransport({ tempo: 90, beat: 0, when: 1.6, revision: 5, playing: false });
    assert.equal(freshSource.stops.at(-1), 1.6, "global stop also closes a cancelled FX source before reset");
    source.onended(); assert.equal(routes[0].detached, true);
    engine.stopAll(); assert(bank.resets > 0); await engine.close(); assert.equal(bank.disposed, true);
  } finally { globalThis.KitchenVoiceEffects = realApi; globalThis.AudioContext = realContext; }
});
