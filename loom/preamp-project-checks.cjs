'use strict';
// Portable SAUTÉ catalog, strict-project and serialized-factory checks.
// Run: node loom/preamp-project-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'lofi-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'lofi-dsp.js', 'effects.js', 'schema.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
}
const S = LoomSchema, definition = LoomEffectsCatalog.find(effect => effect.id === 'saute');
const dsp = createLoomPreampDSP(), effects = createLoomEffectsDSP(), passed = [];
const clone = value => JSON.parse(JSON.stringify(value));
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
const owners = state => [...state.tracks, ...state.returns, state.master];
const envelope = state => ({ format: 'loom-project', formatVersion: 1, appVersion: S.VERSION, state });
const parse = state => S.parseProject(JSON.stringify(envelope(state)));
const insert = (params = {}) => ({ type: 'saute', params: { ...definition.defaults, ...params } });
const descriptors = definition.params;
const ranges = descriptors.filter(param => param.type === 'range');
const circuitKeys = ['colour', 'impedance', 'transformer', 'headroom', 'bias', 'feedback', 'slew'];
function unusual(model) {
  return Object.assign({}, ...descriptors.map(param => ({ [param.key]: param.type === 'range' ? param.min + (param.max - param.min) * .37 : param.options.at(-1).value })), { model, bypass: true });
}
function automation(param, slot = 0) {
  return { target: 'fx:' + slot + ':' + param.key, effectType: 'saute', enabled: true, interpolation: param.key === 'bias' ? 'hold' : 'linear', points: [{ beat: 0, value: param.min }, { beat: 4, value: param.max }] };
}
check('Catalog supplies thirteen unique families, clear hardware inspirations and coherent groups', () => {
  assert(definition); assert.equal(definition.name, 'SAUTÉ'); assert.equal(definition.panel, 'preamp');
  assert.equal(definition.models.length, 13); assert.equal(new Set(definition.models.map(model => model.id)).size, 13);
  assert.deepEqual(definition.models.map(model => model.id), dsp.specifications.model);
  assert.equal(descriptors.length, 21); assert.equal(Object.keys(definition.defaults).length, 22);
  assert.equal(new Set(descriptors.map(param => param.key)).size, descriptors.length);
  assert.equal(descriptors.filter(param => param.key === 'mix').length, 1);
  const grouped = definition.groups.flatMap(group => group.keys);
  assert.deepEqual([...grouped].sort(), descriptors.map(param => param.key).sort());
  for (const model of definition.models) {
    assert(model.name && model.inspiration.length > 12 && model.description.length > 80);
    assert.deepEqual(Object.keys(model.defaults).sort(), [...circuitKeys].sort());
    assert.deepEqual(dsp.normalize({ ...definition.defaults, ...model.defaults, model: model.id }), { ...definition.defaults, ...model.defaults, model: model.id });
  }
  const transformerless = definition.models.find(model => model.id === 'super-9k');
  assert.deepEqual(transformerless.inactiveControls, ['transformer']);
  assert.equal(transformerless.defaults.transformer, 0);
  assert.match(transformerless.description, /transformerless/i);
  assert(LoomEffectsCatalog.filter(effect => effect.id === 'saute').length === 1);
});
check('Catalog defaults, parameter boundaries and the actual DSP specifications agree exactly', () => {
  assert.deepEqual(dsp.normalize({}), definition.defaults);
  assert.deepEqual(effects.normalize('saute', {}), definition.defaults);
  assert.deepEqual(Object.keys(dsp.specifications).sort(), descriptors.map(param => param.key).sort());
  for (const param of descriptors) {
    const rule = dsp.specifications[param.key];
    assert.equal(param.default, definition.defaults[param.key], param.key);
    if (param.type === 'range') {
      assert.deepEqual(rule, [param.min, param.max, param.default], param.key);
      assert(param.step > 0 && param.min <= param.default && param.default <= param.max, param.key);
      assert.equal(dsp.normalize({ [param.key]: param.min })[param.key], param.min);
      assert.equal(dsp.normalize({ [param.key]: param.max })[param.key], param.max);
    } else {
      assert.deepEqual(rule, param.options.map(option => option.value), param.key);
      assert.equal(rule[0], param.default, param.key);
      assert.equal(new Set(rule).size, rule.length);
    }
  }
});
check('Sixteen recipes are complete, normalized snapshots and cover every model', () => {
  assert.equal(definition.presets.length, 16);
  assert.equal(new Set(definition.presets.map(preset => preset.id)).size, 16);
  assert.deepEqual([...new Set(definition.presets.map(preset => preset.params.model))].sort(), definition.models.map(model => model.id).sort());
  for (const preset of definition.presets) {
    assert(preset.name && preset.description.length > 30);
    assert.deepEqual(Object.keys(preset.params).sort(), Object.keys(definition.defaults).sort(), preset.id);
    assert.deepEqual(dsp.normalize(preset.params), preset.params, preset.id);
    for (const ownerIndex of [0, 8, 10]) {
      const state = S.defaultState(); owners(state)[ownerIndex].effects[3] = insert(preset.params);
      assert.deepEqual(owners(parse(state))[ownerIndex].effects[3], insert(preset.params), preset.id);
    }
  }
});
check('Every model, control and all seventeen numeric automation targets round-trip on every owner', () => {
  assert.equal(ranges.length, 17);
  for (let ownerIndex = 0; ownerIndex < 11; ownerIndex++) for (const model of definition.models) {
    const state = S.defaultState(), owner = owners(state)[ownerIndex], params = unusual(model.id);
    owner.effects = Array.from({ length: S.effectSlotCount(owner) }, () => insert(params));
    owner.automation = ranges.map(param => automation(param, 2));
    const loaded = parse(state), restored = owners(loaded)[ownerIndex];
    assert.deepEqual(restored.effects, owner.effects, owner.id + ' / ' + model.id);
    assert.deepEqual(restored.automation, owner.automation, owner.id + ' / ' + model.id);
    for (const slot of restored.effects.keys()) for (const param of ranges) {
      const target = S.automationTargets(restored).find(item => item.target === 'fx:' + slot + ':' + param.key);
      assert(target && target.effectType === 'saute', owner.id + ':' + slot + ':' + param.key);
      assert.equal(target.min, param.min); assert.equal(target.max, param.max); assert.equal(target.step, param.step);
    }
    assert.equal(loaded.tracks.length, 8); assert.equal(loaded.returns.length, 2);
  }
});
check('Missing controls, wrong types, bad enum values and malformed bypass are rejected without repairing', () => {
  for (const ownerIndex of [0, 7, 8, 9, 10]) {
    for (const key of Object.keys(definition.defaults)) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[0] = insert(); delete owner.effects[0].params[key];
      assert.throws(() => parse(state), /invalid|settings|effect/i, owner.id + ' missing ' + key);
    }
    for (const param of descriptors) for (const bad of param.type === 'range' ? [null, '0', true] : [null, true, 'unknown-model']) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[1] = insert({ [param.key]: bad });
      assert.throws(() => parse(state), /invalid|settings|effect/i, owner.id + ' invalid ' + param.key);
    }
    for (const bad of [null, 0, 'false']) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[2] = insert({ bypass: bad });
      assert.throws(() => parse(state), /invalid|settings|effect/i, owner.id + ' invalid bypass');
    }
  }
});
check('Bus parameters and automation reject out-of-range data; track loading keeps existing bounded semantics', () => {
  for (const param of ranges) for (const value of [param.min - 1, param.max + 1]) {
    for (const ownerIndex of [8, 9, 10]) {
      const state = S.defaultState(); owners(state)[ownerIndex].effects[0] = insert({ [param.key]: value });
      assert.throws(() => parse(state), /invalid|settings|effect/i, param.key);
    }
    const state = S.defaultState(); state.tracks[0].effects[0] = insert({ [param.key]: value });
    assert.equal(parse(state).tracks[0].effects[0].params[param.key], Math.max(param.min, Math.min(param.max, value)));
  }
  for (const ownerIndex of [0, 8, 10]) {
    for (const patch of [{ effectType: 'velvet' }, { target: 'fx:0:model' }, { target: 'fx:0:missing' }, { points: [{ beat: 0, value: null }] }, { points: [{ beat: 0, value: 1000 }] }]) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[0] = insert(); owner.automation = [{ ...automation(ranges.find(param => param.key === 'drive')), ...patch }];
      assert.throws(() => parse(state), /invalid|automation/i);
    }
  }
});
check('Existing sessions acquire no preamps and retain their original project values', () => {
  const state = S.defaultState(); state.name = 'Before the prep'; state.selectedTrack = 5;
  state.master.level = .67; state.tracks[3].sends = [.23, .49]; state.tracks[3].sendPre = [true, false];
  const original = clone(state), saved = { ...envelope(state), appVersion: '1.16.0' };
  assert.deepEqual(S.parseProject(JSON.stringify(saved)), original);
  assert(owners(original).every(owner => owner.effects.every(slot => !slot || slot.type !== 'saute')));
  const serialized = S.serializeProject(state); assert.equal(JSON.parse(serialized).appVersion, S.VERSION);
  assert.deepEqual(S.parseProject(serialized), original);
});
function source(rate = 48000) {
  const frames = 8192, left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const envelope = i < 1700 ? .03 : i < 4100 ? .7 : i < 5700 ? .12 : .4;
    left[i] = envelope * (.7 * Math.sin(2 * Math.PI * 73 * i / rate) + .3 * Math.sin(2 * Math.PI * 1801 * i / rate));
    right[i] = envelope * (.7 * Math.sin(2 * Math.PI * 113 * i / rate) - .2 * Math.sin(2 * Math.PI * 701 * i / rate));
  }
  return { left, right };
}
function render(factory, params, block = 128) {
  const audio = source(), effect = factory.create('saute', 48000, params);
  for (let at = 0; at < audio.left.length; at += block) effect.process(audio.left.subarray(at, at + block), audio.right.subarray(at, at + block));
  return audio;
}
check('An explicit seventh factory produces identical audio without ambient globals', () => {
  const sandbox = { Math, Number, Float32Array, Float64Array, Int32Array };
  const isolatedEffects = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')', sandbox);
  const isolatedPreamp = vm.runInNewContext('(' + createLoomPreampDSP.toString() + ')', sandbox);
  const explicit = isolatedEffects(null, null, null, null, null, null, isolatedPreamp);
  for (const model of definition.models) {
    const params = { ...definition.defaults, ...model.defaults, model: model.id, drive: 15, output: -3 };
    assert.deepEqual(render(explicit, params, 137), render(effects, params), model.id);
    assert.deepEqual(clone(explicit.normalize('saute', params)), effects.normalize('saute', params));
  }
  assert.throws(() => isolatedEffects().create('saute', 48000, definition.defaults), /preamp|unknown.*effect/i);
});
console.log(passed.length + ' SAUTÉ catalog, project and serialized-factory checks passed.');
