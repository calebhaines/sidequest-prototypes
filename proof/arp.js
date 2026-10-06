/* A worklet-safe, absolute-beat arpeggiator. No browser clocks or mutable random stream. */
function createProofArp() {
  'use strict';
  const scales = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], pentatonic: [0, 2, 4, 7, 9], harmonic: [0, 2, 3, 5, 7, 8, 11] };
  const qualities = { diatonic: [0, 2, 4], major: [0, 4, 7], minor: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dominant7: [0, 4, 7, 10], add9: [0, 4, 7, 14], min9: [0, 3, 7, 10, 14], sus2: [0, 2, 7], sus4: [0, 5, 7], dim7: [0, 3, 6, 9] };
  const divisions = { '1/32': .125, '1/16': .25, '1/16T': 1 / 6, '1/8': .5, '1/8T': 1 / 3, '1/4': 1, '1/4T': 2 / 3 };
  const mod = (n, d) => ((n % d) + d) % d, clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function random(seed, tick, salt = 0) { let h = (seed >>> 0) ^ Math.imul((tick >>> 0) + 1, 0x9e3779b1) ^ Math.imul((salt >>> 0) + 1, 0x85ebca6b) ^ Math.floor(tick / 4294967296); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function noteName(midi) { const n = Math.round(midi); return Number.isFinite(n) ? ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][mod(n, 12)] + (Math.floor(n / 12) - 1) : '—'; }
  function scaleNote(state, degree) { const scale = scales[state.scale] || scales.minor; return state.root + scale[mod(degree, scale.length)] + 12 * Math.floor(degree / scale.length); }
  function chordNotes(state, chord) {
    if (typeof chord === 'number') chord = state.chords[chord]; chord = chord || state.chords[state.selectedChord || 0]; if (!chord) return [];
    const degree = chord.degree || 0, base = scaleNote(state, degree), intervals = qualities[chord.quality] || qualities.diatonic;
    let notes = intervals.map(n => chord.quality === 'diatonic' ? scaleNote(state, degree + n) : base + n).sort((a, b) => a - b), inversion = clamp(chord.inversion || 0, -4, 4);
    while (inversion > 0) { notes.push(notes.shift() + 12); notes.sort((a, b) => a - b); inversion--; } while (inversion < 0) { notes.unshift(notes.pop() - 12); notes.sort((a, b) => a - b); inversion++; }
    notes = notes.map((n, i) => Math.round(clamp(n + Math.floor(i / 2) * (chord.spread || 0) * 12, 0, 127))); return Array.from(new Set(notes)).sort((a, b) => a - b);
  }
  function chordName(state, chord) { if (typeof chord === 'number') chord = state.chords[chord]; chord = chord || state.chords[state.selectedChord || 0]; if (!chord) return '—'; const degree = chord.degree || 0, root = scaleNote(state, degree); let suffix = { diatonic: '', major: '', minor: 'm', maj7: 'maj7', min7: 'm7', dominant7: '7', add9: 'add9', min9: 'm9', sus2: 'sus2', sus4: 'sus4', dim7: '°7' }[chord.quality] || ''; if (chord.quality === 'diatonic') { const third = mod(scaleNote(state, degree + 2) - root, 12), fifth = mod(scaleNote(state, degree + 4) - root, 12); suffix = third === 3 ? fifth === 6 ? '°' : 'm' : fifth === 8 ? '+' : ''; } return noteName(root).replace(/-?\d+$/, '') + suffix; }
  function progressionLength(state) { if (state.musicLabPattern?.pattern) return state.musicLabPattern.pattern.lengthBeats; const division = divisions[state.arp?.division] || .25; if (state.source !== 'progression') return (state.patterns?.[state.selectedPattern || 0]?.length || 16) * division; return Math.max(4, (state.chords || []).reduce((sum, chord) => sum + (chord.enabled ? chord.bars * 4 : 0), 0)); }
  function sourceAt(state, beat) {
    if (state.source === 'held') return { chord: -1, notes: Array.from(new Set(state.heldNotes || [])).sort((a, b) => a - b) };
    if (state.source === 'single') { const chord = state.selectedChord || 0; return { chord, notes: chordNotes(state, chord) }; }
    const active = (state.chords || []).map((c, i) => ({ ...c, index: i })).filter(c => c.enabled); if (!active.length) return { chord: -1, notes: [] };
    const length = active.reduce((sum, c) => sum + c.bars * 4, 0); let position = mod(beat, length);
    for (const chord of active) { if (position < chord.bars * 4 - 1e-10) return { chord: chord.index, notes: chordNotes(state, chord) }; position -= chord.bars * 4; }
    return { chord: active[0].index, notes: chordNotes(state, active[0]) };
  }
  function orderFor(direction, count) {
    const up = Array.from({ length: count }, (_, i) => i); if (count < 2) return up;
    if (direction === 'down') return up.reverse(); if (direction === 'updown') return up.concat(up.slice(1, -1).reverse()); if (direction === 'downup') return up.slice().reverse().concat(up.slice(1, -1));
    if (direction === 'skip') return up.filter(i => i % 2 === 0).concat(up.filter(i => i % 2 !== 0));
    if (direction === 'outsidein' || direction === 'insideout') { const outside = []; for (let lo = 0, hi = count - 1; lo <= hi; lo++, hi--) { outside.push(lo); if (hi !== lo) outside.push(hi); } return direction === 'insideout' ? outside.reverse() : outside; }
    return up;
  }
  function poolAt(state, tick) {
    const arp = state.arp, division = divisions[arp.division] || .25, source = sourceAt(state, tick * division), expanded = [];
    for (let octave = 0; octave < arp.octaves; octave++) for (const note of source.notes) expanded.push(clamp(note + octave * 12, 0, 127));
    const notes = Array.from(new Set(expanded)).sort((a, b) => a - b); return { chord: source.chord, notes };
  }
  function chooseNotes(state, tick, pool) {
    const arp = state.arp, count = pool.length; if (!count) return [];
    const order = orderFor(arp.direction, count), index = Math.floor(tick / arp.repeat) + arp.rotate, cycleLength = arp.direction === 'walk' ? Math.max(16, count * 4) : order.length, cycle = Math.floor(index / cycleLength), foldPhase = Math.floor(cycle / arp.foldEvery);
    let indices;
    if (arp.direction === 'chord') indices = order.slice();
    else if (arp.direction === 'random') indices = [Math.floor(random(state.seed, Math.floor(tick / arp.repeat), 12) * count)];
    else if (arp.direction === 'walk') { let walk = Math.floor(random(state.seed, 0, 17) * count); const position = mod(index, cycleLength), half = cycleLength / 2; for (let i = 0; i < Math.min(position, half); i++) walk += random(state.seed, cycle * half + i, 18) < .5 ? -1 : 1; if (position > half) for (let i = 0; i < position - half; i++) walk -= random(state.seed, cycle * half + half - 1 - i, 18) < .5 ? -1 : 1; indices = [mod(walk, count)]; }
    else indices = [order[mod(index, order.length)]];
    if (arp.fold === 'reverse' && mod(foldPhase, 2) === 1) indices = indices.map(i => count - 1 - i);
    if (arp.fold === 'rotate') indices = indices.map(i => mod(i + foldPhase, count));
    let notes = indices.map(i => pool[i]);
    if (arp.fold === 'mirror' && mod(foldPhase, 2) === 1) notes = notes.map(n => pool[0] + pool[count - 1] - n);
    if (arp.fold === 'rise' || arp.fold === 'fall') { const shift = mod(foldPhase, 3) * 12 * (arp.fold === 'rise' ? 1 : -1); notes = notes.map(n => n + shift); }
    return notes;
  }
  function tickStart(state, tick, x, division) { return Math.max(0, tick * division + (tick % 2 ? state.swing * division : 0) + (x.offset || 0) * division); }
  function nativeTick(state, tick) {
    const arp = state.arp, division = divisions[arp.division] || .25, pattern = state.patterns[state.selectedPattern || 0], length = pattern.length, stepIndex = mod(tick, length), x = pattern.steps[stepIndex];
    if (!x.on || x.tie || x.velocity <= 0 || x.probability <= 0) return [];
    const source = poolAt(state, tick), notes = chooseNotes(state, tick, source.notes); if (!notes.length) return [];
    const ratchet = x.ratchet || 1, result = [], starts = [];
    for (let hit = 0; hit < ratchet; hit++) { if (random(state.seed, tick, 100 + hit) >= x.probability) continue; starts.push(hit); }
    let tieEnd = null;
    for (let distance = 1; distance < length; distance++) { const next = pattern.steps[mod(tick + distance, length)]; if (!next.on || !next.tie) break; tieEnd = tickStart(state, tick + distance, next, division) + division * arp.gate * next.gate; }
    const lastHit = starts[starts.length - 1];
    for (const hit of starts) {
      const startBeat = tickStart(state, tick, x, division) + hit * division / ratchet, baseDuration = Math.max(.001, division / ratchet * arp.gate * x.gate), durationBeats = hit === lastHit && tieEnd !== null ? Math.max(baseDuration, tieEnd - startBeat) : baseDuration;
      for (let i = 0; i < notes.length; i++) {
        let note = notes[i]; if (arp.spice > 0 && arp.direction !== 'chord' && random(state.seed, tick, 200 + hit) < arp.spice) { const nearest = source.notes.reduce((best, n, at) => Math.abs(n - note) < Math.abs(source.notes[best] - note) ? at : best, 0), neighbor = mod(nearest + (random(state.seed, tick, 210 + hit) < .5 ? -1 : 1), source.notes.length); note += source.notes[neighbor] - source.notes[nearest]; }
        const velocity = clamp(x.velocity * (1 + arp.spice * .22 * (random(state.seed, tick, 300 + hit * 31 + i) * 2 - 1)), 0, 1);
        result.push({ note: Math.round(clamp(note + arp.transpose + x.octave * 12, 0, 127)), velocity, startBeat, durationBeats, voiceId: 'synth', step: stepIndex, chord: source.chord });
      }
    }
    return result;
  }
  function overlayEvents(state, startBeat, lengthBeats) {
    const packet = state.musicLabPattern.pattern, length = packet.lengthBeats, end = startBeat + lengthBeats, result = [], seed = packet.seed === undefined ? state.seed : packet.seed;
    const first = Math.max(0, Math.floor(startBeat / length) - 1), last = Math.floor((end - 1e-10) / length);
    for (let cycle = first; cycle <= last; cycle++) packet.notes.forEach((note, index) => {
      // Portable swing belongs to its own 16th grid, independent of the native arp rate.
      const grid = note.beat * 4, offbeat = Math.abs(grid - Math.round(grid)) < 1e-7 && Math.round(grid) % 2;
      const localBeat = note.beat + (offbeat ? (packet.swing || 0) / 4 : 0), beat = cycle * length + localBeat, durationBeats = Math.min(note.duration, length - localBeat);
      if (durationBeats <= 0 || beat < startBeat - 1e-9 || beat >= end - 1e-9 || note.velocity <= 0 || random(seed, cycle, index + 400) >= note.probability) return;
      result.push({ note: note.pitch, velocity: note.velocity, startBeat: beat, durationBeats, voiceId: 'synth', step: Math.floor(note.beat / (divisions[state.arp.division] || .25)) % 16, chord: -1 });
    });
    return result.sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
  }
  function tickEvents(state, tick) { if (!Number.isSafeInteger(tick) || tick < 0) return []; if (state.musicLabPattern?.pattern) { const division = divisions[state.arp.division] || .25; return overlayEvents(state, tick * division, division); } return nativeTick(state, tick); }
  function events(state, options = {}) {
    const startBeat = options.startBeat === undefined ? 0 : options.startBeat, lengthBeats = options.lengthBeats === undefined ? 16 : options.lengthBeats;
    if (!Number.isFinite(startBeat) || startBeat < 0 || !Number.isFinite(lengthBeats) || lengthBeats <= 0 || lengthBeats > 16384) throw new Error('Choose a finite LEAVEN event range.');
    if (state.musicLabPattern?.pattern) return overlayEvents(state, startBeat, lengthBeats);
    const division = divisions[state.arp.division] || .25, end = startBeat + lengthBeats, first = Math.max(0, Math.floor(startBeat / division) - 2), last = Math.ceil(end / division) + 1, result = [];
    for (let tick = first; tick <= last; tick++) for (const event of nativeTick(state, tick)) if (event.startBeat >= startBeat - 1e-9 && event.startBeat < end - 1e-9) result.push(event);
    return result.sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
  }
  return Object.freeze({ events, tickEvents, progressionLength, noteName, chordName, chordNotes });
}
(function (global) { global.createProofArp = createProofArp; global.ProofArp = createProofArp(); })(typeof window === 'object' ? window : globalThis);
