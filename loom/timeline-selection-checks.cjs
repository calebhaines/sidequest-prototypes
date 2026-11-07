'use strict';
/* Movement invariants use real audio/note payload shapes without copying the
 * planner's snapping, clamping or capacity implementation into an oracle. */
const assert = require('node:assert/strict');
require('./timeline-selection.js');
const T = globalThis.LoomTimelineSelection;
let passed = 0;
function check(name, run) { run(); console.log('PASS ' + name); passed++; }
function audio(id, start, length = 2) { return { id, name: id, type: 'audio', assetId: 'recording', start, length, sourceStart: .1, sourceEnd: 1.1, sourceOffset: .03, rate: .75, reverse: true, loop: true, gain: .8, fadeIn: .1, fadeOut: .2, origin: { instrument: { id: 'tine', snapshot: { untouched: true } }, pattern: { seed: 123 } } }; }
function fixture() {
  const pattern = { format: 'musiclab-pattern', kind: 'notes', lengthBeats: 8, seed: 303, notes: [{ id: 'note', beat: .25, pitch: 60, duration: 1.5, velocity: .73, slide: true, lyric: 'hello', locks: { cutoff: 1234 } }] };
  const state = { name: 'Selection fixture', lengthBars: 8, view: { snap: .25 }, selectedTrack: 0, master: { effects: [] }, assets: [{ id: 'recording', pcm: 'immutable-base64', frames: 48000 }], freezeAssets: [{ id: 'unrelated-cache', pcm: 'immutable-float32' }], tracks: Array.from({ length: 10 }, (_, index) => ({ id: 'track-' + (index + 1), name: 'Track ' + (index + 1), disabled: false, effects: [], automation: [], clips: [] })) };
  state.tracks[0].clips = [audio('a', 2)];
  state.tracks[2].clips = [{ id: 'b', name: 'Editable notes', type: 'notes', start: 6, length: 3, pattern, sourceOffset: .125, rate: 1.25, reverse: false, loop: true, gain: .66, fadeIn: .2, fadeOut: .3, transpose: -12, voiceMap: { lead: 'bass' } }];
  state.tracks[1].clips = [audio('untouched', 10)];
  return state;
}
function find(state, id) { return T.entries(state, [id])[0]; }
function close(a, b, message) { assert(Math.abs(a - b) < 1e-11, message || (a + ' != ' + b)); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }

check('Mixed audio and note clips move together without changing payloads or copying assets', () => {
  const state = deepFreeze(fixture()), before = JSON.stringify(state), result = T.move(state, new Set(['b', 'a']), { deltaBeats: 1, deltaTracks: 1, anchorId: 'a' });
  assert(result.ok && result.changed); assert.equal(JSON.stringify(state), before);
  assert.equal(result.deltaBeats, 1); assert.equal(result.deltaTracks, 1);
  for (const id of ['a', 'b']) {
    const old = find(state, id), next = find(result.state, id);
    assert.equal(next.trackIndex, old.trackIndex + 1); assert.equal(next.clip.start, old.clip.start + 1);
    assert.deepEqual({ ...next.clip, start: old.clip.start }, old.clip);
    assert.equal(next.clip.pattern, old.clip.pattern); assert.equal(next.clip.origin, old.clip.origin);
  }
  assert.equal(result.state.assets, state.assets); assert.equal(result.state.freezeAssets, state.freezeAssets); assert.equal(result.state.master, state.master);
  assert.equal(result.state.tracks[4], state.tracks[4]); assert.equal(find(result.state, 'untouched').clip, find(state, 'untouched').clip);
});

check('One anchor snaps once while off-grid clip spacing remains unchanged', () => {
  const state = fixture(); state.tracks[0].clips[0].start = 2.1; state.tracks[2].clips[0].start = 6.35;
  const a = T.move(state, ['a', 'b'], { anchorId: 'a', deltaBeats: .35 });
  assert(a.ok); close(find(a.state, 'a').clip.start, 2.5); close(find(a.state, 'b').clip.start, 6.75);
  close(find(a.state, 'b').clip.start - find(a.state, 'a').clip.start, 4.25);
  const b = T.move(state, ['a', 'b'], { anchorId: 'b', deltaBeats: .35 });
  close(find(b.state, 'b').clip.start, 6.75); close(find(b.state, 'a').clip.start, 2.5);
  const vertical = T.move(state, ['a', 'b'], { deltaTracks: 1, anchorId: 'a' });
  assert.equal(find(vertical.state, 'a').clip.start, 2.1); assert.equal(find(vertical.state, 'b').clip.start, 6.35);
  assert.equal(find(vertical.state, 'a').clip, find(state, 'a').clip, 'Vertical-only moves can reuse unchanged clip objects');
  const free = T.move(state, ['a', 'b'], { deltaBeats: .1234, snap: 0 });
  close(find(free.state, 'a').clip.start, 2.223); close(find(free.state, 'b').clip.start, 6.473);
});

