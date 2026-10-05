'use strict';
// Portable-note and fallback-library checks. Run: node shared/pattern-checks.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const scope = { TextEncoder, TextDecoder, crypto: webcrypto, DOMException, AbortController, Blob, URL, console,
  location: { protocol: 'file:' }, addEventListener() {}, document: { addEventListener() {} }, setTimeout, clearTimeout };
scope.window = scope;
vm.createContext(scope);
for (const file of ['pattern-schema.js', 'music-patterns.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope, { filename: file });
const S = scope.MusicLabPatternSchema, P = scope.MusicLabPatterns;
const fresh = () => ({ format: 'musiclab-pattern', version: 1, name: 'The borrowed turn ♫', sourceApp: 'FABLE', kind: 'notes', tempo: 120, swing: .12, lengthBeats: 4, meter: [4, 4], voices: [{ id: 'felt', name: 'Felt', pitch: 60 }, { id: 'glass', name: 'Glass', pitch: 72 }], notes: [{ id: 'first', pitch: 60, beat: 0, duration: 1.25, velocity: .84, voice: 'felt', probability: .7 }, { id: 'last', pitch: 127, beat: 3.5, duration: .5, velocity: 0, voice: 'glass', probability: 1 }], seed: 4294967295, tags: ['delicate'] });
const groups = [];
async function check(name, run) { await run(); groups.push(name); }
const plain = value => JSON.parse(JSON.stringify(value));
function reject(edit, expression) { const pattern = fresh(); edit(pattern); assert.throws(() => S.normalize(pattern), expression); }
(async () => {
  await check('Portable patterns preserve complete notes, provenance, expressive ranges, and deterministic seed', () => {
    const packet = S.normalize(fresh()); assert.deepEqual(plain(packet), fresh());
    assert.equal(S.serialize(S.parse(S.serialize(packet))), S.serialize(packet));
    assert.equal(packet.notes[1].pitch, 127); assert.equal(packet.notes[1].velocity, 0);
    assert.equal(packet.notes[0].probability, .7); assert.equal(packet.seed, 4294967295);
    assert.equal(S.durationSeconds(packet), 2); assert.equal(S.durationSeconds(packet, 60), 4);
  });
  await check('Version, type, and finite musical numbers reject before import', () => {
    for (const edit of [p => p.format = 'musiclab-audio', p => p.version = 2, p => p.kind = 'mystery', p => p.tempo = 19, p => p.tempo = 401, p => p.tempo = NaN, p => p.swing = Infinity, p => p.swing = -.1, p => p.lengthBeats = 257, p => p.lengthBeats = 0, p => p.seed = .5, p => p.seed = -1]) reject(edit);
    assert.throws(() => S.parse('{broken'), /JSON/); assert.throws(() => S.normalize(null));
    assert.throws(() => S.durationSeconds(fresh(), NaN));
  });
  await check('Invalid note pitches, times, lengths, velocities, and chance cannot be silently discarded', () => {
    for (const edit of [n => n.pitch = 60.2, n => n.pitch = 128, n => n.pitch = -1, n => n.beat = -1, n => n.beat = 4, n => n.beat = NaN, n => n.duration = 0, n => n.duration = Infinity, n => n.duration = 5, n => n.velocity = 1.01, n => n.velocity = null, n => n.probability = -.1]) reject(p => edit(p.notes[0]));
    reject(p => p.notes[1].duration = .501, /fit/);
  });
  await check('Duplicate and unsafe identities, missing lanes, and malformed meters reject', () => {
    reject(p => p.notes[1].id = p.notes[0].id, /unique/); reject(p => p.voices[1].id = p.voices[0].id, /unique/);
    reject(p => p.notes[0].voice = 'missing', /missing/); reject(p => p.voices[0].id = '__proto__', /invalid/);
    reject(p => p.notes[0].id = 'constructor', /invalid/); reject(p => p.voices[0].pitch = 60.5, /MIDI/);
    for (const meter of [[0, 4], [17, 4], [4, 3], [4], [4, 4, 4]]) reject(p => p.meter = meter, /meter/);
    reject(p => p.name = '<name>\n', /text/); reject(p => p.tags = Array(25).fill('many'), /24/);
  });
  await check('Large patterns retain all 4,096 events and downloaded JSON fits its own import limit', () => {
    const p = fresh(); p.lengthBeats = 256; p.notes = Array.from({ length: 4096 }, (_, i) => ({ id: 'n-' + i, pitch: i % 128, beat: i / 16, duration: 1 / 16, velocity: .7, voice: 'felt', probability: i % 2 ? .5 : 1 }));
    const serialized = S.serialize(p); assert(new TextEncoder().encode(serialized).length <= S.MAX_BYTES);
    const restored = S.parse(serialized); assert.equal(restored.notes.length, 4096); assert.equal(restored.notes[4095].beat, 255.9375);
    p.notes.push({ ...p.notes[0], id: 'one-too-many' }); assert.throws(() => S.normalize(p), /4,096/);
    reject(packet => packet.voices = Array.from({ length: 65 }, (_, i) => ({ id: 'v-' + i, name: 'Lane' })), /64/);
  });
  await check('Oversized UTF-8 packets and metadata fail within declared budgets', () => {
    assert.throws(() => S.parse(' '.repeat(S.MAX_BYTES + 1)), /1 MiB/);
    const utf8 = JSON.stringify({ ...fresh(), unused: '♫'.repeat(S.MAX_BYTES / 2) }); assert(utf8.length < 2 * S.MAX_BYTES); assert.throws(() => S.parse(utf8), /1 MiB/);
    reject(p => p.tags[0] = 'x'.repeat(41), /text/); reject(p => p.voices[0].name = 'x'.repeat(101), /text/);
  });
  await check('Normalization and fingerprints are independent of mutable input and other realms', () => {
    const raw = fresh(), normalized = S.normalize(raw), clone = S.clone(normalized), before = S.fingerprint(normalized);
    raw.notes[0].pitch = 1; raw.voices[0].name = 'Edited'; clone.notes[0].pitch = 2;
    assert.equal(normalized.notes[0].pitch, 60); assert.equal(normalized.voices[0].name, 'Felt'); assert.equal(S.fingerprint(normalized), before);
    assert.notEqual(S.fingerprint(clone), before);
    assert.equal(S.normalize(fresh()).notes.length, 2, 'Parent-realm plain objects remain valid.');
  });
  await check('Empty patterns and fractional note lengths remain valid musical parts', () => {
    const p = fresh(); p.notes = []; p.kind = 'drums'; assert.equal(S.normalize(p).notes.length, 0);
    p.notes = [{ pitch: 60, beat: .001, duration: .0001, velocity: 1, voice: 'felt' }]; const result = S.normalize(p); assert.equal(result.notes[0].id, 'n1'); assert.equal(result.notes[0].probability, 1);
    delete p.kind; assert.equal(S.normalize(p).kind, 'notes');
  });
  await check('Denied browser storage falls back explicitly and library records preserve editable patterns', async () => {
    const item = await P.save(fresh()); assert.equal(P.persistent, false); assert(item.id); assert.equal(item.notes, 2);
    const record = await P.get(item.id); assert.equal(S.serialize(record), S.serialize(fresh()));
    record.notes[0].pitch = 1; assert.equal((await P.get(item.id)).notes[0].pitch, 60, 'Reading cannot edit saved library notes.');
    const entries = await P.list(); assert.equal(entries.length, 1); assert(!Array.isArray(entries[0].notes)); assert.equal(entries[0].voices, 2);
    await P.remove(item.id); assert.equal((await P.list()).length, 0);
  });
  await check('Fallback count quota is atomic and deletion frees capacity without evicting parts', async () => {
    const ids = []; for (let i = 0; i < 128; i++) ids.push((await P.save({ ...fresh(), name: 'Part ' + i })).id);
    await assert.rejects(P.save(fresh()), /full/); assert.equal((await P.list()).length, 128);
    await P.remove(ids[63]); const replacement = await P.save(fresh()); assert(replacement.id); assert.equal((await P.list()).length, 128);
    for (const item of await P.list()) await P.remove(item.id);
  });
  await check('Hosted instruments delegate to LOOM’s common note library rather than isolated storage', async () => {
    const calls = [];
    scope.MusicLabHost = { patternLibrary: { persistent: true,
      async list() { calls.push('list'); return [{ id: 'host', createdAt: 3 }]; },
      async get(id) { calls.push(['get', id]); return fresh(); },
      async save(pattern) { calls.push(['save', plain(pattern)]); return { id: 'saved-parent' }; },
      async remove(id) { calls.push(['remove', id]); },
    } };
    assert.equal(P.persistent, true); assert.equal((await P.list())[0].id, 'host');
    await P.get(7); assert.equal((await P.save(fresh())).id, 'saved-parent'); await P.remove(8);
    assert.deepEqual(calls[1], ['get', '7']); assert.deepEqual(calls[2][1], fresh()); assert.deepEqual(calls[3], ['remove', '8']);
    delete scope.MusicLabHost;
  });
  console.log('Passed ' + groups.length + ' Music Lab pattern checks:\n' + groups.map(name => '  ✓ ' + name).join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
