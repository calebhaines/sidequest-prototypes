'use strict';
// Portable PRESERVE state, owner/automation scoping and serialized-factory checks.
// Run: node loom/tape-project-checks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'effects.js', 'schema.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
}
const S = LoomSchema, definition = LoomEffectsCatalog.find(effect => effect.id === 'preserve');
assert(definition, 'PRESERVE must be available in the real shared effects catalog.');
const tape = createLoomTapeDSP(), effects = createLoomEffectsDSP(), passed = [];
const descriptors = definition.params, ranges = descriptors.filter(param => param.type === 'range');
const machine = descriptors.find(param => ['machine', 'model'].includes(param.key) && param.type === 'select');
const clone = value => JSON.parse(JSON.stringify(value));
const owners = state => [...state.tracks, ...state.returns, state.master];
const envelope = (state, appVersion = S.VERSION) => ({ format: 'loom-project', formatVersion: 1, appVersion, state });
const parse = state => S.parseProject(JSON.stringify(envelope(state)));
const insert = patch => ({ type: 'preserve', params: { ...definition.defaults, ...patch } });
function check(name, run) { run(); passed.push(name); console.log('PASS ' + name); }
function unusual(selected) {
  const result = Object.fromEntries(descriptors.map(param => [param.key, param.type === 'range' ? param.min + (param.max - param.min) * .37 : param.options.at(-1).value]));
  return { ...result, [machine.key]: selected, bypass: true };
}
function lane(param, slot = 0, interpolation = 'linear') {
  return { target: 'fx:' + slot + ':' + param.key, effectType: 'preserve', enabled: true, interpolation, points: [{ beat: 0, value: param.min }, { beat: 4, value: param.max }] };
}
check('PRESERVE is one discoverable effect with coherent machine choices and a complete, uncluttered control grouping', () => {
  assert.equal(definition.name, 'PRESERVE'); assert.equal(definition.panel, 'tape');
  assert.equal(LoomEffectsCatalog.filter(effect => effect.id === 'preserve').length, 1);
  assert(definition.description && definition.subtitle);
  assert(machine && machine.options.length >= 3, 'Tape recipes need distinct machine characters.');
  assert.equal(new Set(machine.options.map(option => option.value)).size, machine.options.length);
  assert.equal(new Set(descriptors.map(param => param.key)).size, descriptors.length);
  assert.equal(descriptors.filter(param => param.key === 'mix').length, 1);
  assert.deepEqual(Object.keys(definition.defaults).sort(), [...descriptors.map(param => param.key), 'bypass'].sort());
  assert.equal(definition.defaults.bypass, false);
  for (const key of ['wow', 'flutter', 'noise', 'dropouts', 'crosstalk']) assert.equal(definition.defaults[key], 0, key + ' is an explicit opt-in.');
  assert(Array.isArray(definition.groups) && definition.groups.length >= 2);
  for (const group of definition.groups) {
    assert(group.id && group.label && Array.isArray(group.keys) && group.keys.length);
    assert(group.help || group.description, group.id + ' needs practical control guidance.');
  }
  assert.deepEqual(definition.groups.flatMap(group => group.keys).sort(), descriptors.map(param => param.key).sort(), 'Every control belongs to exactly one visible group.');
});
check('Catalog defaults, parameter boundaries and self-contained tape DSP specifications agree', () => {
  assert.deepEqual(tape.normalize({}), definition.defaults);
  assert.deepEqual(effects.normalize('preserve', {}), definition.defaults);
  assert.deepEqual(Object.keys(tape.specifications).sort(), descriptors.map(param => param.key).sort());
  for (const param of descriptors) {
    assert.equal(param.default, definition.defaults[param.key], param.key);
    const rule = tape.specifications[param.key];
    if (param.type === 'range') {
      assert.deepEqual(rule, [param.min, param.max, param.default], param.key);
      assert(param.step > 0 && param.min <= param.default && param.default <= param.max, param.key);
      assert.equal(tape.normalize({ [param.key]: param.min })[param.key], param.min);
      assert.equal(tape.normalize({ [param.key]: param.max })[param.key], param.max);
    } else {
      assert.equal(param.type, 'select', param.key);
      assert.deepEqual([...rule].sort(), param.options.map(option => option.value).sort(), param.key);
      assert(param.options.some(option => option.value === param.default), param.key);
      assert.equal(new Set(rule).size, rule.length, param.key);
    }
  }
  const malformed = { [machine.key]: 'not-a-machine', drive: NaN, mix: '1', bypass: 'true' }, before = { ...malformed };
  assert.deepEqual(tape.normalize(malformed), definition.defaults);
  assert.deepEqual(malformed, before, 'Normalization never mutates caller settings.');
});
check('Practical recipes are complete snapshots, remain in bounds and cover every machine character', () => {
  assert(Array.isArray(definition.presets) && definition.presets.length >= machine.options.length);
  assert.equal(new Set(definition.presets.map(recipe => recipe.id)).size, definition.presets.length);
  assert.deepEqual([...new Set(definition.presets.map(recipe => recipe.params[machine.key]))].sort(), machine.options.map(option => option.value).sort());
  for (const recipe of definition.presets) {
    assert(recipe.id && recipe.name && recipe.description, 'Recipes need useful names and descriptions.');
    assert.deepEqual(Object.keys(recipe.params).sort(), Object.keys(definition.defaults).sort(), recipe.id);
    assert.deepEqual(tape.normalize(recipe.params), recipe.params, recipe.id);
    for (const ownerIndex of [0, 8, 9, 10]) {
      const state = S.defaultState(); owners(state)[ownerIndex].effects[3] = insert(recipe.params);
      assert.deepEqual(owners(parse(state))[ownerIndex].effects[3], insert(recipe.params), recipe.id);
    }
  }
});
check('All owner-specific insert positions, controls and numeric automation round-trip on eight tracks, two returns and master', () => {
  for (let ownerIndex = 0; ownerIndex < 11; ownerIndex++) for (const selected of machine.options) {
    const state = S.defaultState(), owner = owners(state)[ownerIndex], params = unusual(selected.value);
    owner.effects = Array.from({ length: S.effectSlotCount(owner) }, () => insert(params));
    owner.automation = ranges.map((param, index) => lane(param, 2, index % 2 ? 'hold' : 'linear'));
    const snapshot = clone(state), restoredState = parse(state), restored = owners(restoredState)[ownerIndex];
    assert.deepEqual(restored.effects, owner.effects, owner.id + ' / ' + selected.value);
    assert.deepEqual(restored.automation, owner.automation, owner.id + ' / ' + selected.value);
    assert.deepEqual(state, snapshot, 'Loading does not mutate the supplied state.');
    for (let other = 0; other < 11; other++) if (other !== ownerIndex) assert.deepEqual(owners(restoredState)[other], owners(snapshot)[other], owner.id + ' changed another owner.');
    for (const slot of restored.effects.keys()) for (const param of ranges) {
      const target = S.automationTargets(restored).find(item => item.target === 'fx:' + slot + ':' + param.key);
      assert(target && target.effectType === 'preserve', owner.id + ':' + slot + ':' + param.key);
      assert.equal(target.min, param.min); assert.equal(target.max, param.max); assert.equal(target.step, param.step);
    }
    assert.equal(restoredState.tracks.length, 8); assert.equal(restoredState.returns.length, 2);
    assert(owners(restoredState).every(item => item.effects.length === S.effectSlotCount(item)));
  }
});
check('Missing fields, non-finite/wrong parameter types, unknown choices and malformed bypass reject atomically', () => {
  for (const ownerIndex of [0, 7, 8, 9, 10]) {
    for (const key of Object.keys(definition.defaults)) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[0] = insert(); delete owner.effects[0].params[key];
      const before = clone(state); assert.throws(() => parse(state), /invalid|settings|effect/i, owner.id + ' missing ' + key); assert.deepEqual(state, before);
    }
    for (const param of descriptors) for (const bad of param.type === 'range' ? [null, '0', true, NaN, Infinity] : [null, true, 15, 'unknown-value']) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[1] = insert({ [param.key]: bad });
      assert.throws(() => parse(state), /invalid|settings|effect/i, owner.id + ' invalid ' + param.key);
    }
    for (const bad of [null, 0, 'false']) {
      const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[2] = insert({ bypass: bad });
      assert.throws(() => parse(state), /invalid|settings|effect/i, owner.id + ' invalid bypass');
    }
  }
});
check('Bus ranges and automation stay strict, while track loading retains its established bounded behavior', () => {
  for (const param of ranges) for (const value of [param.min - Math.max(1, param.step), param.max + Math.max(1, param.step)]) {
    for (const ownerIndex of [8, 9, 10]) {
      const state = S.defaultState(); owners(state)[ownerIndex].effects[0] = insert({ [param.key]: value });
      assert.throws(() => parse(state), /invalid|settings|effect/i, param.key);
    }
    const state = S.defaultState(); state.tracks[0].effects[0] = insert({ [param.key]: value });
    assert.equal(parse(state).tracks[0].effects[0].params[param.key], Math.max(param.min, Math.min(param.max, value)));
  }
  const drive = ranges.find(param => param.key === 'drive') || ranges[0];
  for (const ownerIndex of [0, 8, 9, 10]) for (const patch of [
    { effectType: 'velvet' }, { target: 'fx:0:' + machine.key }, { target: 'fx:0:missing' },
    { points: [{ beat: 0, value: null }] }, { points: [{ beat: 0, value: drive.max + 1 }] },
    { points: [{ beat: -1, value: drive.default }] }
  ]) {
    const state = S.defaultState(), owner = owners(state)[ownerIndex]; owner.effects[0] = insert(); owner.automation = [{ ...lane(drive), ...patch }];
    assert.throws(() => parse(state), /invalid|automation|outside/i);
  }
});
check('Released 1.21 sessions retain their existing inserts, buses, EQ and timing without acquiring tape processing', () => {
  const state = S.defaultState(); state.name = 'Before the tape machine'; state.tempo = 137; state.lengthBars = 32; state.selectedTrack = 5;
  state.master.level = .67; state.tracks[3].sends = [.23, .49]; state.tracks[3].sendPre = [true, false];
  state.tracks[3].eq = { ...S.defaultTrackEq(), low: 1.7, lowMid: -2.1, highMid: .8, high: -1.3 };
  const oldEffect = LoomEffectsCatalog.find(effect => effect.id === 'cinder');
  state.tracks[3].effects[1] = { type: oldEffect.id, params: { ...oldEffect.defaults, drive: 17, mix: .43 } };
  state.tracks[3].automation = [{ target: 'fx:1:drive', effectType: 'cinder', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: 4 }, { beat: 8, value: 21 }] }];
  const original = clone(state);
  const released = clone(state);
  released.tracks.forEach(track => { track.effects = track.effects.slice(0, 4); delete track.eq.lowMidFreq; delete track.eq.highMidFreq; });
  assert.deepEqual(S.parseProject(JSON.stringify(envelope(released, '1.21.0'))), original);
  assert(owners(original).every(owner => owner.effects.every(slot => !slot || slot.type !== 'preserve')));
  const serialized = S.serializeProject(state); assert.equal(JSON.parse(serialized).appVersion, S.VERSION);
  assert.deepEqual(S.parseProject(serialized), original);
});
function source(rate = 48000) {
  const frames = 10001, left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const amplitude = i < 1700 ? .03 : i < 4100 ? .7 : i < 5700 ? .12 : .4;
    left[i] = amplitude * (.7 * Math.sin(2 * Math.PI * 73 * i / rate) + .3 * Math.sin(2 * Math.PI * 1801 * i / rate));
    right[i] = amplitude * (.7 * Math.sin(2 * Math.PI * 113 * i / rate) - .2 * Math.sin(2 * Math.PI * 701 * i / rate));
  }
  return { left, right };
}
function render(factory, params, block = 128) {
  const audio = source(), effect = factory.create('preserve', 48000, params);
  for (let at = 0; at < audio.left.length; at += block) effect.process(audio.left.subarray(at, at + block), audio.right.subarray(at, at + block), { tempo: 120, beat: at / 24000, playing: true });
  return audio;
}
check('The explicit eighth factory renders identically without globals, including transport and seeded wear state', () => {
  const sandbox = { Math, Number, Object, Float32Array, Float64Array, Int32Array, Uint32Array, Uint8Array };
  const isolatedEffects = vm.runInNewContext('(' + createLoomEffectsDSP.toString() + ')', sandbox);
  const isolatedTape = vm.runInNewContext('(' + createLoomTapeDSP.toString() + ')', sandbox);
  const explicit = isolatedEffects(null, null, null, null, null, null, null, isolatedTape);
  for (const selected of machine.options) {
    const params = { ...definition.defaults, [machine.key]: selected.value, drive: Math.min(15, ranges.find(param => param.key === 'drive')?.max ?? 15), output: -3 };
    assert.deepEqual(render(explicit, params, 137), render(effects, params, 128), selected.value);
    assert.deepEqual(clone(explicit.normalize('preserve', params)), effects.normalize('preserve', params));
  }
  for (const recipe of definition.presets) assert.deepEqual(render(explicit, recipe.params, 997), render(effects, recipe.params), recipe.id);
  assert.throws(() => isolatedEffects().create('preserve', 48000, definition.defaults), /tape|unknown.*effect/i);
});
console.log(passed.length + ' PRESERVE catalog, project and serialized-factory groups passed.');
