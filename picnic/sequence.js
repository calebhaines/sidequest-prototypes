/* Original village sketches and one absolute-beat event path for live and offline PICNIC. */
(function (global) {
  'use strict';
  const S = global.PicnicSchema;
  if (!S) throw new Error('Load PICNIC’s score schema before its composer.');
  const EPS = 1e-9, MAX_EVENTS = 131072;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const hashText = text => { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return value >>> 0; };
  function random(seed, ...coordinates) {
    let value = seed >>> 0;
    for (const coordinate of coordinates) {
      const word = typeof coordinate === 'string' ? hashText(coordinate) : coordinate >>> 0;
      value ^= Math.imul(word + 1, 0x9e3779b1); value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15; value = Math.imul(value, 0x846ca68b); value ^= value >>> 16;
    }
    return (value >>> 0) / 4294967296;
  }
  function noteName(midi) {
    if (!Number.isFinite(midi)) return '—';
    const note = Math.round(midi);
    return S.KEYS[mod(note, 12)] + (Math.floor(note / 12) - 1);
  }
  function scaleNote(state, degree, octave = 4) {
    const scale = S.SCALES[state.scale] || S.SCALES.major, index = Math.round(degree);
    return clamp((octave + 1) * 12 + state.key + Math.floor(index / scale.length) * 12 + scale[mod(index, scale.length)], 0, 127);
  }
  function chordRoot(state, symbol, octave = 3) {
    const chord = S.CHORDS[symbol];
    if (!chord) throw new Error('Choose one of PICNIC’s chord symbols.');
    const scale = S.SCALES[state.scale] || S.SCALES.major;
    // Roman chord degrees always refer to seven harmonic degrees. Pentatonic
    // controls melody; it does not turn vi into a ninth above the tonic.
    const harmonic = scale.length === 7 ? scale : S.SCALES.major;
    return clamp((octave + 1) * 12 + state.key + (chord.semitone ?? harmonic[chord.degree]), 0, 127);
  }
  function chordNotes(state, symbol, octave = 3) {
    const chord = S.CHORDS[symbol], root = chordRoot(state, symbol, octave);
    return chord.intervals.map(interval => clamp(root + interval, 0, 127));
  }
  function phraseBanks(state) {
    if (!state || !Array.isArray(state.banks) || state.banks.length !== 4) throw new Error('Choose a complete PICNIC score.');
    const order = state.chain ? state.chainOrder : [state.selectedBank];
    if (!Array.isArray(order) || !order.length) throw new Error('Choose at least one PICNIC bank.');
    let offset = 0;
    return order.map((index, position) => {
      const bank = state.banks[index];
      if (!bank || ![16, 32].includes(bank.length)) throw new Error('Choose a 16- or 32-step PICNIC bank.');
      const entry = { bank, index, position, start: offset, length: bank.length / 4 }; offset += entry.length; return entry;
    });
  }
  function lengthBeats(state) {
    if (state.musicLabPattern) return state.musicLabPattern.pattern.lengthBeats;
    return phraseBanks(state).reduce((length, entry) => length + entry.length, 0);
  }
  function events(state, { startBeat = 0, lengthBeats: requestedLength, realizeProbability = true } = {}) {
    const phraseLength = lengthBeats(state), range = requestedLength === undefined ? phraseLength : requestedLength;
    if (!Number.isFinite(startBeat) || startBeat < 0 || !Number.isFinite(range) || range <= 0 || range > 16384 || typeof realizeProbability !== 'boolean') throw new Error('Choose a finite PICNIC event range of at most 16,384 beats.');
    const endBeat = startBeat + range;
    if (!Number.isSafeInteger(Math.floor(endBeat * 1024))) throw new Error('The PICNIC event position is too large.');
    const parts = new Map(state.parts.map(part => [part.id, part])), hasSolo = state.parts.some(part => part.solo);
    const audible = voice => { const part = parts.get(voice); return part && !part.mute && (!hasSolo || part.solo); };
    const result = [];
    const add = event => {
      if (event.startBeat < startBeat - EPS || event.startBeat >= endBeat - EPS) return;
      if (result.length >= MAX_EVENTS) throw new Error('This PICNIC phrase contains too many events. Request a shorter range.');
      result.push(event);
    };
    const firstCycle = Math.max(0, Math.floor(startBeat / phraseLength)), lastCycle = Math.floor((endBeat - EPS) / phraseLength);
    if (state.musicLabPattern) {
      const { pattern, voiceMap } = state.musicLabPattern, seed = pattern.seed ?? state.seed;
      for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
        for (const note of pattern.notes) {
          const voice = voiceMap[note.voice]; if (!audible(voice)) continue;
          const grid = Math.round(note.beat * 4), onGrid = Math.abs(note.beat * 4 - grid) < 1e-7;
          const localBeat = Math.min(pattern.lengthBeats - EPS, note.beat + (onGrid && grid % 2 ? pattern.swing / 4 : 0));
          const start = cycle * phraseLength + localBeat, probability = note.probability ?? 1;
          if (realizeProbability && (note.velocity <= 0 || random(seed, 'received', cycle, note.id) >= probability)) continue;
          add({ id: 'received:' + cycle + ':' + note.id, voice, pitch: note.pitch, startBeat: start,
            durationBeats: Math.min(note.duration, pattern.lengthBeats - localBeat), velocity: note.velocity, probability: realizeProbability ? 1 : probability });
        }
      }
    } else {
      const entries = phraseBanks(state);
      for (let cycle = firstCycle; cycle <= lastCycle; cycle++) for (const entry of entries) {
        if (cycle * phraseLength + entry.start >= endBeat - EPS || cycle * phraseLength + entry.start + entry.length < startBeat - EPS) continue;
        for (const { id: voice } of S.PARTS) {
          if (!audible(voice)) continue;
          const steps = entry.bank.tracks[voice];
          for (let index = 0; index < entry.bank.length; index++) {
            const step = steps[index]; if (!step.on || !step.notes.length) continue;
            const probability = step.probability;
            // One decision per parent step preserves chord and ratchet gestures.
            if (realizeProbability && (step.velocity <= 0 || random(state.seed, cycle, entry.position, entry.index, voice, index) >= probability)) continue;
            const nextBeat = Math.min(entry.length, (index + 1) / 4 + ((index + 1) % 2 ? state.swing / 4 : 0));
            const localStart = clamp(index / 4 + (index % 2 ? state.swing / 4 : 0) + step.offset / 4, 0, nextBeat - .0001);
            const spacing = Math.max(.0001, nextBeat - localStart) / step.ratchet;
            for (let repeat = 0; repeat < step.ratchet; repeat++) for (let n = 0; n < step.notes.length; n++) {
              add({ id: ['native', cycle, entry.position, entry.index, voice, index, repeat, n].join(':'), voice,
                pitch: step.notes[n], startBeat: cycle * phraseLength + entry.start + localStart + repeat * spacing,
                durationBeats: step.gate / (4 * step.ratchet), velocity: step.velocity,
                probability: realizeProbability ? 1 : probability });
            }
          }
        }
      }
    }
    return result.sort((a, b) => a.startBeat - b.startBeat || a.voice.localeCompare(b.voice) || a.pitch - b.pitch || a.id.localeCompare(b.id));
  }
  function compose(incoming, { allBanks = false, seed = incoming.seed, density = .65 } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(density) || density < 0 || density > 1 || typeof allBanks !== 'boolean') throw new Error('Choose a PICNIC seed and a density between zero and one.');
    const state = S.normalize(incoming); delete state.musicLabPattern; state.seed = seed;
    const night = state.hour >= 21 || state.hour < 6, dusk = state.hour >= 17 && state.hour < 21, morning = state.hour >= 6 && state.hour < 11;
    const seasonal = { spring: { space: 0, lift: 0, color: 2 }, summer: { space: -.08, lift: 1, color: 4 }, autumn: { space: .08, lift: -1, color: 1 }, winter: { space: .15, lift: 0, color: 5 } }[state.season];
    const weather = { clear: { space: 0, rhythm: 0, velocity: 1 }, cloudy: { space: .07, rhythm: 1, velocity: .9 }, rain: { space: .12, rhythm: 2, velocity: .8 }, snow: { space: .22, rhythm: 3, velocity: .74 } }[state.weather];
    const activity = clamp(density - seasonal.space - weather.space - (night ? .15 : 0) + (morning ? .04 : 0), 0, 1);
    const targets = allBanks ? [0, 1, 2, 3] : [state.selectedBank];
    for (const bankIndex of targets) {
      const bank = state.banks[bankIndex], count = bank.length, bars = count / 16;
      const tracks = Object.fromEntries(S.PARTS.map(part => [part.id, Array.from({ length: 32 }, () => S.createStep())]));
      const roll = (...coordinates) => random(seed, 'compose', state.hour, state.season, state.weather, state.key, state.scale, bankIndex, ...coordinates);
      const put = (voice, at, notes, options = {}) => {
        if (at < 0 || at >= count || !notes.length) return;
        tracks[voice][at] = S.createStep({ on: true, notes: [...new Set(notes.map(note => Math.round(clamp(note, 0, 127))))], velocity: .65, gate: .85, ...options });
      };
      const symbolAt = at => bank.chords[Math.min(bank.chords.length - 1, Math.floor(at / count * bank.chords.length))];
      const chordAt = at => chordNotes(state, symbolAt(at), 3);
      const rootAt = at => chordRoot(state, symbolAt(at), 2);
      // The same four-note question receives a quieter, rhythmically changed answer.
      const motif = [0, 2 + bankIndex % 2, 4, 1 + seasonal.color % 3];
      const rhythms = [[0, 3, 6, 10], [0, 4, 7, 11], [1, 4, 6, 12], [0, 2, 7, 10]];
      const rhythm = rhythms[(bankIndex + (dusk ? 1 : 0)) % rhythms.length];
      for (let bar = 0; bar < bars; bar++) {
        const response = bar % 2 === 1, octave = night ? 4 : morning || state.season === 'winter' ? 5 : 4;
        const variation = bankIndex === 2 ? 1 : 0;
        rhythm.forEach((relative, phraseIndex) => {
          const at = bar * 16 + relative + (response && phraseIndex === 1 ? 1 : 0);
          if (phraseIndex > 0 && roll('melody', bar, phraseIndex) > activity + .28) return;
          const chord = chordAt(at), degree = motif[response ? motif.length - 1 - phraseIndex : phraseIndex] + variation;
          let pitch = scaleNote(state, degree + seasonal.lift, octave);
          if (phraseIndex === 0 || response && phraseIndex === 3) {
            const target = chord[(bar + phraseIndex + bankIndex) % chord.length] + (night ? 0 : 12);
            while (pitch - target > 7) pitch -= 12; while (target - pitch > 7) pitch += 12;
            pitch = target;
          }
          put('melody', at, [pitch], { velocity: clamp((response ? .58 : .72) * weather.velocity + roll('touch', at) * .13, .1, 1),
            gate: phraseIndex === 3 ? 2.2 : phraseIndex === 0 ? 1.3 : .75,
            offset: (roll('timing', at) - .5) * .14, probability: phraseIndex === 2 ? .86 : 1 });
        });
        if (activity > .45 && !night) put('melody', bar * 16 + 14, [scaleNote(state, response ? 0 : 6, octave)], { velocity: .42 * weather.velocity, gate: .6, probability: .55 });
      }
      // Harmony follows the editable Roman progression, including sixths/ninths.
      const changes = new Set([0]);
      for (let at = 1; at < count; at++) if (symbolAt(at) !== symbolAt(at - 1)) changes.add(at);
      for (const at of changes) {
        const chord = chordAt(at), inversion = (bankIndex + Math.floor(at / 8) + (dusk ? 1 : 0)) % 3;
        let voiced = chord.slice(); for (let n = 0; n < inversion; n++) voiced.push(voiced.shift() + 12);
        if (night) voiced = voiced.map(note => note - 12);
        put('chords', at, voiced, { velocity: (.48 + roll('chords', at) * .12) * weather.velocity, gate: night ? 7.6 : 5.6, offset: .045 });
        const bass = rootAt(at);
        put('bass', at, [bass], { velocity: (.64 + roll('bass', at) * .12) * weather.velocity, gate: night ? 3.3 : 2.2 });
        if (at + 4 < count && activity > .2) put('bass', at + 4, [bass + (bankIndex % 2 ? 7 : 12)], { velocity: .52 * weather.velocity, gate: 1.5, offset: .04 });
        if (at + 7 < count && activity > .55) {
          const destination = rootAt(at + 8 < count ? at + 8 : 0), direction = destination > bass ? -1 : 1;
          put('bass', at + 7, [destination + direction], { velocity: .43 * weather.velocity, gate: .65, probability: .8 });
        }
      }
      // Brushes leave the melody's spaces intact; rain adds little soft doubles.
      for (let at = 0; at < count; at++) {
        if (at % 8 === 0) put('drums', at, [36], { velocity: (night ? .32 : .52) * weather.velocity, gate: .35 });
        else if (at % 8 === 4 && activity > .12) put('drums', at, [38], { velocity: .35 * weather.velocity, gate: .3, offset: .06 });
        else if (at % 2 === 0 && activity > .28 && roll('brush', at) < activity + .12) put('drums', at, [42], { velocity: (.20 + at % 4 * .055) * weather.velocity, gate: .25,
          ratchet: state.weather === 'rain' && at % 8 === 6 ? 2 : 1, offset: .035 });
        else if (at % 8 === 7 && activity > .65 && roll('rim', at) < .45) put('drums', at, [37], { velocity: .24, gate: .2, probability: .7 });
      }
      // Neighbors answer in the gap, while the texture marks the seasonal light.
      for (let bar = 0; bar < bars; bar++) {
        const at = bar * 16 + (bankIndex % 2 ? 13 : 15), probability = night ? .22 : state.season === 'spring' ? .72 : .48;
        if (activity > .18 && state.weather !== 'snow') put('neighbors', at, [scaleNote(state, bankIndex + (bar % 2 ? 2 : 4), 4)], { velocity: .35 * weather.velocity, gate: .65, probability });
      }
      const airNotes = chordAt(0);
      put('texture', morning ? 2 : 0, [airNotes[0] + 12, airNotes[2] + 12], { velocity: (state.season === 'winter' ? .40 : .27) * weather.velocity, gate: 8, offset: .08 });
      if (count === 32 && (night || state.weather !== 'clear')) put('texture', 18 + weather.rhythm, [chordAt(16)[1] + 12], { velocity: .24 * weather.velocity, gate: 6, probability: .72 });
      // Shortening a bank hides its second page. Composition only replaces the
      // active page, preserving edits waiting on steps 17–32.
      if (count === 16) for (const part of S.PARTS) for (let at = 16; at < 32; at++) tracks[part.id][at] = S.createStep(bank.tracks[part.id][at]);
      bank.tracks = tracks;
    }
    return S.normalize(state);
  }
  global.PicnicSequence = Object.freeze({ MAX_EVENTS, random, noteName, scaleNote, chordRoot, chordNotes, lengthBeats, events, compose });
})(typeof window === 'object' ? window : globalThis);
