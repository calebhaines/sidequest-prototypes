import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { loadDsp } from './dsp-loader.mjs';
const loaded = await loadDsp(['audio', 'sequencing', 'pattern-chain', 'sound-locks']);
after(loaded.cleanup);
const audio = loaded.audio, sequence = loaded.sequencing, chain = loaded['pattern-chain'], locks = loaded['sound-locks'];
function fixture(length = 16) {
  const sound = audio.cloneParams(audio.PRESETS.find(value => value.id === 'dry-snap').params);
  delete sound.architecture; sound.mix.volume = .12; sound.effects.reverb = sound.effects.delay = 0;
  const steps = Array.from({ length: 8 }, () => Array(length).fill(false)); steps[0][0] = true;
  return chain.syncPatternState({ name: 'Compact service', sounds: Array.from({ length: 8 }, () => audio.cloneParams(sound)), steps, stepDetails: sequence.createStepDetails(steps), selectedBank: 0, bpm: 120, swing: 0, muted: Array(8).fill(false) });
}
function changeBank(p, index, voice, length = 16) {
  let next = chain.selectPatternBank(p, index); next = chain.resizePattern(next, length);
  next.steps = next.steps.map(row => row.map(() => false)); next.steps[voice][0] = true;
  return chain.syncPatternState(next);
}
function setupChain() {
  let p = fixture(); p = changeBank(p, 1, 1); p = changeBank(p, 2, 2, 32); p = chain.selectPatternBank(p, 0);
  p.chain = { enabled: true, loop: false, entries: [{ bank: 0, repeats: 2 }, { bank: 1, repeats: 1 }, { bank: 2, repeats: 1 }] }; return p;
}
function peak(data, start = 0, end = data.length) { let p = 0; for (let i = start; i < end; i++) p = Math.max(p, Math.abs(data[i])); return p; }
function difference(a, b) { assert.equal(a.length, b.length); let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; }

test('old grids migrate to four banks and disabled chain without altering notes or details', () => {
  const p = fixture(), old = { ...p }; delete old.patternBanks; delete old.selectedBank; delete old.chain;
  const result = chain.syncPatternState(old);
  assert.deepEqual(result.steps, old.steps); assert.deepEqual(result.stepDetails, old.stepDetails);
  assert.equal(result.patternBanks.length, 4); assert.equal(result.selectedBank, 0);
  assert.deepEqual(result.chain, { enabled: false, loop: true, entries: [] });
  assert(result.patternBanks.slice(1).every(bank => bank.steps.every(row => row.every(hit => hit === false))));
  assert.equal(chain.validPatternState(result), true);
});

test('bank selection, copying and 16/32 resizing preserve hidden hits and independent sound locks', () => {
  let p = fixture(32); p.steps[0][31] = true; p.stepDetails[0][31].locks = { cutoff: 713, pan: -.4 };
  p = chain.syncPatternState(p); const original = structuredClone(p);
  p = chain.resizePattern(p, 16); p = chain.syncPatternState(p); p = changeBank(p, 1, 1); p = chain.selectPatternBank(p, 0);
  assert.equal(p.steps[0].length, 16);
  p = chain.resizePattern(p, 32);
  assert.equal(p.steps[0][31], true); assert.deepEqual(p.stepDetails[0][31].locks, { cutoff: 713, pan: -.4 });
  p = chain.syncPatternState(p); p.patternBanks[1] = structuredClone(p.patternBanks[0]); p = chain.selectPatternBank(p, 1);
  p.stepDetails[0][31].locks.cutoff = 2000; p = chain.syncPatternState(p); p = chain.selectPatternBank(p, 0);
  assert.equal(p.stepDetails[0][31].locks.cutoff, 713); assert.deepEqual(original.stepDetails[0][31].locks, { cutoff: 713, pan: -.4 });
});

