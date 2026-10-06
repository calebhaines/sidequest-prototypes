/* MARINADE's beat-addressed sequence. No wall clocks, mutable chance stream, or quantization. */
function createMarinadeSequence() {
  'use strict';
  const divisions = { '1/32': .125, '1/16': .25, '1/16T': 1 / 6, '1/8': .5, '1/8T': 1 / 3, '1/4': 1 };
  const chords = { single: [0], major: [0, 4, 7], minor: [0, 3, 7], fifth: [0, 7], sus2: [0, 2, 7] };
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  function random(seed, tick, salt = 0) { let hash = (seed >>> 0) ^ Math.imul((tick >>> 0) + 1, 0x9e3779b1) ^ Math.imul((salt >>> 0) + 1, 0x85ebca6b) ^ Math.floor(tick / 4294967296); hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16; return (hash >>> 0) / 4294967296; }
  function patternLength(state) { return state.musicLabPattern?.pattern ? state.musicLabPattern.pattern.lengthBeats : state.sequence.length * (divisions[state.sequence.division] || .5); }
  function nativeTick(state, tick) {
    const sequence = state.sequence, division = divisions[sequence.division] || .5, index = mod(tick, sequence.length), step = sequence.steps[index];
    if (!step || !step.on || step.velocity <= 0 || step.probability <= 0) return [];
    const result = [], intervals = chords[step.chord] || chords.single, ratchet = step.ratchet || 1;
    // A negative first-step offset leads the next cycle near this phrase's end.
    // Clamping it to zero would export an extra hit at every repeated boundary.
    const base = tick * division + (tick % 2 ? state.swing * division : 0) + step.offset * division;
    for (let hit = 0; hit < ratchet; hit++) {
      if (random(state.seed, tick, 100 + hit) >= step.probability) continue;
      const startBeat = base + hit * division / ratchet, durationBeats = division / ratchet * sequence.gate * step.gate;
      const notes = new Set();
      for (const interval of intervals) { const note = Math.round(clamp(step.note + sequence.transpose + interval, 0, 127)); if (notes.has(note)) continue; notes.add(note); result.push({ note, velocity: step.velocity, startBeat, durationBeats, voiceId: 'synth', step: index }); }
    }
    return result;
  }
  function overlayEvents(state, startBeat, lengthBeats) {
    const packet = state.musicLabPattern.pattern, length = packet.lengthBeats, end = startBeat + lengthBeats, result = [], seed = packet.seed === undefined ? state.seed : packet.seed;
    const first = Math.max(0, Math.floor(startBeat / length) - 1), last = Math.floor(end / length);
    for (let cycle = first; cycle <= last; cycle++) for (let index = 0; index < packet.notes.length; index++) {
      const note = packet.notes[index], grid = note.beat * 4, offbeat = Math.abs(grid - Math.round(grid)) < 1e-7 && mod(Math.round(grid), 2) === 1;
      // Packet swing has its own 16th-note meaning. Fractional imported positions stay exact.
      const localBeat = note.beat + (offbeat ? (packet.swing || 0) / 4 : 0), start = cycle * length + localBeat, duration = Math.min(note.duration, length - localBeat);
      if (duration <= 0 || start < startBeat || start >= end || note.velocity <= 0 || random(seed, cycle, index + 400) >= note.probability) continue;
      result.push({ note: note.pitch, velocity: note.velocity, startBeat: start, durationBeats: duration, voiceId: 'synth', step: Math.floor(note.beat / (divisions[state.sequence.division] || .5)) % 16 });
    }
    return result.sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
  }
  function events(state, options = {}) {
    const startBeat = options.startBeat === undefined ? 0 : options.startBeat, lengthBeats = options.lengthBeats === undefined ? patternLength(state) : options.lengthBeats;
    if (!Number.isFinite(startBeat) || startBeat < 0 || !Number.isFinite(lengthBeats) || lengthBeats <= 0 || lengthBeats > 16384 || !Number.isSafeInteger(Math.floor((startBeat + lengthBeats) * 32))) throw new Error('Choose a finite MARINADE event range.');
    if (state.musicLabPattern?.pattern) return overlayEvents(state, startBeat, lengthBeats);
    const division = divisions[state.sequence.division] || .5, end = startBeat + lengthBeats, first = Math.max(0, Math.floor(startBeat / division) - 2), last = Math.ceil(end / division) + 1, result = [];
    for (let tick = first; tick <= last; tick++) for (const event of nativeTick(state, tick)) if (event.startBeat >= startBeat && event.startBeat < end) result.push(event);
    return result.sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
  }
  function tickEvents(state, tick) { if (!Number.isSafeInteger(tick) || tick < 0) return []; if (state.musicLabPattern?.pattern) { const division = divisions[state.sequence.division] || .5; return overlayEvents(state, tick * division, division); } return nativeTick(state, tick).filter(event => event.startBeat >= 0); }
  return Object.freeze({ events, tickEvents, stepEvents: tickEvents, patternLength, random });
}
(function (global) { global.createMarinadeSequence = createMarinadeSequence; global.MarinadeSequence = createMarinadeSequence(); })(typeof window === 'object' ? window : globalThis);
