'use strict';
// Real CITRUS nonlinear voice and independent small-signal/circuit checks.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'dsp.js'), 'utf8'), { filename: 'citrus/dsp.js' });
const D = createCitrusDSP(), copy = value => JSON.parse(JSON.stringify(value)); let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
function near(a, b, epsilon = 1e-8) { assert(Math.abs(a - b) <= epsilon, a + ' differs from ' + b); }
function run(core, count, block = 128) {
  const l = new Float32Array(count), r = new Float32Array(count);
  for (let at = 0; at < count; at += block) core.process(l.subarray(at, at + block), r.subarray(at, at + block));
  return { left: l, right: r };
}
function rms(data, from = 0) { let sum = 0; for (let i = from; i < data.length; i++) { assert(Number.isFinite(data[i])); sum += data[i] * data[i]; } return Math.sqrt(sum / Math.max(1, data.length - from)); }
function projection(data, frequency, rate, from = 0) { let real = 0, imaginary = 0; for (let i = from; i < data.length; i++) { real += data[i] * Math.cos(2 * Math.PI * frequency * i / rate); imaginary += data[i] * Math.sin(2 * Math.PI * frequency * i / rate); } return 2 * Math.hypot(real, imaginary) / (data.length - from); }
function sineFilter(frequency, rate, g, frames = 48000) { const filter = new D.DiodeLadder(), data = new Float64Array(frames); for (let n = 0; n < frames; n++) data[n] = filter.process(1e-4 * Math.sin(2 * Math.PI * frequency * n / rate), g); return projection(data, frequency, rate, Math.floor(frames / 2)) / 1e-4; }
check('Complete stock defaults, seven face parameters and calibration boundaries normalize without mutating caller data', () => {
  assert.equal(Object.keys(D.specifications).length, 12); assert.equal(D.defaults.slideTime, .022); assert.equal(D.defaults.drift, 0); assert.equal(D.defaults.quality, 'high');
  assert.deepEqual(D.normalize(), D.defaults); assert.deepEqual(D.normalize(null), D.defaults); const bad = { cutoff: NaN, volume: 2, tune: -300, resonance: '1', wave: 'triangle' }, before = { ...bad }, normalized = D.normalize(bad);
  assert.deepEqual(bad, before); assert.equal(normalized.cutoff, 700); assert.equal(normalized.volume, 1); assert.equal(normalized.tune, -100); assert.equal(normalized.wave, 'saw');
  for (const [key, rule] of Object.entries(D.specifications)) if (typeof rule[0] === 'number') { assert.equal(D.normalize({ [key]: rule[0] })[key], rule[0]); assert.equal(D.normalize({ [key]: rule[1] })[key], rule[1]); }
});
check('The four coupled poles match the independently derived diode-ladder transfer rather than an isolated four-pole cascade', () => {
  const rate = 48000, g = .04;
  for (const frequency of [30, 100, 300, 800, 2000]) {
    const u = Math.tan(Math.PI * frequency / rate) / g, real = .5 * u ** 4 - 10 * u * u + 1, imaginary = -4 * u ** 3 + 8 * u;
    const expected = 1 / Math.hypot(real, imaginary), measured = sineFilter(frequency, rate, g);
    assert(Math.abs(measured / expected - 1) < .012, frequency + 'Hz transfer error: ' + measured + ' / ' + expected);
  }
  const low = sineFilter(3000, rate, .01), high = sineFilter(6000, rate, .01), slope = 20 * Math.log10(low / high);
  assert(slope > 22 && slope < 28, 'Four-pole stop band retains approximately 24dB/octave: ' + slope);
});
check('Both continuously running waveforms retain tuning and mono phase without oscillator retriggers', () => {
  const tones = [];
  for (const wave of ['saw', 'square']) {
    const core = new D.Core(48000, { wave, cutoff: 8000, resonance: .1, envMod: 0 }); core.noteOn({ id: 'a', pitch: 45, velocity: .8 });
    const audio = run(core, 48000); near(core.getMeters().frequencyHz, 110, 1e-8); assert(rms(audio.left) > .01); assert.deepEqual(audio.left, audio.right);
    assert(projection(audio.left, 110, 48000, 12000) > projection(audio.left, 104, 48000, 12000) * 3, wave + ' fundamental follows MIDI pitch');
    const phase = core.phase; core.noteOn({ id: 'b', pitch: 45, velocity: .8 }); assert.equal(core.phase, phase, 'Fresh envelopes do not reset the VCO.'); tones.push(audio.left);
  }
  let difference = 0; for (let i = 0; i < tones[0].length; i++) difference += Math.abs(tones[0][i] - tones[1][i]); assert(difference > 10, 'Saw and square are audibly distinct.');
});
check('Incoming slide holds both envelope histories and slews pitch exponentially with the stock 22ms time constant', () => {
  for (const rate of [8000, 44100, 48000, 192000]) {
    const core = new D.Core(rate); core.noteOn({ id: 'a', pitch: 36, velocity: .7, accent: true }); run(core, Math.round(rate * .08));
    const before = core.getMeters(); core.noteOn({ id: 'b', pitch: 48, velocity: .8, accent: false, slide: true }); const tied = core.getMeters();
    assert.equal(tied.mainEnvelope, before.mainEnvelope); assert.equal(tied.volumeEnvelope, before.volumeEnvelope); assert.equal(tied.phase, before.phase); assert.equal(tied.accentCap, before.accentCap);
    assert.equal(core.noteOff('a'), false, 'The predecessor cannot close the tied destination.'); const frames = Math.round(rate * .022); run(core, frames, 137);
    near(core.currentPitch, 48 - 12 * Math.exp(-frames / (rate * .022)), 1e-7);
    core.noteOn({ id: 'c', pitch: 36, velocity: .8, slide: false }); assert.equal(core.currentPitch, 36); assert.equal(core.mainEnvelope, 1); assert.equal(core.volumeEnvelope, 1);
  }
});
check('Accent uses its fixed short MEG and independent VCA and resonance-coupled charge memory', () => {
  const normal = new D.Core(48000, { decay: 2 }), accented = new D.Core(48000, { decay: 2 });
  normal.noteOn({ id: 'n', pitch: 36, velocity: .8 }); accented.noteOn({ id: 'a', pitch: 36, velocity: .8, accent: true }); run(normal, 4800); run(accented, 4800);
  near(normal.mainEnvelope, Math.exp(-.1 / 2), 1e-10); near(accented.mainEnvelope, Math.exp(-.1 / .2), 1e-10);
  assert(accented.accentVca > .5 && normal.accentVca === 0); assert(accented.accentCap > .1 && normal.accentCap === 0);
  const sequence = new D.Core(48000, { resonance: 1 }), peaks = [];
  for (let i = 0; i < 4; i++) { sequence.noteOn({ id: 'accent-' + i, pitch: 36, velocity: .8, accent: true }); run(sequence, 1440); peaks.push(sequence.accentCap); }
  assert(peaks[1] > peaks[0] && peaks[2] > peaks[1], 'Repeated accents retain and build capacitor charge.');
  const high = new D.Core(48000, { resonance: 1 }), low = new D.Core(48000, { resonance: 0 });
  for (const core of [high, low]) { core.noteOn({ id: 'x', pitch: 36, velocity: .8, accent: true }); run(core, 480); }
  assert(low.accentCap > high.accentCap, 'The second resonance-pot section changes sweep charging time.');
  assert(high.accentVca > 0 && low.accentVca > 0);
});
check('The stock unaccented VCA has a short onset, 8ms off hold and 8ms release; stale offs and Panic stay safe', () => {
  const core = new D.Core(48000, { resonance: 0, cutoff: 8000 }); core.noteOn({ id: 'a', pitch: 36, velocity: .8 });
  const onset = run(core, 191); assert(onset.left.every(value => value === 0), 'The non-accented gate has the modeled stock onset delay.'); run(core, 4800);
  const prior = core.vegetableGain; core.noteOff('a'); run(core, 384); near(core.vegetableGain, prior); run(core, 385); near(core.vegetableGain, 0);
  core.noteOn({ id: 'b', pitch: 40, velocity: .9 }); assert.equal(core.noteOff('a'), false); assert.equal(core.gate, true);
  core.panic(); assert(run(core, 2048).left.every(value => value === 0)); assert.equal(core.accentCap, 0); assert.equal(core.gate, false);
});
check('Released voices settle to an exact idle path, retain current patch and can start a fresh note', () => {
  for (const accent of [false, true]) {
    const core = new D.Core(48000, { resonance: .9 }); core.noteOn({ id: 'release', pitch: 36, velocity: .8, accent }); run(core, 2400); core.noteOff('release');
    run(core, 48000 * 4); assert.equal(core.running, false, 'Natural release does not leave an idle nonlinear voice running forever.');
    assert(run(core, 1000).left.every(value => value === 0)); assert.equal(core.params.resonance, .9);
    core.noteOn({ id: 'again', pitch: 43, velocity: .8 }); assert(rms(run(core, 4800).left) > .005);
  }
});
check('Arbitrary process partitions are identical at 8/44.1/48/192kHz, including slide, accents and patch changes', () => {
  for (const rate of [8000, 44100, 48000, 192000]) for (const quality of ['eco', 'high']) {
    const cores = [new D.Core(rate, { quality, drift: .4 }), new D.Core(rate, { quality, drift: .4 })], outputs = [];
    for (let index = 0; index < cores.length; index++) {
      const core = cores[index], chunks = [];
      core.noteOn({ id: 'first', pitch: 28, velocity: .75, accent: true }); chunks.push(run(core, 1771, index ? 137 : 128).left);
      core.noteOn({ id: 'tied', pitch: 67, velocity: .9, slide: true }); chunks.push(run(core, 1327, index ? 251 : 128).left);
      core.setState({ cutoff: 2300, resonance: .93, tune: 13, wave: 'square' }); chunks.push(run(core, 1779, index ? 31 : 128).left);
      core.noteOff('tied'); chunks.push(run(core, 1451, index ? 257 : 128).left); outputs.push(Float32Array.from(chunks.flatMap(chunk => [...chunk])));
    }
    assert.deepEqual(outputs[0], outputs[1], rate + 'Hz ' + quality); assert(outputs[0].every(value => Number.isFinite(value) && Math.abs(value) <= 1.1));
  }
});
check('High quality suppresses folded ultrasonic oscillator energy compared with Eco without a hidden loudness controller', () => {
  const aliases = [];
  for (const quality of ['eco', 'high']) {
    const core = new D.Core(48000, { quality, cutoff: 8000, resonance: .9, envMod: 0, decay: .2, filterDrive: 2 });
    core.noteOn({ id: 'stress', pitch: 69 + 12 * Math.log2(7800 / 440), velocity: .8 }); const audio = run(core, 96000).left;
    const fundamental = projection(audio, 7800, 48000, 48000), fold13 = projection(audio, 5400, 48000, 48000), fold25 = projection(audio, 3000, 48000, 48000);
    aliases.push((fold13 * fold13 + fold25 * fold25) / (fundamental * fundamental));
  }
  assert(aliases[1] < aliases[0] * .25, 'High should reduce this two-bin folded-energy stress measurement by at least 6dB: ' + JSON.stringify(aliases));
  const quiet = new D.Core(48000, { volume: 0 }); quiet.noteOn({ id: 'quiet', pitch: 36, accent: true }); assert(run(quiet, 4800).left.every(value => value === 0));
  console.log('  Folded-energy stress improvement:', (10 * Math.log10(aliases[0] / aliases[1])).toFixed(1), 'dB');
});
check('The factory serializes into an isolated audio realm, and extreme patches remain bounded and causal', () => {
  const isolated = vm.runInNewContext('(' + createCitrusDSP.toString() + ')', {})(), core = new isolated.Core(48000), canonical = new D.Core(48000);
  for (const voice of [core, canonical]) voice.noteOn({ id: 'same', pitch: 36, velocity: .8, accent: true }); assert.deepEqual(run(core, 4096).left, run(canonical, 4096).left);
  for (const rate of [8000, 192000]) for (const wave of ['saw', 'square']) {
    const patch = Object.fromEntries(Object.entries(D.specifications).map(([key, value]) => [key, typeof value[0] === 'number' ? value[1] : value[0]])); patch.wave = wave;
    const extreme = new D.Core(rate, patch); extreme.noteOn({ id: 'edge', pitch: 127, velocity: 1, accent: true }); const audio = run(extreme, 4096).left;
    assert(audio.every(value => Number.isFinite(value) && Math.abs(value) < 1.1)); extreme.noteOff('edge'); extreme.panic(); assert(run(extreme, 128).left.every(value => value === 0));
  }
});
console.log(passed + ' CITRUS circuit, articulation, signal and aliasing groups passed.');