test('complete chain uses each pattern length and repeat count, with explicit scope and no mutation', () => {
  const p = setupChain(), before = JSON.stringify(p);
  const packet = chain.sequencerPattern(p);
  assert.equal(packet.lengthBeats, 20);
  assert.deepEqual(packet.notes.map(note => note.voice), ['voice-0', 'voice-0', 'voice-1', 'voice-2']);
  assert.deepEqual(packet.notes.map(note => note.beat), [0, 4, 8, 12]);
  assert.equal(chain.sequencerPattern(p, { scope: 'pattern' }).lengthBeats, 4);
  p.chain.enabled = false;
  assert.equal(chain.sequencerPattern(p).lengthBeats, 4);
  assert.equal(chain.sequencerPattern(p, { scope: 'chain' }).lengthBeats, 20);
  p.chain.enabled = true; assert.equal(JSON.stringify(p), before);
  const empty = fixture(); assert.throws(() => chain.sequencerPattern(empty, { scope: 'chain' }), /Add a pattern/);
  assert.throws(() => chain.sequencerPattern(empty, { scope: 'unknown' }), /Choose/);
});

test('portable chain timing retains swing, ratchets, probabilities, pitch and fresh per-hit locks', () => {
  const p = setupChain(); p.swing = 40;
  p.steps[0][1] = true; p.stepDetails[0][1] = { velocity: .4, probability: .6, ratchet: 3, timing: -.1, pitch: 7, locks: { cutoff: 873, drive: .2 } };
  const packet = chain.sequencerPattern(p), notes = packet.notes.filter(note => note.beat > 0 && note.beat < 1);
  assert.equal(notes.length, 3); assert(notes.every(note => note.velocity === .4 && note.probability === .6 && note.pitch === 43));
  assert(Math.abs(notes[0].beat - .325) < 1e-10); assert(notes.every(note => note.locks.cutoff === 873));
  notes[0].locks.cutoff = 20; assert.equal(p.stepDetails[0][1].locks.cutoff, 873); assert.equal(notes[1].locks.cutoff, 873);
  const events = chain.sequencerEvents(p, { repetitions: 2 }); assert.equal(events.durationSeconds, 20);
  const details = sequence.createStepDetails(p.steps); details[0][0].locks = { cutoff: 400 };
  const hits = sequence.eventsForStep(p.steps, details, 0, 0, 120, 0); hits[0].locks.cutoff = 20; assert.equal(details[0][0].locks.cutoff, 400);
});

test('malformed new chain/bank/lock fields and oversized expansions are rejected', () => {
  for (const bad of [null, [], { cutoff: '20' }, { cutoff: NaN }, { cutoff: 20001 }, { resonance: 0 }, { pan: 2 }, { madeUp: .1 }]) {
    assert.equal(locks.validSoundLocks(bad), false); assert.throws(() => locks.normalizeSoundLocks(bad, true), /Invalid/);
  }
  for (const patch of [p => p.chain.entries.push({ bank: 4, repeats: 1 }), p => p.chain.entries[0].repeats = 17, p => p.patternBanks[2].steps[0].pop(), p => p.selectedBank = 4, p => p.patternBanks[0].stepDetails[0][0].locks = { cutoff: 0 }, p => p.chain.entries = Array.from({ length: 32 }, () => ({ bank: 2, repeats: 16 }))]) {
    const p = setupChain(); patch(p); assert.equal(chain.validPatternState(p), false);
  }
  const p = setupChain(); p.chain.entries = [{ bank: 2, repeats: 16 }, { bank: 2, repeats: 16 }, { bank: 2, repeats: 1 }];
  assert.throws(() => chain.sequenceRuns(p), /256 beats/);
  const dense = fixture(); dense.steps.forEach(row => row.fill(true)); dense.stepDetails.forEach(row => row.forEach(detail => detail.ratchet = 4));
  dense.chain = { enabled: true, loop: true, entries: [{ bank: 0, repeats: 16 }] };
  assert.throws(() => chain.sequencerPattern(dense), /4,096/);
});

test('per-step sound snapshots affect only that strike and leave the burner immutable', () => {
  const p = fixture(), base = structuredClone(p.sounds[0]);
  const altered = audio.applySoundLocks(base, { pan: -.9, level: .3, decay: .7, drive: .8 });
  assert.equal(altered.mix.pan, -.9); assert.equal(altered.mix.volume, .3); assert.equal(altered.tone.decay, 700); assert.equal(altered.effects.drive, .8);
  assert.deepEqual(base, p.sounds[0]);
  assert.throws(() => audio.applySoundLocks(base, { cutoff: Infinity }), /Invalid/);
});

