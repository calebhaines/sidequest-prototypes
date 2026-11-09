'use strict';

// Portable schema and freeze-migration checks. No browser or Git dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const clone = value => JSON.parse(JSON.stringify(value));

function load() {
  const scope = { crypto: webcrypto, Blob, TextEncoder, TextDecoder };
  scope.window = scope; scope.globalThis = scope;
  scope.atob = text => Buffer.from(text, 'base64').toString('binary');
  scope.btoa = text => Buffer.from(text, 'binary').toString('base64');
  const shared = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? path.join(__dirname, 'shared') : path.join(__dirname, '..', 'shared');
  const files = [path.join(shared, 'pattern-schema.js')];
  files.push(...fs.readdirSync(__dirname).filter(name => name.endsWith('-catalog.js') && name !== 'effects-catalog.js').sort().map(name => path.join(__dirname, name)));
  files.push(...['effects-catalog.js', 'lfo.js', 'schema.js', 'service-schema.js'].map(name => path.join(__dirname, name)));
  for (const file of files) Function('window', 'globalThis', 'crypto', 'atob', 'btoa', fs.readFileSync(file, 'utf8'))(scope, scope, scope.crypto, scope.atob, scope.btoa);
  return { scope, S: scope.LoomSchema };
}

function run() {
  const { scope, S } = load(), passed = [];
  const check = (name, callback) => { callback(); passed.push(name); console.log('PASS', name); };
  const definition = type => scope.LoomEffectsCatalog.find(effect => effect.id === type);
  const fx = (type, params = {}) => ({ type, params: { ...definition(type).defaults, ...params } });
  const envelope = (state = S.defaultState(), version = S.VERSION) => ({ format: 'loom-project', formatVersion: 1, appVersion: version, state });
  const parse = project => S.parseProject(JSON.stringify(project));
  const lane = (target, values = [[0, .2], [4, .8]], effectType) => ({ target, enabled: true, interpolation: 'linear', points: values.map(([beat, value]) => ({ beat, value })), ...(effectType ? { effectType } : {}) });
  function legacyShape(state) { const result = clone(state); delete result.buses; for (const track of result.tracks) delete track.output; return result; }
  function fixture() {
    const s = S.defaultState(); s.name = 'Drums together, soup apart'; s.tempo = 120; s.lengthBars = 1; s.loopEnd = 4; s.recording.punchEnd = 4;
    s.master.level = .64; s.selectedTrack = 9;
    const samples = Float32Array.from({ length: 64 }, (_, index) => Math.sin(index * .17) * .2);
    const asset = S.encodeAsset({ id: 'bus-schema-source', name: 'Source PCM', left: samples, sampleRate: 8000 }); s.assets = [asset];
    s.tracks[0].name = 'Kick and pans'; s.tracks[0].level = .71; s.tracks[0].pan = -.23;
    s.tracks[0].sends = [.2, .37]; s.tracks[0].sendPre = [true, false];
    s.tracks[0].effects[0] = fx('prism', { low: 2, high: -3 });
    s.tracks[0].automation = [lane('fx:0:low', [[0, 2], [4, -3]], 'prism')];
    s.tracks[0].clips = [{ id: 'group-bus-audio', name: 'Original recording', type: 'audio', assetId: asset.id, start: 0, length: 1, sourceStart: 0, sourceEnd: asset.duration, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: .8, fadeIn: 0, fadeOut: 0 }];
    s.tracks[9].instrument = { id: 'roux', name: 'ROUX', snapshot: { format: 'loom-instrument-state', version: 1, app: 'roux', state: { name: 'Saved native editor', seed: 35 }, storage: { 'roux-test': 'preserve this' } } };
    return S.normalize(s);
  }

  check('Two neutral group buses supplement ten tracks and the two existing returns', () => {
    const s = S.defaultState(); assert.equal(S.LIMITS.buses, 2); assert.equal(s.tracks.length, 10); assert.equal(s.returns.length, 2);
    assert.deepEqual(S.TRACK_OUTPUTS, ['master', 'bus-1', 'bus-2']); assert(Object.isFrozen(S.TRACK_OUTPUTS));
    assert.deepEqual(s.buses, [0, 1].map(index => ({ id: 'bus-' + (index + 1), name: 'Bus ' + (index + 1), level: 1, pan: 0, mute: false, solo: false, effects: [null, null, null, null], automation: [] })));
    assert(s.tracks.every(track => track.output === 'master' && track.sends.length === 2 && track.effects.length === 5));
    assert(s.returns.every(bus => bus.effects[0] !== null)); assert(s.buses.every(bus => S.effectSlotCount(bus) === 4));
    const first = S.defaultBus(0), second = S.defaultBus(0); first.effects[0] = fx('prism'); first.automation.push(lane('level'));
    assert.deepEqual(second.effects, [null, null, null, null]); assert.deepEqual(second.automation, []); assert.throws(() => S.defaultBus(2), /Bus 1 or Bus 2/);
  });

  check('Every main track can save and reopen Master, Bus 1 or Bus 2 without changing its content', () => {
    const source = fixture();
    for (let track = 0; track < 10; track++) for (const output of S.TRACK_OUTPUTS) {
      const s = clone(source); s.tracks[track].output = output;
      const restored = S.parseProject(S.serializeProject(s)); assert.deepEqual(restored, s); assert.equal(restored.tracks[track].output, output);
    }
  });

  check('Legacy migration adds only absent group buses and outputs, preserving old PCM, snapshots, sends and mix', () => {
    const original = legacyShape(fixture()), before = JSON.stringify(original);
    for (const version of [undefined, '1.16.0', '1.32.0', '1.39.0', '1.40.0']) {
      const p = envelope(clone(original), version); if (version === undefined) delete p.appVersion;
      const restored = parse(p); assert.deepEqual(legacyShape(restored), original); assert.deepEqual(restored.buses, [S.defaultBus(0), S.defaultBus(1)]);
      assert(restored.tracks.every(track => track.output === 'master'));
    }
    assert.equal(JSON.stringify(original), before);
    const supplied = fixture(); supplied.buses[0].name = 'Drum family'; supplied.buses[0].level = .52; supplied.tracks[9].output = 'bus-2';
    assert.deepEqual(parse(envelope(supplied, '1.40.0')), supplied);
  });

  check('Current projects require complete group state and valid destinations on all ten tracks', () => {
    const mutations = [p => delete p.state.buses, p => { p.state.buses = []; }, p => { p.state.buses.push(S.defaultBus(0)); }, p => { p.state.buses = null; }, p => { p.state.buses[1] = null; }];
    for (let index = 0; index < 10; index++) mutations.push(p => delete p.state.tracks[index].output);
    for (const mutate of mutations) { const p = envelope(); mutate(p); assert.throws(() => parse(p), /bus|output/i); }
    for (const output of [null, 0, {}, '', 'Master', 'return-1', 'track-1', 'bus-0', 'bus-3', '__proto__']) {
      for (const version of [S.VERSION, '1.40.0']) { const p = envelope(undefined, version); p.state.tracks[3].output = output; assert.throws(() => parse(p), /output/i); }
    }
  });

  check('Bus IDs, controls, effect counts and routing fields receive strict validation', () => {
    const mutations = [
      bus => { bus.id = 'bus-2'; }, bus => { bus.name = ''; }, bus => { bus.level = -1; }, bus => { bus.level = 1.51; }, bus => { bus.level = '1'; },
      bus => { bus.pan = 1.01; }, bus => { bus.mute = 1; }, bus => { bus.solo = 'false'; }, bus => { bus.effects = [null]; }, bus => { delete bus.automation; },
      ...['output', 'sends', 'sendPre', 'instrument', 'clips', 'armed', 'disabled'].map(key => bus => { bus[key] = key === 'output' ? 'bus-2' : []; }),
      bus => { bus.effects[0] = fx('prism', { high: 99 }); }, bus => { bus.effects[0] = { type: 'prism', params: {} }; }, bus => { bus.effects[0] = { type: 'missing', params: {} }; }
    ];
    for (const mutate of mutations) for (const version of [S.VERSION, '1.40.0']) { const p = envelope(undefined, version); mutate(p.state.buses[0]); assert.throws(() => parse(p), /bus|effect|settings|automation/i); }
  });

  check('Group bus automation exposes level, pan and four inserts while excluding feedback routes', () => {
    const s = fixture(); s.buses[0].effects[3] = fx('prism'); s.buses[0].name = 'All the drums';
    const descriptors = S.automationTargets(s.buses[0]), keys = descriptors.map(target => target.target);
    assert.equal(S.automationOwner(s, 'bus-1'), s.buses[0]); assert.equal(S.automationOwner(s, 'bus-3'), null);
    assert(keys.includes('level') && keys.includes('pan') && keys.includes('fx:3:low')); assert(!keys.some(key => /^(send:|eq:|mastering:|output)/.test(key)));
    assert.equal(descriptors.find(target => target.target === 'level').default, 1);
    s.buses[0].automation = [lane('level'), lane('pan', [[0, -.5], [4, .5]]), lane('fx:3:low', [[0, -4], [4, 4]], 'prism')];
    assert.deepEqual(S.parseProject(S.serializeProject(s)).buses[0], s.buses[0]);
    for (const target of ['send:0', 'output', 'mastering:drive', 'fx:4:low']) { const p = envelope(clone(s)); p.state.buses[0].automation.push(lane(target)); assert.throws(() => parse(p), /automation/i); }
  });

  check('Tolerant raw-state normalization fills bus defaults and rejects unsafe output destinations without mutation', () => {
    const raw = fixture(); raw.tracks[0].output = 'return-1'; raw.buses = [{ id: 'bus-2', name: ' A renamed group ', level: 4, pan: -4, effects: [fx('prism')] }];
    const before = JSON.stringify(raw), normalized = S.normalize(raw);
    assert.equal(normalized.tracks[0].output, 'master'); assert.equal(normalized.buses[0].id, 'bus-1'); assert.equal(normalized.buses[0].name, 'A renamed group');
    assert.equal(normalized.buses[0].level, 1.5); assert.equal(normalized.buses[0].pan, -1); assert.equal(normalized.buses[0].effects.length, 4); assert.deepEqual(normalized.buses[1], S.defaultBus(1));
    assert.equal(JSON.stringify(raw), before); normalized.buses[0].effects[0].params.low = 9; assert.notEqual(raw.buses[0].effects[0].params.low, 9);
  });

  check('Released frozen track fingerprints survive migration and downstream bus routing edits', () => {
    const s = S.defaultState(); s.lengthBars = 1; s.tempo = 120; s.loopEnd = 4; s.recording.punchEnd = 4; s.tracks[0].effects[0] = fx('vestige');
    const fingerprint = 'freeze-1-61bd2b794779dc0d'; // Immutable published Original HOOD recipe.
    assert.equal(S.freezeFingerprint(s, 'track-1'), fingerprint);
    const rate = 8000, frames = 16000, asset = S.encodeFreezeAsset({ id: 'group-bus-legacy-freeze', name: 'Existing frozen track', left: new Float32Array(frames), sampleRate: rate });
    s.freezeAssets = [asset]; s.tracks[0].freeze = { version: 1, sampleRate: rate, tempo: 120, lengthBeats: 4, bodyFrames: frames, totalFrames: frames, tailFrames: 0, fingerprint, chunks: [{ startFrame: 0, frames, main: asset.id, sendA: null, sendB: null }] };
    const restored = parse(envelope(legacyShape(s), '1.40.0')); assert(S.freezeValid(restored, 'track-1')); assert.equal(restored.tracks[0].freeze.fingerprint, fingerprint);
    restored.tracks[0].output = 'bus-2'; restored.buses[1].level = .35; restored.buses[1].effects[0] = fx('prism', { high: -7 });
    assert.equal(S.freezeFingerprint(restored, 'track-1'), fingerprint); assert(S.freezeValid(restored, 'track-1'));
    const opened = S.parseProject(S.serializeProject(restored)); assert(S.freezeValid(opened, 'track-1')); assert.equal(opened.tracks[0].output, 'bus-2'); assert.equal(opened.freezeAssets[0].pcm, asset.pcm);
    opened.tracks[0].eq.low = 1; assert(!S.freezeValid(opened, 'track-1')); assert.throws(() => S.parseProject(S.serializeProject(opened)), /freeze|stale/i);
  });

  check('LFO routes can reach both group buses and their insert controls without inventing new owner routes', () => {
    const s = fixture(); s.buses[1].effects[2] = fx('prism');
    const targets = S.lfoTargets(s); assert(targets.some(target => target.ownerId === 'bus-1' && target.target === 'level')); assert(targets.some(target => target.ownerId === 'bus-2' && target.target === 'fx:2:low'));
    const ownerOrder = [...new Set(targets.map(target => target.ownerId))];
    assert.deepEqual(ownerOrder.slice(0, 15), [...s.tracks.map(track => track.id), 'return-1', 'return-2', 'master', 'bus-1', 'bus-2']);
    s.lfos[0].enabled = true; s.lfos[0].routes = [{ id: 'bus-volume', ownerId: 'bus-1', target: 'level', amount: .2, enabled: true }, { id: 'bus-eq', ownerId: 'bus-2', target: 'fx:2:low', effectType: 'prism', amount: -.3, enabled: true }];
    assert.deepEqual(S.parseProject(S.serializeProject(s)).lfos, s.lfos);
    for (const patch of [{ ownerId: 'bus-3' }, { target: 'send:0' }, { target: 'output' }]) { const p = envelope(clone(s)); Object.assign(p.state.lfos[0].routes[0], patch); assert.throws(() => parse(p), /lfo|route|target/i); }
  });

  console.log(passed.length + ' group bus schema checks passed.');
  if (process.env.GROUP_BUS_SCHEMA_REPORT) fs.writeFileSync(process.env.GROUP_BUS_SCHEMA_REPORT, JSON.stringify({ passed }, null, 2) + '\n');
  return { passed };
}
if (require.main === module) { try { run(); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = { run, load };
