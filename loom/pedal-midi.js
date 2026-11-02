/* FERMENT · portable note takes, Kitchen patterns and Standard MIDI Files. */
(function (scope) {
  'use strict';
  const MAX_NOTES = 4096, MAX_BEATS = 256, PPQ = 960;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const nameText = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160) || 'FERMENT · played line' : 'FERMENT · played line';
  function normalizeTake(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Choose a FERMENT note take.');
    const { sampleRate, tempo, frames } = raw;
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !finite(tempo) || tempo < 20 || tempo > 400 || !Number.isSafeInteger(frames) || frames < 0 || frames > Math.floor(MAX_BEATS * 60 / tempo * sampleRate) + 1) throw Error('The FERMENT take has invalid audio timing.');
    if (!Array.isArray(raw.notes) || raw.notes.length > MAX_NOTES) throw Error('A FERMENT take can contain up to 4,096 notes.');
    const notes = raw.notes.map(note => {
      if (!note || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127 || !Number.isSafeInteger(note.startFrame) || !Number.isSafeInteger(note.endFrame) || note.startFrame < 0 || note.endFrame <= note.startFrame || note.endFrame > frames || !finite(note.velocity) || note.velocity < 0 || note.velocity > 1) throw Error('A captured FERMENT note is outside the take.');
      return { pitch: note.pitch, startFrame: note.startFrame, endFrame: note.endFrame, velocity: note.velocity };
    }).sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || a.pitch - b.pitch);
    return { ...(typeof raw.token === 'string' ? { token: raw.token.slice(0, 100) } : {}), sampleRate, tempo, frames, notes };
  }
  function toPattern(raw, options = {}) {
    const take = normalizeTake(raw), grid = options.snap ?? options.quantize ?? 0;
    if (!finite(grid) || grid < 0 || grid > 4) throw Error('Choose a note quantization between off and four beats.');
    const scale = take.tempo / (60 * take.sampleRate), offset = options.trimLeading === true && take.notes.length ? take.notes[0].startFrame : 0;
    const unit = 1 / PPQ;
    const notes = take.notes.map((note, index) => {
      let start = (note.startFrame - offset) * scale, end = (note.endFrame - offset) * scale;
      if (grid) { start = Math.round(start / grid) * grid; end = Math.round(end / grid) * grid; }
      start = clamp(start, 0, MAX_BEATS - unit); end = clamp(Math.max(start + unit, end), start + unit, MAX_BEATS);
      return { id: 'ferment-' + (index + 1), pitch: note.pitch, beat: start, duration: end - start, velocity: note.velocity, voice: 'ferment', probability: 1 };
    });
    const lengthBeats = clamp(Math.max(.25, (take.frames - offset) * scale, ...notes.map(note => note.beat + note.duration)), .25, MAX_BEATS);
    const packet = { format: 'musiclab-pattern', version: 1, name: nameText(options.name), sourceApp: 'loom', kind: 'notes', tempo: take.tempo, swing: 0, lengthBeats, meter: [4, 4], voices: [{ id: 'ferment', name: 'FERMENT · played input' }], notes, tags: ['ferment', 'audio-to-midi', 'monophonic'] };
    return scope.MusicLabPatternSchema ? scope.MusicLabPatternSchema.normalize(packet) : packet;
  }
  function vlq(value) {
    const result = [value & 127];
    while ((value = Math.floor(value / 128)) > 0) result.unshift((value & 127) | 128);
    return result;
  }
  function toMidi(raw, options = {}) {
    const packet = toPattern(raw, options), channel = options.channel ?? 0;
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) throw Error('Choose a MIDI channel from zero to fifteen.');
    const tempo = Math.round(60000000 / packet.tempo), title = new TextEncoder().encode(packet.name);
    const track = [0, 255, 81, 3, tempo >>> 16 & 255, tempo >>> 8 & 255, tempo & 255, 0, 255, 88, 4, 4, 2, 24, 8, 0, 255, 3, ...vlq(title.length), ...title];
    const events = [];
    packet.notes.forEach((note, index) => {
      const start = Math.round(note.beat * PPQ), end = Math.max(start + 1, Math.round((note.beat + note.duration) * PPQ));
      events.push({ tick: start, order: 1, index, data: [144 | channel, note.pitch, clamp(Math.round(note.velocity * 127), 1, 127)] });
      events.push({ tick: end, order: 0, index, data: [128 | channel, note.pitch, 0] });
    });
    events.sort((a, b) => a.tick - b.tick || a.order - b.order || a.index - b.index);
    let previous = 0;
    for (const event of events) { track.push(...vlq(event.tick - previous), ...event.data); previous = event.tick; }
    track.push(...vlq(Math.max(previous, Math.round(packet.lengthBeats * PPQ)) - previous), 255, 47, 0);
    const result = new Uint8Array(22 + track.length);
    result.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >>> 8, PPQ & 255, 77, 84, 114, 107, track.length >>> 24 & 255, track.length >>> 16 & 255, track.length >>> 8 & 255, track.length & 255]);
    result.set(track, 22); return result;
  }
  scope.LoomPedalMidi = Object.freeze({ MAX_NOTES, MAX_BEATS, PPQ, normalizeTake, toPattern, toMidi });
})(typeof window === 'undefined' ? globalThis : window);