check('Time and track bounds clamp the entire selection instead of collapsing its spacing', () => {
  const state = fixture(), left = T.move(state, ['a', 'b'], { deltaBeats: -100 }), right = T.move(state, ['a', 'b'], { deltaBeats: 100 });
  assert.equal(find(left.state, 'a').clip.start, 0); assert.equal(find(left.state, 'b').clip.start, 4);
  assert.equal(find(right.state, 'a').clip.start, 25); assert.equal(find(right.state, 'b').clip.start, 29); assert.equal(find(right.state, 'b').clip.start + find(right.state, 'b').clip.length, 32);
  const bottom = T.move(state, ['a', 'b'], { deltaTracks: 100 });
  assert.equal(find(bottom.state, 'a').trackIndex, 7); assert.equal(find(bottom.state, 'b').trackIndex, 9);
  const top = T.move(bottom.state, ['a', 'b'], { deltaTracks: -100 });
  assert.equal(find(top.state, 'a').trackIndex, 0); assert.equal(find(top.state, 'b').trackIndex, 2);
});

check('Keyboard nudges preserve precise off-grid positions by adding one exact shared step', () => {
  const state = fixture(); state.tracks[0].clips[0].start = 2.12345; state.tracks[2].clips[0].start = 6.98765;
  const originalA = find(state, 'a').clip.start, originalB = find(state, 'b').clip.start;
  const planned = T.planMove(state, ['a', 'b'], { deltaBeats: .25, anchorId: 'a', quantize: false });
  assert(planned.ok && planned.changed); assert.equal(planned.deltaBeats, .25); assert.equal(planned.state, state);
  const nudged = T.move(state, ['a', 'b'], { deltaBeats: .25, anchorId: 'a', quantize: false });
  assert.equal(find(nudged.state, 'a').clip.start, originalA + .25); assert.equal(find(nudged.state, 'b').clip.start, originalB + .25);
  close(find(nudged.state, 'b').clip.start - find(nudged.state, 'a').clip.start, originalB - originalA);
  const reversed = T.move(nudged.state, ['a', 'b'], { deltaBeats: -.25, quantize: false });
  assert.equal(find(reversed.state, 'a').clip.start, originalA); assert.equal(find(reversed.state, 'b').clip.start, originalB);
  const snapped = T.move(state, ['a', 'b'], { deltaBeats: .25, anchorId: 'a' });
  assert.equal(find(snapped.state, 'a').clip.start, 2.25, 'Mouse movement still snaps its anchor by default');
  const clamped = T.move(state, ['a', 'b'], { deltaBeats: -100, quantize: false });
  assert.equal(find(clamped.state, 'a').clip.start, 0); close(find(clamped.state, 'b').clip.start, originalB - originalA);
});

check('Simultaneous outgoing clips free destination capacity and overflowing groups reject atomically', () => {
  const state = fixture(); state.tracks[2].clips = [];
  state.tracks[1].clips = Array.from({ length: 128 }, (_, index) => audio(index ? 'fill-' + index : 'b', 0, 1));
  const before = JSON.stringify(state), good = T.move(state, ['a', 'b'], { deltaTracks: 1 });
  assert(good.ok && good.changed); assert.equal(good.state.tracks[1].clips.length, 128); assert.equal(good.state.tracks[2].clips.length, 1); assert.equal(JSON.stringify(state), before);
  state.tracks[2].clips = Array.from({ length: 128 }, (_, index) => audio('full-' + index, 0, 1));
  const frozenInput = JSON.stringify(state), bad = T.move(state, ['a', 'b'], { deltaTracks: 1, deltaBeats: 2 });
  assert(!bad.ok && !bad.changed); assert.match(bad.reason, /128-clip/); assert.equal(bad.state, state); assert.equal(bad.moves.length, 0); assert.equal(JSON.stringify(state), frozenInput);
});

