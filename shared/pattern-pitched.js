/* Native Kilter Kitchen note adapters. Imported polyphonic phrases remain editable portable notes. */
(() => {
  'use strict';
  if (window.MusicLabPatternInstrument) return;
  const candidates = [['fable', 'FableApp', 'FableSchema'], ['bower', 'BowerApp', 'BowerSchema'], ['mire', 'MireApp', 'MireSchema'], ['haze', 'HazeApp', 'HazeSchema']];
  const found = candidates.find(([, facade]) => window[facade]);
  if (!found) return;
  const [appId, facadeName, schemaName] = found, app = window[facadeName], S = window[schemaName], P = window.MusicLabPatternSchema, engine = app.engine;
  if (!P || !engine) throw new Error('Portable pattern support needs the native instrument and Kilter Kitchen pattern validator.');
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k), copy = v => JSON.parse(JSON.stringify(v));
  const abort = signal => { if (signal?.aborted) throw new DOMException('Pattern operation cancelled.', 'AbortError'); };
  const state = () => app.getState();
  const notify = () => { document.dispatchEvent(new CustomEvent('musiclab:patternchange', { detail: { app: appId } })); window.MusicLabHost?.notifyStateChange?.(); };
  const midi = hz => Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(hz / 440))));
  const randomFor = seed => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; };
  function voicesFor(s) {
    if (appId === 'fable') return [{ id: 'auto', name: 'Key / velocity sample mapping' }, ...s.zones.map(z => ({ id: z.id, name: z.name, pitch: z.root }))];
    if (appId === 'bower') return s.lanes.map((l, i) => ({ id: String(i), name: l.name, pitch: S.degreeMidi(s, i, 0) }));
    if (appId === 'mire') return s.sources.map((source, i) => ({ id: String(i), name: source.name || 'Source ' + (i + 1), pitch: source.pitch }));
    return [{ id: 'auto', name: 'Nearest tuned band · quantizes pitch' }, ...Array.from({ length: 24 }, (_, i) => ({ id: String(i), name: 'Band ' + (i + 1) + ' · ' + Math.round(window.HazeDSP.frequencyForBand(s, i)) + ' Hz', pitch: midi(window.HazeDSP.frequencyForBand(s, i)) }))];
  }
  function sequenceSignature(s) {
    if (appId === 'fable') return JSON.stringify([s.selectedPattern, s.patterns]);
    if (appId === 'bower') return JSON.stringify([s.evolution, s.lanes.map(l => [l.steps, l.length, l.division, l.direction])]);
    if (appId === 'mire') return JSON.stringify(s.sources.map(source => source.steps));
    return JSON.stringify([s.score, s.direction, s.bars]);
  }
  let importedSignature = state().musicLabPattern ? sequenceSignature(state()) : null;
  const nativeSetState = engine.setState.bind(engine);
  engine.setState = function (incoming) {
    if (incoming.musicLabPattern) {
      const signature = sequenceSignature(incoming);
      const available = new Set(voicesFor(incoming).map(v => v.id));
      if (importedSignature !== null && signature !== importedSignature || Object.values(incoming.musicLabPattern.voiceMap).some(id => !available.has(id))) { delete incoming.musicLabPattern; importedSignature = null; engine.stop(); }
      else importedSignature = signature;
    } else importedSignature = null;
    return nativeSetState(incoming);
  };
  function packetBase(s, name, lengthBeats, voices) {
    return { format: 'musiclab-pattern', version: 1, sourceApp: appId, name, tempo: s.tempo, swing: 0, lengthBeats, meter: [4, 4], voices, notes: [], seed: s.seed ?? 0x4d495245, tags: [appId] };
  }
  function addNote(packet, pitch, beat, duration, velocity, voice, probability = 1) {
    if (beat >= packet.lengthBeats - 1e-8 || duration <= 0) return;
    packet.notes.push({ id: 'n' + (packet.notes.length + 1), pitch: Math.round(pitch), beat: Math.max(0, beat), duration: Math.min(duration, packet.lengthBeats - beat), velocity, voice, probability });
  }
  function fableDuration(s,step,interval,phraseLength) {
    let duration=Math.max(.001,interval/step.ratchet*step.gate);
    const velocity=Math.round(step.velocity*127);
    for(const zone of s.zones)if(zone.enabled&&step.note>=zone.low&&step.note<=zone.high&&velocity>=zone.velLow&&velocity<=zone.velHigh&&zone.playMode==='oneshot'){
      if(zone.loopMode!=='off')duration=Math.max(duration,phraseLength);
      else {const asset=s.assets.find(a=>a.id===zone.assetId);if(!asset)continue;const shift=(zone.tracking?step.note-zone.root:0)+zone.transpose+s.master.transpose+(zone.tune+s.master.tune)/100,seconds=asset.duration*Math.max(.0001,zone.end-zone.start)*(zone.engine==='texture'?zone.stretch:Math.pow(2,-shift/12))+(zone.engine==='texture'?zone.envelope.release:0);duration=Math.max(duration,seconds*s.tempo/60);}
    }
    return duration;
  }
  function nativePattern(s, scope = 'pattern') {
    if (appId === 'fable') {
      const index = /^pattern-[0-3]$/.test(scope) ? Number(scope.slice(-1)) : s.selectedPattern, pattern = s.patterns[index];
      const out = packetBase(s, s.name + ' · ' + pattern.name, pattern.length / 4, [{ id: 'auto', name: 'Key / velocity sample mapping' }]);
      let beat = 0;
      for (let i = 0; i < pattern.length; i++) { const step = pattern.steps[i], interval = .25 * (1 + (i % 2 === 0 ? 1 : -1) * s.swing * .5); if (step.on) for (let r = 0; r < step.ratchet; r++) addNote(out, step.note, beat + interval * r / step.ratchet, fableDuration(s,step,interval,pattern.length/4), step.velocity, 'auto', step.probability); beat += interval; }
      return P.normalize(out);
    }
    if (appId === 'mire') {
      const out = packetBase(s, s.name + ' · source pattern', 4, voicesFor(s)); let beat = 0;
      for (let step = 0; step < 16; step++) { const interval = .25 * (step % 2 ? 1 - s.swing : 1 + s.swing); for (let i = 0; i < 4; i++) { const source = s.sources[i], hit = source.steps[step]; if (!source.mute && hit.on) for (let r = 0; r < hit.ratchet; r++) addNote(out, source.pitch, beat + interval * r / hit.ratchet, Math.min(source.decay * s.tempo / 60000, interval / hit.ratchet), hit.velocity * (r ? .88 : 1), String(i), hit.probability); } beat += interval; }
      return P.normalize(out);
    }
    if (appId === 'bower') {
      const selected = /^voice-[0-3]$/.test(scope) ? Number(scope.slice(-1)) : null, voices = voicesFor(s).filter(v => selected === null || v.id === String(selected));
      const out = packetBase(s, s.name + ' · four-bar phrase', 16, voices), random = randomFor(s.seed);
      const solo = s.lanes.some(l => l.solo);
      for (let i = 0; i < 4; i++) { if (selected !== null && i !== selected) continue; const lane = s.lanes[i]; if (lane.mute || solo && !lane.solo) continue; let beat = 0, count = 0; while (beat < 16 - 1e-8 && count < 1024) { let at = count % lane.length; if (lane.direction === 'reverse') at = lane.length - 1 - at; else if (lane.direction === 'pendulum') { const cycle = Math.max(1, lane.length * 2 - 2), pos = count % cycle; at = pos < lane.length ? pos : cycle - pos; } else if (lane.direction === 'random') at = Math.floor(random() * lane.length); const hit = lane.steps[at], interval = S.DIVISIONS[lane.division] * (1 + (count % 2 === 0 ? 1 : -1) * s.swing * .5); if (hit.on) { let degree = hit.degree; if (s.evolution && random() < lane.evolve) degree += random() < .5 ? -1 : 1; addNote(out, S.degreeMidi(s, i, degree), beat, lane.decay * s.tempo / 60, hit.velocity, String(i), hit.probability); } beat += interval; count++; } }
      out.notes.sort((a, b) => a.beat - b.beat); return P.normalize(out);
    }
    const cycle = s.bars * 4, length = s.direction === 'pingpong' ? cycle * 2 : cycle;
    const out = packetBase(s, s.name + ' · tuned bands', length, voicesFor(s).filter(v => v.id !== 'auto'));
    const columns = s.direction === 'pingpong' ? 64 : 32;
    for (let x = 0; x < columns; x++) { const column = s.direction === 'reverse' ? (32 - x) % 32 : s.direction === 'pingpong' && x >= 32 ? 63 - x : x; for (let y = 0; y < 24; y++) if (s.score[y][column] > 0) addNote(out, midi(window.HazeDSP.frequencyForBand(s, y)), x * cycle / 32, cycle / 32, s.score[y][column], String(y)); }
    return P.normalize(out);
  }
  function exportPattern({ scope = 'pattern' } = {}) { const s = state(); if (s.musicLabPattern && scope === 'pattern') { const packet = P.clone(s.musicLabPattern.pattern); packet.tempo = s.tempo; return packet; } return nativePattern(s, scope); }
  function validateMapping(pattern, voiceMap, s, sampleRate) {
    const choices = new Set(voicesFor(s).map(v => v.id)), mapped = {};
    if (!voiceMap || Object.prototype.toString.call(voiceMap) !== '[object Object]') throw new Error('Map each source voice to an instrument voice.');
    for (const source of pattern.voices) { const target = voiceMap[source.id]; if (!own(voiceMap, source.id) || typeof target !== 'string' || !choices.has(target)) throw new Error('Choose a destination for source voice “' + source.name + '”.'); mapped[source.id] = target; }
    if (Object.keys(voiceMap).some(id => !pattern.voices.some(v => v.id === id))) throw new Error('The voice map refers to an unknown source voice.');
    for (const note of pattern.notes) eventFor(note, mapped[note.voice], s, sampleRate);
    return mapped;
  }
  function nearestBand(pitch, s) {
    const values = Array.from({ length: 24 }, (_, row) => 69 + 12 * Math.log2(window.HazeDSP.frequencyForBand(s, row) / 440));
    if (pitch < values[0] - .51 || pitch > values[23] + .51) throw new Error('This note is outside STEAM’s tuned bands. Change its tuning, or map the source to a specific band.');
    let best = 0; for (let i = 1; i < 24; i++) if (Math.abs(values[i] - pitch) < Math.abs(values[best] - pitch)) best = i; return String(best);
  }
  function swungNote(note, packet) {const step=Math.round(note.beat*4),onGrid=Math.abs(note.beat*4-step)<1e-7,beat=Math.min(packet.lengthBeats-1/1024,note.beat+(onGrid&&step%2?packet.swing/4:0));return {...note,beat,duration:Math.max(1/1024,Math.min(note.duration,packet.lengthBeats-beat))};}
  function eventFor(note, voice, s, sampleRate = engine.context?.sampleRate || 48000) {
    if (appId === 'bower' && (note.pitch < 24 || note.pitch > 100)) throw new Error('SKEWER’s strings support MIDI notes 24–100. Transpose this pattern into that range.');
    if (appId === 'mire' && s.sources[Number(voice)]?.kind !== 'sample') { const minPitch=16,maxPitch=Math.min(127,Math.floor(69+12*Math.log2(sampleRate*.2/440)));if(note.pitch<minPitch||note.pitch>maxPitch)throw new Error('This REDUCE exciter supports MIDI notes '+minPitch+'–'+maxPitch+' at '+Math.round(sampleRate/1000)+' kHz. Transpose the pattern, or map it to a sample source.'); }
    if (appId === 'haze' && voice === 'auto') voice = nearestBand(note.pitch, s);
    return { note: note.pitch, velocity: note.velocity, voiceId: voice, startBeat: note.beat, durationBeats: note.duration };
  }
  async function importPattern({ pattern, options = {}, signal } = {}) {
    abort(signal); const normalized = P.parse(pattern), snapshot = state();
    if (options.target !== undefined && options.target !== 'pattern') throw new Error('Choose the imported performance pattern.');
    const occupied = snapshot.musicLabPattern ? snapshot.musicLabPattern.pattern.notes.length > 0 : nativePattern(snapshot).notes.length > 0;
    if (occupied && options.replace !== true) throw new Error('Confirm replacement of the current performance pattern.');
    const voiceMap = validateMapping(normalized, options.voiceMap, snapshot), candidate = S.normalize({ ...snapshot, musicLabPattern: { pattern: normalized, voiceMap } });
    abort(signal); engine.stop(); importedSignature = sequenceSignature(candidate); app.loadState(candidate); notify();
    return { target: 'pattern', name: normalized.name, notes: normalized.notes.length, mode: 'notes', exact: true };
  }
  function clearImportedPattern() { const snapshot = state(); if (!snapshot.musicLabPattern) return false; delete snapshot.musicLabPattern; engine.stop(); importedSignature = null; app.loadState(snapshot); notify(); return true; }
  async function prepare() { await engine.init(); if (engine.context?.state === 'suspended') await engine.context.resume(); return true; }
  function scheduleNote({ id, pitch, velocity = .8, voice, when, durationSeconds = .25, source = 'loom' } = {}) {
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127 || typeof velocity !== 'number' || !Number.isFinite(velocity) || velocity < 0 || velocity > 1 || !Number.isFinite(when) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 15360) throw new Error('Choose a valid timed note.');
    const s = engine.state || state(), choices = new Set(voicesFor(s).map(v => v.id));
    if (typeof voice !== 'string' || !choices.has(voice)) throw new Error('Choose a valid instrument voice.');
    const native = eventFor({ pitch, velocity, beat: 0, duration: 1 }, voice, s);
    if (velocity === 0) return;
    return engine.scheduleNote({ ...native, when, durationSeconds, source, id });
  }
  function cancelNotes({source='loom',when}={}) { if(when!==undefined&&!Number.isFinite(when))throw new Error('Choose a finite cancellation time.');engine.stopNotes({source,when}); }
  async function renderPattern({ pattern, state: sourceState, tempo, tailSeconds = 0, voiceMap: explicitMap, signal } = {}) {
    abort(signal); const normalized = P.parse(pattern), snapshot = sourceState?.format === 'fable-project' && appId === 'fable' ? S.parseProject(JSON.stringify(sourceState)) : S.normalize(sourceState === undefined ? state() : S.copy(sourceState));
    const renderTempo = tempo === undefined ? normalized.tempo : tempo;
    if (!Number.isFinite(renderTempo) || renderTempo < 5 || renderTempo > 1920 || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30 || normalized.lengthBeats * 60 / renderTempo + tailSeconds > 120) throw new Error('A source pattern must render within 120 seconds. Split the phrase or reduce its tail.');
    const targetIds = new Set(voicesFor(snapshot).map(v => v.id)); let map;
    if (explicitMap) map = explicitMap;
    else if (snapshot.musicLabPattern && P.fingerprint(snapshot.musicLabPattern.pattern) === P.fingerprint(normalized)) map = snapshot.musicLabPattern.voiceMap;
    else if (normalized.voices.every(v => targetIds.has(v.id))) map = Object.fromEntries(normalized.voices.map(v => [v.id, v.id]));
    else if (snapshot.musicLabPattern && normalized.voices.every(v => own(snapshot.musicLabPattern.voiceMap, v.id))) map = snapshot.musicLabPattern.voiceMap;
    else if (normalized.voices.length === 1) map = { [normalized.voices[0].id]: appId === 'fable' || appId === 'haze' ? 'auto' : '0' };
    else throw new Error('Map this pattern’s source voices before rendering it.');
    const voiceMap = validateMapping(normalized, map, snapshot, 48000), random = randomFor(normalized.seed ?? 1), events = [];
    for (const note of normalized.notes) if (note.velocity > 0 && random() < note.probability) events.push(eventFor(swungNote(note,normalized), voiceMap[note.voice], snapshot, 48000));
    const result = await engine.renderNotes({ events, state: snapshot, tempo: renderTempo, lengthBeats: normalized.lengthBeats, tailSeconds, signal }); abort(signal);
    return { ...result, name: normalized.name, tempo: renderTempo, sourceApp: appId };
  }
  // Native Play follows exact imported phrases; LOOM schedules the same DSP directly.
  let overlayTimer = null, overlayGeneration = 0, overlayPlaying = false, overlayNext = 0, overlayCycle = 0, overlayAnchor = 0, overlayRandom = null, overlayNotes = [];
  const nativeStart = engine.start.bind(engine), nativeStop = engine.stop.bind(engine), nativePanic = engine.panic.bind(engine);
  function stopOverlay() { overlayGeneration++; clearInterval(overlayTimer); overlayTimer = null; overlayPlaying = false; engine._externalPattern = false; }
  function overlayTick() {
    if (!overlayPlaying || !engine.context || engine.context.state !== 'running') return;
    const s = engine.state || state(), imported = s.musicLabPattern;
    if (!imported) { engine.stop(); return; }
    const packet = imported.pattern, tempo = s.tempo, seconds = 60 / tempo, now = engine.context.currentTime, until = now + .12, notes = overlayNotes;
    let guard = 0;
    while (notes.length && guard++ < 8192) {
      const note = notes[overlayNext], at = overlayAnchor + (overlayCycle * packet.lengthBeats + note.beat) * seconds;
      if (at >= until) break;
      if (at >= now - .025 && note.velocity > 0 && overlayRandom() < note.probability) { try { scheduleNote({ id: note.id, pitch: note.pitch, velocity: note.velocity, voice: imported.voiceMap[note.voice], when: Math.max(now, at), durationSeconds: note.duration * seconds, source: 'standalone-pattern' }); } catch(error) { engine.stop();engine.onStatus?.(error.message);document.dispatchEvent(new CustomEvent('musiclab:pattern-error',{detail:{message:error.message}}));return; } }
      overlayNext++; if (overlayNext >= notes.length) { overlayNext = 0; overlayCycle++; }
    }
    const beat = Math.max(0, (now - overlayAnchor) / seconds) % packet.lengthBeats;
    engine.onStep?.(Math.floor(beat * 4) % 16, now);
  }
  engine.start = async function (when) {
    if (!(engine.state || state()).musicLabPattern) return nativeStart(when);
    nativeStop(); stopOverlay(); const generation = overlayGeneration; await prepare(); if (generation !== overlayGeneration) return false;
    const imported = (engine.state || state()).musicLabPattern; if (!imported) return false;
    // Packet order is arbitrary; sorting its cloned events never alters the saved phrase.
    overlayNotes = imported.pattern.notes.map(note=>swungNote(note,imported.pattern)).sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
    overlayNext = 0; overlayCycle = 0; overlayAnchor = Math.max(engine.context.currentTime + .02, Number.isFinite(when) ? when : 0); overlayRandom = randomFor(imported.pattern.seed ?? 1); overlayPlaying = true; engine._externalPattern = true;
    if (appId === 'fable') engine.playing = true; else engine.isPlaying = true;
    overlayTick(); overlayTimer = setInterval(overlayTick, 25); return true;
  };
  engine.stop = function () { stopOverlay(); engine.stopNotes(); return nativeStop(); };
  engine.panic = function () { stopOverlay(); return nativePanic(); };
  let clockRevision = null;
  const adapter = {
    get patternExport() { const scopes = [{ id: 'pattern', label: state().musicLabPattern ? 'Imported performance pattern' : 'Current pattern' }]; if (appId === 'fable') for (let i = 0; i < 4; i++) scopes.push({ id: 'pattern-' + i, label: 'Native pattern ' + String.fromCharCode(65 + i) }); if (appId === 'bower') for (let i = 0; i < 4; i++) scopes.push({ id: 'voice-' + i, label: 'Native string ' + (i + 1) }); return { scopes, defaultScope: 'pattern' }; },
    get patternImport() { const s = state(); return { targets: [{ id: 'pattern', name: 'Performance pattern · exact portable notes', occupied: !!(s.musicLabPattern ? s.musicLabPattern.pattern.notes.length : nativePattern(s).notes.length) }], voices: voicesFor(s), mode: appId === 'haze' ? 'bands' : 'notes', description: appId === 'bower' ? 'SKEWER’s strings support MIDI notes 24–100. Import exact polyphonic notes while preserving the sound patch. Native sequence edits return to the native sequence.' : appId === 'mire' ? 'REDUCE exciters support MIDI notes 16–122 at 48 kHz; sample sources accept 0–127. Import exact notes while preserving the network. Native sequence edits return to the native sequence.' : appId === 'haze' ? 'Timing, velocity, and duration stay editable. Map to a fixed tuned band, or choose nearest bands to quantize pitches. Native score edits return to the native sequence.' : 'Import exact polyphonic notes while preserving the sound patch. Native sequence edits return to the native sequence.' }; },
    get notes() {const s=state(),sampleRate=engine.context?.sampleRate||48000,voices=voicesFor(s).map(voice=>{let pitchRange=appId==='bower'?[24,100]:[0,127];if(appId==='mire'&&s.sources[Number(voice.id)]?.kind!=='sample')pitchRange=[16,Math.min(127,Math.floor(69+12*Math.log2(sampleRate*.2/440)))];if(appId==='haze'&&voice.id==='auto')pitchRange=[Math.max(0,Math.ceil(69+12*Math.log2(window.HazeDSP.frequencyForBand(s,0)/440)-.51)),Math.min(127,Math.floor(69+12*Math.log2(window.HazeDSP.frequencyForBand(s,23)/440)+.51))];return{...voice,pitchRange};});return { voices, polyphonic: true, pitched: appId !== 'haze', scheduledCancel:true, ...(appId==='bower'?{minPitch:24,maxPitch:100,pitchRange:[24,100]}:{pitchRange:[0,127]}) }; },
    get importedPattern() { return state().musicLabPattern ? P.clone(state().musicLabPattern.pattern) : null; },
    getImportedPattern() { return this.importedPattern; },
    exportPattern, importPattern, clearImportedPattern, prepare, scheduleNote, cancelNotes, renderPattern,
    validateNote: ({pitch,voice}={}) => {if(!Number.isInteger(pitch)||pitch<0||pitch>127)throw new Error('Choose a valid MIDI note.');const s=engine.state||state();if(!voicesFor(s).some(v=>v.id===voice))throw new Error('Choose a valid instrument voice.');eventFor({pitch,velocity:.8,beat:0,duration:.25},voice,s);return true;},
    panic: () => engine.panic(),
    transport: ({ beat, when, revision, playing } = {}) => { if (appId !== 'haze') return;if (playing===false || revision!==clockRevision) {engine.clearClockPositions();clockRevision=revision;}if(playing!==false&&Number.isFinite(beat))engine.seekBeat(beat,{when}); },
  };
  Object.defineProperty(window, 'MusicLabPatternInstrument', { value: Object.freeze(adapter), writable: false, configurable: false });
})();
