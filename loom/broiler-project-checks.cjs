'use strict';
// Compatibility fixtures were captured before the workshop upgrade. These
// checks run on the distributed sources without Git or a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
globalThis.window = globalThis;
for (const name of ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js', 'schema.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), { filename: name });
}
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'broiler-legacy-fixtures.json'), 'utf8'));
const definition = LoomEffectsCatalog.find(effect => effect.id === 'broiler');
const dsp = createLoomEffectsDSP();
const passed = [];
const check = (name, run) => { run(); passed.push(name); };
const project = (params, appVersion = '1.13.0') => {
  const state = LoomSchema.defaultState();
  state.tracks[0].effects[0] = { type: 'broiler', params: structuredClone(params) };
  return { format: 'loom-project', formatVersion: 1, appVersion, state };
};

check('Old BROILER projects inherit only new controls, including files without appVersion', () => {
  for (const version of [undefined, '1.7.0', '1.12.1', '1.13.0']) {
    const saved = project(legacy.defaults); if (version === undefined) delete saved.appVersion; else saved.appVersion = version;
    const restored = LoomSchema.parseProject(JSON.stringify(saved));
    assert.deepEqual(restored.tracks[0].effects[0].params, definition.defaults);
    for (const [key, value] of Object.entries(legacy.defaults)) assert.equal(restored.tracks[0].effects[0].params[key], value, key);
  }
});

check('Migration retains strict validation of original and supplied workshop controls', () => {
  for (const missing of ['model', 'drive', 'cabinet', 'mix', 'bypass']) {
    const saved = project(legacy.defaults); delete saved.state.tracks[0].effects[0].params[missing];
    assert.throws(() => LoomSchema.parseProject(JSON.stringify(saved)), /invalid/i, missing);
  }
  for (const patch of [{ bias: null }, { preampTube: 'missing' }, { pedal1Type: 'missing' }, { pedal1Enabled: true }, { pedal2Drive: null }]) {
    assert.throws(() => LoomSchema.parseProject(JSON.stringify(project({ ...legacy.defaults, ...patch }))), /invalid/i);
  }
  const current = project(definition.defaults, LoomSchema.VERSION);
  delete current.state.tracks[0].effects[0].params.pedal1Type;
  assert.throws(() => LoomSchema.parseProject(JSON.stringify(current)), /invalid/i);
});

check('Complete modern rigs, workshop values and numeric automation survive project serialization', () => {
  const params = { ...definition.defaults, model: 'royal-68', preampTube: '12at7', powerTube: 'el34', toneStack: 'british', bias: -.18, voltage: .82, transformer: .6, pedal1Type: 'green-808', pedal1Enabled: 'on', pedal1Route: 'pre', pedal1Drive: .72, pedal4Type: 'echo', pedal4Enabled: 'on', pedal4Route: 'post', pedal4Mix: .24 };
  const saved = project(params, LoomSchema.VERSION).state;
  saved.tracks[0].automation = [
    { target: 'fx:0:bias', effectType: 'broiler', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: -.18 }, { beat: 4, value: .2 }] },
    { target: 'fx:0:pedal1Drive', effectType: 'broiler', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .72 }, { beat: 4, value: .9 }] }
  ];
  const restored = LoomSchema.parseProject(LoomSchema.serializeProject(saved));
  assert.deepEqual(restored.tracks[0].effects[0].params, params);
  assert.deepEqual(restored.tracks[0].automation, saved.tracks[0].automation);
  for (const param of definition.params.filter(param => param.type === 'range')) {
    assert(LoomSchema.automationTargets(restored.tracks[0]).some(target => target.target === 'fx:0:' + param.key && target.min === param.min && target.max === param.max), param.key);
  }
  assert.equal(restored.tracks.length, 8); assert(restored.tracks.every(track => track.effects.length === 4));
});

function fingerprint(params) {
  const sr = legacy.sampleRate;
  const left = Float32Array.from({ length: legacy.frames }, (_, i) => {
    const t = i / sr;
    return Math.min(1, t * 120) * (.7 + .3 * Math.cos(t * 8)) * (.15 * Math.sin(2 * Math.PI * 55 * t) + .0675 * Math.sin(2 * Math.PI * 110 * t) + .03 * Math.sin(2 * Math.PI * 1200 * t) + .018 * Math.sin(2 * Math.PI * 3800 * t));
  });
  const right = left.slice(), insert = dsp.create('broiler', sr, params);
  for (let at = 0; at < left.length; at += 128) insert.process(left.subarray(at, at + 128), right.subarray(at, at + 128));
  return createHash('sha256').update(Buffer.from(left.buffer)).digest('hex');
}

check('Every original model and all thirteen old rigs retain exact PCM', () => {
  for (const [model, expected] of Object.entries(legacy.models)) assert.equal(fingerprint({ ...definition.defaults, model }), expected, model);
  for (const [id, fixture] of Object.entries(legacy.presets)) {
    assert.equal(fingerprint({ ...definition.defaults, ...fixture.params }), fixture.sha256, id);
    assert.equal(fingerprint(fixture.params), fixture.sha256, id + ' raw old params');
  }
});

for (const name of passed) console.log('PASS ' + name);
console.log(passed.length + ' BROILER project and legacy audio checks passed.');
