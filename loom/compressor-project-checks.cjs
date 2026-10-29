'use strict';
// Portable source checks: released Clean PCM fixtures need no Git history.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
globalThis.window = globalThis;
for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'effects.js', 'schema.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
}
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'compressor-legacy-fixtures.json'), 'utf8'));
const definition = LoomEffectsCatalog.find(effect => effect.id === 'velvet');
const dsp = createLoomEffectsDSP();
const added = ['model', 'input', 'colour', 'timing', 'link', 'fetMode', 'thrust'];
const passed = [];
function check(name, run) { run(); passed.push(name); }
function project(params, version = '1.14.0') {
  const state = LoomSchema.defaultState(); state.tracks[0].effects[0] = { type: 'velvet', params: structuredClone(params) };
  return { format: 'loom-project', formatVersion: 1, appVersion: version, state };
}
check('Released projects inherit only the new BUTTER fields and retain every original value', () => {
  for (const version of [undefined, '1.0.0', '1.12.1', '1.14.0']) {
    const saved = project(legacy.defaults); if (version === undefined) delete saved.appVersion; else saved.appVersion = version;
    const actual = LoomSchema.parseProject(JSON.stringify(saved)).tracks[0].effects[0].params;
    assert.deepEqual(actual, definition.defaults);
    for (const [key, value] of Object.entries(legacy.defaults)) assert.equal(actual[key], value, key);
  }
});
check('Migration validates supplied model fields and does not repair missing original controls', () => {
  for (const key of Object.keys(legacy.defaults)) {
    const saved = project(legacy.defaults); delete saved.state.tracks[0].effects[0].params[key];
    assert.throws(() => LoomSchema.parseProject(JSON.stringify(saved)), /invalid/i, key);
  }
  for (const patch of [{ model: 'missing' }, { input: null }, { colour: '0.4' }, { timing: true }, { link: null }, { fetMode: 'missing' }, { thrust: 'missing' }]) {
    assert.throws(() => LoomSchema.parseProject(JSON.stringify(project({ ...legacy.defaults, ...patch }))), /invalid/i);
  }
  for (const key of added) {
    const saved = project(definition.defaults, LoomSchema.VERSION); delete saved.state.tracks[0].effects[0].params[key];
    assert.throws(() => LoomSchema.parseProject(JSON.stringify(saved)), /invalid/i, key);
  }
});
check('Every classic model, its analog controls and automation survive strict project round trips', () => {
  const models = definition.params.find(param => param.key === 'model').options.map(option => option.value);
  assert.equal(models.length, 9); assert.equal(new Set(models).size, 9); assert(models.includes('clean'));
  for (const model of models) {
    const params = { ...definition.defaults, model, input: 4.2, colour: .61, timing: 'classic', link: .72, fetMode: 'all-buttons', thrust: 'loud', attack: .04, release: 2600, ratio: 24 };
    const state = project(params, LoomSchema.VERSION).state;
    state.tracks[0].automation = [
      { target: 'fx:0:input', effectType: 'velvet', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -3 }, { beat: 4, value: 4.2 }] },
      { target: 'fx:0:colour', effectType: 'velvet', enabled: true, interpolation: 'hold', points: [{ beat: 0, value: .61 }, { beat: 2, value: .22 }] },
      { target: 'fx:0:link', effectType: 'velvet', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 1 }, { beat: 4, value: .72 }] }
    ];
    const restored = LoomSchema.parseProject(LoomSchema.serializeProject(state));
    assert.deepEqual(restored.tracks[0].effects[0].params, params); assert.deepEqual(restored.tracks[0].automation, state.tracks[0].automation);
    for (const param of definition.params.filter(param => param.type === 'range')) assert(LoomSchema.automationTargets(restored.tracks[0]).some(target => target.target === 'fx:0:' + param.key && target.min === param.min && target.max === param.max), param.key);
    assert.equal(restored.tracks.length, 8); assert(restored.tracks.every(track => track.effects.length === 4));
  }
  assert.deepEqual(dsp.normalize('velvet', {}), definition.defaults);
  assert.equal(LoomEffectsCatalog.length, 15);
});
function source(sr) {
  const frames = Math.round(sr * .3), left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / sr, envelope = t < .05 ? .03 : t < .15 ? .6 : t < .19 ? .08 : .32;
    left[i] = envelope * (.7 * Math.sin(2 * Math.PI * 73 * t) + .3 * Math.sin(2 * Math.PI * 1703 * t));
    right[i] = envelope * (.6 * Math.cos(2 * Math.PI * 113 * t) - .2 * Math.sin(2 * Math.PI * 571 * t));
  }
  return { left, right };
}
function render(params, rate, factory = dsp, block = 128) {
  const audio = source(rate), insert = factory.create('velvet', rate, params);
  for (let at = 0; at < audio.left.length; at += block) insert.process(audio.left.subarray(at, at + block), audio.right.subarray(at, at + block));
  return audio;
}
check('All twenty-four released stereo PCM fixtures remain exact at four sample rates', () => {
  for (const [rate, cases] of Object.entries(legacy.hashes)) for (const [name, expected] of Object.entries(cases)) {
    const params = { ...legacy.defaults, ...legacy.cases[name] }, audio = render(params, Number(rate));
    const hash = createHash('sha256').update(Buffer.from(audio.left.buffer)).update(Buffer.from(audio.right.buffer)).digest('hex');
    assert.equal(hash, expected, name + ' at ' + rate);
    assert.deepEqual(render({ ...definition.defaults, ...params }, Number(rate), dsp, 73), audio);
  }
});
check('Explicit sixth factory dependency works without globals and cannot silently lose analog processing', () => {
  const context = { Math, Number, Float32Array, Float64Array, Int32Array };
  const make = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')', context);
  const compressor = vm.runInNewContext('(' + createLoomCompressorDSP.toString() + ')', context);
  const isolated = make(null, null, null, null, null, compressor), missing = make();
  for (const model of definition.params.find(param => param.key === 'model').options.map(option => option.value)) {
    const params = { ...definition.defaults, model };
    assert.deepEqual(render(params, 48000, isolated, 73), render(params, 48000));
    if (model !== 'clean') assert.throws(() => missing.create('velvet', 48000, params), /require createLoomCompressorDSP/);
  }
  assert.deepEqual(render(legacy.defaults, 48000, missing), render(legacy.defaults, 48000));
});
for (const name of passed) console.log('PASS ' + name);
console.log(passed.length + ' BUTTER project and released-audio checks passed.');