check('Frozen sources and destinations reject a whole group while powered-off tracks stay editable', () => {
  const source = fixture(); source.tracks[2].freeze = { fingerprint: 'cache' };
  const failed = T.move(source, ['a', 'b'], { deltaBeats: 1 }); assert(!failed.ok); assert.equal(failed.state, source); assert.equal(find(source, 'a').clip.start, 2);
  const destination = fixture(); destination.tracks[3].freeze = { fingerprint: 'cache' };
  const blocked = T.move(destination, ['a', 'b'], { deltaTracks: 1, deltaBeats: 1 }); assert(!blocked.ok); assert.match(blocked.reason, /Unfreeze Track 4/); assert.equal(blocked.state, destination);
  const noOp = T.move(source, ['a', 'b'], { deltaBeats: 0, deltaTracks: 0 }); assert(noOp.ok && !noOp.changed); assert.equal(noOp.state, source);
  const off = fixture(); off.tracks[0].disabled = true; off.tracks[3].disabled = true; off.tracks[7].freeze = { fingerprint: 'unrelated' };
  const allowed = T.move(off, ['a', 'b'], { deltaTracks: 1, deltaBeats: 1 }); assert(allowed.ok); assert.equal(find(allowed.state, 'b').trackIndex, 3); assert.equal(allowed.state.tracks[7], off.tracks[7]);
});

check('Missing IDs, stale anchors and malformed movement never partially apply', () => {
  const state = deepFreeze(fixture()), before = JSON.stringify(state);
  for (const [ids, options] of [[['a', 'missing'], { deltaBeats: 1 }], [['a', 'b'], { anchorId: 'missing', deltaBeats: 1 }], [['a'], { deltaBeats: NaN }], [['a'], { deltaTracks: .5 }], [['a'], { snap: -1, deltaBeats: 1 }], [[null], { deltaBeats: 1 }]]) {
    const result = T.move(state, ids, options); assert(!result.ok); assert(!result.changed); assert.equal(result.state, state); assert.equal(result.moves.length, 0);
  }
  assert.equal(JSON.stringify(state), before); assert.equal(T.entries(state, ['a', 'missing']).length, 1);
  const empty = T.move(state, [], { deltaBeats: 1 }); assert(empty.ok && !empty.changed); assert.equal(empty.state, state);
  const duplicateIds = T.move(state, ['a', 'a'], { deltaBeats: 1 }); assert(duplicateIds.ok); assert.equal(duplicateIds.moves.length, 1);
});

check('Preview planning and clamped no-ops preserve state identity and original clip order', () => {
  const state = fixture(); state.tracks[0].clips.unshift(audio('earlier-array-entry', 20));
  const before = JSON.stringify(state), plan = T.planMove(state, ['a', 'b'], { deltaBeats: 3, deltaTracks: 1 });
  assert(plan.ok && plan.changed); assert.equal(plan.state, state); assert.equal(JSON.stringify(state), before); assert.equal(plan.moves[0].clip, find(state, 'a').clip);
  const moved = T.move(state, ['a'], { deltaBeats: 1 }); assert.deepEqual(moved.state.tracks[0].clips.map(clip => clip.id), ['earlier-array-entry', 'a']);
  const noOp = T.move(state, ['a', 'b'], { deltaTracks: -100 }); assert(noOp.ok && !noOp.changed); assert.equal(noOp.state, state);
});

check('Varied deterministic selections keep their relative timing, lanes and payloads at both boundaries', () => {
  let seed = 4931;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let trial = 0; trial < 60; trial++) {
    const state = fixture(); state.tracks.forEach(track => { track.clips = []; });
    const ids = Array.from({ length: 2 + trial % 5 }, (_, index) => 'case-' + index);
    ids.forEach((id, index) => state.tracks[index + 1].clips.push(audio(id, random() * 18, .25 + random() * 4)));
    const original = ids.map(id => find(state, id)), anchorId = ids[trial % ids.length], result = T.move(deepFreeze(state), ids, { anchorId, deltaBeats: (random() - .5) * 150, deltaTracks: trial % 2 ? 100 : -100, snap: [.125, .25, 1, 4][trial % 4] });
    assert(result.ok); const actual = ids.map(id => find(result.state, id));
    for (let index = 0; index < ids.length; index++) {
      const old = original[index], next = actual[index];
      assert(next.clip.start >= -1e-11 && next.clip.start + next.clip.length <= 32 + 1e-11);
      close(next.clip.start - actual[0].clip.start, old.clip.start - original[0].clip.start);
      assert.equal(next.trackIndex - actual[0].trackIndex, old.trackIndex - original[0].trackIndex);
      assert.deepEqual({ ...next.clip, start: old.clip.start }, old.clip);
    }
  }
});

console.log(passed + ' timeline group-move invariant groups passed.');