test('native pattern and native event PCM agree on cutoff/Q/pan/drive locks and unlocked inheritance', async () => {
  const p = fixture(), sr = 48000;
  p.steps[0][4] = p.steps[0][8] = true;
  p.stepDetails[0][0].locks = { cutoff: 350, resonance: .8, pan: -1 };
  p.stepDetails[0][4].locks = { cutoff: 2400, drive: .4, pan: 1 };
  p.stepDetails[0][8].pitch = 7;
  const before = JSON.stringify(p);
  const source = chain.sequencerEvents(p), exact = audio.renderExactPatternEvents(p.sounds, source.events, { sampleRate: sr, durationSeconds: 2, tailSeconds: 0, master: 1 });
  const pattern = audio.renderPattern(p.sounds.map((params, voice) => ({ params, steps: p.steps[voice], stepDetails: p.stepDetails[voice] })), p.bpm, { sampleRate: sr, tail: false });
  assert(difference(pattern[0], exact[0]) < 2e-7); assert(difference(pattern[1], exact[1]) < 2e-7);
  const native = await audio.renderNativeEvents(p.sounds, source.events, { durationSeconds: 2, tailSeconds: 0, master: 1 });
  const l = Float32Array.from({ length: native.pcm.length / 2 }, (_, index) => native.pcm[index * 2]);
  assert(difference(l, exact[0]) < 2e-7); assert.equal(JSON.stringify(p), before);
  assert(peak(pattern[0], 0, 3000) > 0); assert.equal(peak(pattern[1], 0, 3000), 0, 'The first locked strike is fully left.');
  const unlocked = audio.renderExactPatternEvents(p.sounds, [{ voice: 0, at: 0, velocity: 1 }], { sampleRate: sr, durationSeconds: 1, tailSeconds: 0, master: 1 });
  const filtered = audio.renderExactPatternEvents(p.sounds, [{ voice: 0, at: 0, velocity: 1, locks: { cutoff: 100 } }], { sampleRate: sr, durationSeconds: 1, tailSeconds: 0, master: 1 });
  assert(difference(unlocked[0], filtered[0]) > .001, 'The cutoff lock changes real PCM.');
});

test('asynchronous native renders snapshot both sounds and event locks before yielding', async () => {
  const p = fixture(), events = [{ voice: 0, at: 0, velocity: .6, locks: { cutoff: 700 } }, { voice: 0, at: .5, velocity: .8, locks: { cutoff: 1300, pan: -.7 } }];
  const expected = await audio.renderNativeEvents(p.sounds, structuredClone(events), { durationSeconds: 1, tailSeconds: 0, master: 1 });
  const pending = audio.renderNativeEvents(p.sounds, events, { durationSeconds: 1, tailSeconds: 0, master: 1 });
  p.sounds[0].mix.volume = 0; events[1].locks.cutoff = 20; events[1].at = .9;
  const result = await pending; assert.equal(difference(result.pcm, expected.pcm), 0);
});

test('a long decay lock at the final step receives its complete native export tail', () => {
  const p = fixture(); p.steps[0].fill(false); p.steps[0][15] = true; p.stepDetails[0][15].locks = { decay: 2 };
  const sound = p.sounds[0]; sound.tone.decay = 20; sound.noise.decay = 20;
  const result = audio.renderPattern([{ params: sound, steps: p.steps[0], stepDetails: p.stepDetails[0] }], 120, { sampleRate: 8000, tail: true });
  const locked = audio.renderSound(audio.applySoundLocks(sound, { decay: 2 }), 8000);
  assert(result[0].length >= (2 + locked.length / 8000) * 8000 - 1);
  assert(peak(result[0], 20000, Math.min(result[0].length, 28000)) > 1e-5, 'The locked final note is not cut to the base sound duration.');
});
