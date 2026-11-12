/* Native adapters retain the original six instruments' synthesis graphs, kits,
   sample regions, insert racks and project data. No browser audio callback runs. */
(function (g) {
  'use strict';
  const names = { grain: 'SIZZLE', form: 'HOTPLATE', tine: 'CLATTER', fable: 'STOCK', batter: 'BATTER', picnic: 'PICNIC' };
  const ids = Object.freeze(Object.keys(names)), copy = value => JSON.parse(JSON.stringify(value));
  const finite = (x, fallback) => Number.isFinite(x) ? x : fallback;
  const SOURCE = 'kitchen-plugin-pattern', EPS = 1e-8;
  const GRAIN_NOISE_COLORS = Object.freeze(['white', 'pink', 'brown', 'blue', 'violet', 'grey', 'velvet', 'crackle', 'metallic', 'digital', 'dust', 'radio']);
  const grainNoiseBanks = new Map();
  async function preparedGrainNoise(sampleRate) {
    let pending = grainNoiseBanks.get(sampleRate);
    if (!pending) {
      pending = (async () => {
        // Canonical makeNoise is private and deterministic: its seed is only
        // 1977 + colorIndex * 701, and its length/rate depend on sampleRate.
        // Ask an isolated original engine to produce its exact AudioBuffers.
        // The real engine's voices, clock and two performance RNGs stay pristine.
        const helper = new g.NoiseEngine(), bank = new Map();
        helper.values = { master: 0, drive: 0, space: 0 };
        helper.setVoiceState({ bpm: 120, tracks: [] });
        try {
          await helper.init();
          // WAE also lazily builds immutable basic-wave tables per sample rate.
          // Preparing unstarted oscillators trains those tables without ever
          // advancing a note's phase or changing the real engine's node graph.
          for (const wave of ['sine', 'triangle', 'sawtooth', 'square']) { const node = helper.context.createOscillator(); node.type = wave; node.disconnect(); }
          for (const color of GRAIN_NOISE_COLORS) {
            const track = { name: 'Prepared noise', noise: color, mode: 'texture', level: 1, pan: 0, tone: .5, decay: 0, pitch: .5, mute: false, solo: false, steps: Array(16).fill(0), galleyFx: [null, null] };
            g.GrainSynth.ensureTrack(track);
            Object.assign(track.synth.body, { level: 0 });
            Object.assign(track.synth.noise, { level: 1, attack: .001, hold: 0, decay: .005, drive: 0, bursts: 1 });
            Object.assign(track.synth.mod, { depth: 0, target: 'off' });
            helper.scheduleNativeNote(track, 0, { voiceIndex: 0, voiceKey: 'prepared-noise-' + color, velocity: .5, tempo: 120, source: 'kitchen-noise-preparation' });
            const buffer = helper.environment.buffers.get(color);
            if (!buffer || buffer.sampleRate !== sampleRate || buffer.length !== sampleRate * 2 || buffer.numberOfChannels !== 1) throw Error('SIZZLE could not prepare its original ' + color + ' noise.');
            bank.set(color, buffer);
          }
          return bank;
        } finally {
          // The helper never renders. Explicitly release its prepared native
          // room too, so a JUCE convolution worker cannot outlive this setup.
          if (helper.graph?.reverb) helper.graph.reverb.buffer = null;
          await helper.dispose();
        }
      })();
      grainNoiseBanks.set(sampleRate, pending);
    }
    try { return await pending; }
    catch (error) { if (grainNoiseBanks.get(sampleRate) === pending) grainNoiseBanks.delete(sampleRate); throw error; }
  }
  function defaultProject(id) {
    if (id === 'grain' || id === 'tine') {
      const p = copy(id === 'grain' ? g.NOISE_PRESETS[0] : g.TINE_PRESETS[0]);
      const state = { name: p.name, bpm: p.bpm, swing: p.swing, drive: p.drive, space: p.space, master: .78, stepCount: 16,
        tracks: p.tracks.map(t => id === 'grain' ? (g.GrainSynth.ensureTrack(t), t) : g.TineModel.normalizeTrack(t)) };
      const banks = [state.tracks.map(t => [...t.steps]), ...Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => Array(16).fill(0)))];
      const chain = { enabled: false, loop: true, entries: [] };
      if (id === 'tine') state.chain = chain;
      return { ...(id === 'grain' ? { format: 'grain-project' } : { app: 'TINE' }), version: 5, state, banks,
        bankLocks: banks.map(bank => bank.map(row => row.map(() => ({})))), ...(id === 'grain' ? { chain } : {}), bank: 0, selected: 0 };
    }
    if (id === 'form') { const A = g.KitchenHotplateAudio, groove = A.FACTORY_GROOVES[0];
      return A.syncPatternState({ name: 'Opening service', sounds: A.buildDefaultKit(), steps: copy(groove.steps), stepDetails: copy(groove.stepDetails), grooveId: groove.id, muted: Array(8).fill(false), bpm: groove.tempo, swing: groove.swing }); }
    if (id === 'fable') return { format: 'fable-project', formatVersion: 1, state: g.FableSchema.defaultState() };
    if (id === 'picnic') return { format: 'picnic-project', version: 1, state: g.PicnicSchema.createDefault() };
    const engine = new g.BatterEngine(); return { format: 'batter-project', formatVersion: 1, appVersion: g.BatterSchema.VERSION, state: engine.getState() };
  }
  function definitions() { return ids.map(id => ({ id, name: names[id], runtime: 'original-web-audio-graph', defaults: defaultProject(id), midi: ['grain', 'form', 'tine'].includes(id) ? 'C2–G2 select eight voices' : id === 'batter' ? 'C2–B2 select twelve voices' : id === 'picnic' ? 'channels 1–6 select parts; channel 10 drums' : 'pitched sampler notes' })); }
  function create(id, sampleRate, input, resources = {}) {
    if (!ids.includes(id)) throw Error('Unknown Web Audio instrument ' + id);
    if (!g.KitchenWebAudio) throw Error('Load the native Web Audio compatibility bundle first.');
    g.KitchenWebAudio.installContextFactory(sampleRate);
    let project = copy(input == null ? defaultProject(id) : input), state, playbackState, engine, context, pull, ready = false, frame = 0, serial = 0, lastClock = null;
    let length = 4, sequenceLoop = true, sequenceCache = new Map(), nativeSequence = resources.nativeSequence !== false, fableRandom = state?.seed || 1;
    const held = new Map(), midiHeld = new Map(), pendingCancels = new Map(); let sustained = false, patternSource = SOURCE + ':0';
    function nextPatternSource() { patternSource = SOURCE + ':' + (++serial); }
    function unwrap() {
      state = project.state && typeof project.state === 'object' ? project.state : project;
      if (id === 'fable') state = g.FableSchema.normalize(state);
      if (id === 'picnic') state = g.PicnicSchema.normalize(state);
      if (id === 'batter') state = g.BatterSchema.normalize(state);
      if (id === 'form') { state.sounds = state.sounds.map(g.KitchenHotplateAudio.sanitizeParams); state = g.KitchenHotplateAudio.syncPatternState(state); state.masterVolume = finite(state.masterVolume, .8); }
      if (id === 'grain') state.tracks.forEach(g.GrainSynth.ensureTrack);
      if (id === 'tine') state.tracks = state.tracks.map(g.TineModel.normalizeTrack);
      if (project.state) project.state = state; else project = state;
    }
    unwrap();
    function drumPacket() {
      const overlay = state.musicLabPattern;
      if (overlay) return overlay.pattern.notes.map(n => ({ ...n, voiceIndex: Number(String(overlay.voiceMap[n.voice]).replace('voice-', '')) || 0, beat: n.beat + (Math.round(n.beat * 4) % 2 ? overlay.pattern.swing / 4 : 0), pitch: n.pitch, duration: n.duration }));
      const chain = id === 'grain' ? project.chain : state.chain, stepCount = state.stepCount === 32 ? 32 : 16;
      const entries = chain?.enabled && chain.entries.length ? chain.entries : [{ bank: project.bank || 0, repeats: 1 }];
      let offset = 0; const events = [], solo = state.tracks.some(t => t.solo);
      for (const entry of entries) for (let repeat = 0; repeat < entry.repeats; repeat++) {
        state.tracks.forEach((track, voiceIndex) => { if (track.mute || solo && !track.solo) return;
          const row = project.banks?.[entry.bank]?.[voiceIndex] || track.steps;
          row.slice(0, stepCount).forEach((hit, step) => { if (hit) events.push({ voiceIndex, beat: offset + step / 4 + (step % 2 ? state.swing / 4 : 0), pitch: 36 + voiceIndex, velocity: hit >= 2 ? 1 : .73, locks: project.bankLocks?.[entry.bank]?.[voiceIndex]?.[step] }); });
        }); offset += stepCount / 4;
      }
      length = offset; sequenceLoop = chain?.enabled ? chain.loop !== false : true; return events;
    }
    function buildSequence() {
      sequenceCache.clear(); sequenceLoop = true; fableRandom = state.seed || 1;
      if (id === 'grain' || id === 'tine') { const notes = drumPacket(); if (state.musicLabPattern) length = state.musicLabPattern.pattern.lengthBeats; sequenceCache.set(0, notes); }
      else if (id === 'form') { const result = g.KitchenHotplateAudio.sequencerEvents(state); length = state.musicLabPattern?.pattern.lengthBeats || result.steps / 4; sequenceLoop = !state.chain?.enabled || state.chain.loop !== false; if (!state.musicLabPattern) sequenceCache.set(0, result.events.map(e => ({ ...e, voiceIndex: e.voice, beat: e.at * state.bpm / 60, pitch: 36 + e.voice + e.pitch }))); }
      else if (id === 'batter') { const score = g.BatterSchema.compile(state); length = score.cycleBeats; sequenceLoop = !state.chainEnabled || state.chainLoop !== false; sequenceCache.set(0, score.events); }
      else if (id === 'picnic') length = g.PicnicSequence.lengthBeats(state);
      else length = state.musicLabPattern?.pattern.lengthBeats || state.patterns[state.selectedPattern].length / 4;
      for (const events of sequenceCache.values()) events.sort((a, b) => a.beat - b.beat);
    }
    function cycleEvents(cycle) {
      if (sequenceCache.has(cycle)) return sequenceCache.get(cycle);
      let events;
      if (id === 'batter') events = g.BatterSchema.compile(playbackState || state, { cycleIndex: cycle }).events;
      else if (id === 'picnic') events = g.PicnicSequence.events(state, { startBeat: cycle * length, lengthBeats: length }).map(e => ({ ...e, beat: e.startBeat - cycle * length }));
      else if (id === 'form' && state.musicLabPattern) { const { pattern, voiceMap } = state.musicLabPattern; events = pattern.notes.map(n => ({ ...n, voiceIndex: Number(String(voiceMap[n.voice]).replace('voice-', '')), beat: n.beat + (Math.round(n.beat * 4) % 2 ? pattern.swing / 4 : 0), pitch: n.pitch })); }
      else if (id === 'form') { // Original deterministic probability uses the full cycle coordinate.
        const A = g.KitchenHotplateAudio, runs = A.sequenceRuns(state); events = [];
        for (const [runIndex, run] of runs.entries()) for (let step = 0; step < run.pattern.length; step++) for (const e of A.eventsForStep(run.pattern.steps, run.pattern.stepDetails, step, cycle * runs.length + runIndex, state.bpm, state.swing)) {
          if (!state.muted[e.voice]) events.push({ ...e, voiceIndex: e.voice, beat: (run.startStep + step) / 4 + e.offset * state.bpm / 60, pitch: 36 + e.voice + e.pitch });
        }
      } else if (id === 'fable') {
        if (state.musicLabPattern) events = state.musicLabPattern.pattern.notes.map(n => ({ ...n, pitch: n.pitch, voiceId: state.musicLabPattern.voiceMap[n.voice], durationBeats: n.duration }));
        else { events = []; const pattern = state.patterns[state.selectedPattern];
          pattern.steps.slice(0, pattern.length).forEach((s, step) => { if (!s.on) return; fableRandom ^= fableRandom << 13; fableRandom ^= fableRandom >>> 17; fableRandom ^= fableRandom << 5; if ((fableRandom >>> 0) / 4294967296 > s.probability) return;
            const span = .25 * (1 + (step % 2 ? -1 : 1) * state.swing * .5);
            for (let ratchet = 0; ratchet < s.ratchet; ratchet++) events.push({ beat: step / 4 + (step % 2 ? state.swing / 8 : 0) + ratchet * span / s.ratchet, pitch: s.note, velocity: s.velocity, durationBeats: span / s.ratchet * s.gate }); }); }
      } else events = sequenceCache.get(0);
      if (sequenceCache.size > 4) for (const key of sequenceCache.keys()) if (key !== 0) { sequenceCache.delete(key); break; }
      events.sort((a, b) => a.beat - b.beat); sequenceCache.set(cycle, events); return events;
    }
    function when(event) { return Math.max(context.currentTime, finite(event.frame, frame) / sampleRate); }
    function cancel(source, at) {
      if (source !== undefined && at > context.currentTime) pendingCancels.set(source, at);
      if (id === 'grain' || id === 'tine' || id === 'form') engine.cancelNativeNotes({ source, when: at });
      else if (id === 'fable') engine.stopNotes({ source, when: at });
      else if (id === 'picnic') engine.cancelNotes({ source, when: at });
      else for (const entry of engine.sources) if (source === undefined || entry.sourceId === source) { entry.envelope.gain.cancelAndHoldAtTime(at); entry.envelope.gain.linearRampToValueAtTime(0, at + .008); engine.stopEntry(entry, at + .009); }
    }
    function schedule(event, at, source, tempo, beat) {
      const pitch = finite(event.pitch, 60), velocity = Math.max(0, Math.min(1, finite(event.velocity, .8)));
      if (id === 'grain' || id === 'tine') { const voiceIndex = event.voiceIndex ?? Math.round(pitch) - 36; if (!state.tracks[voiceIndex]) return false;
        engine.scheduleNativeNote(state.tracks[voiceIndex], at, { voiceIndex, voiceKey: 'voice-' + voiceIndex, velocity, pitch: pitch - (36 + voiceIndex), source, tempo, beat, locks: event.locks }); }
      else if (id === 'form') { const voiceIndex = event.voiceIndex ?? Math.round(pitch) - 36; if (!state.sounds[voiceIndex]) return false;
        engine.schedulePrepared(state.sounds[voiceIndex], velocity, at, pitch - (36 + voiceIndex), source, event.locks, voiceIndex); }
      else if (id === 'batter') { const laneIndex = event.laneIndex ?? Math.round(pitch) - 36; if (!state.lanes[laneIndex]) return false;
        engine.scheduleHit({ ...event, laneId: state.lanes[laneIndex].id, laneIndex, velocity, pitch: event.laneIndex === undefined ? 0 : event.pitch || 0, source, beat, modulationBeat: beat, seed: event.seed ?? g.BatterSchema.hash(state.seed, serial), roundRobin: event.roundRobin ?? serial++ }, at, engine.graph, playbackState || state); }
      else if (id === 'fable') engine.scheduleNote({ voiceId: event.voiceId || 'auto', note: pitch, velocity, when: at, durationSeconds: finite(event.durationBeats, finite(event.duration, 600) * tempo / 60) * 60 / tempo, source });
      else { const voice = event.voice || (event.channel === 9 ? 'drums' : state.parts[event.channel || 0]?.id) || 'melody';
        engine.scheduleNote({ id: source, voice, pitch, velocity, when: at, durationSeconds: finite(event.durationBeats, 120 * tempo / 60) * 60 / tempo, source }); }
      return true;
    }
    async function prepare() {
      g.KitchenWebAudio.installContextFactory(sampleRate);
      if (!engine) {
        if (id === 'grain') { engine = new g.NoiseEngine(); engine.state = state; engine.setVoiceState(state); engine.values = { master: state.master ?? .78, drive: state.drive || 0, space: state.space || 0 }; await engine.init(); }
        else if (id === 'tine') { engine = new g.TineEngine(); engine.state = state; engine.values = { master: state.master ?? .78, drive: state.drive || 0, space: state.space || 0 }; await engine.setVoiceEffects(state.tracks, state.bpm); await engine.init(); }
        else if (id === 'form') { engine = new g.KitchenHotplateAudio.AudioEngine(); engine.setVoiceState(state.sounds, state.bpm); engine.setMasterVolume(.72 * finite(state.masterVolume, .8)); await engine.preload(state.sounds); }
        else if (id === 'fable') { engine = new g.FableAudio({ getState: () => state }); await engine.init(); if (engine.timer != null) g.clearInterval(engine.timer); engine.timer = null; for (const asset of state.assets) engine.getAssetAudio(asset); }
        else if (id === 'batter') { engine = new g.BatterEngine(state); await engine.init(); await engine.ensureSamples(); }
        else { engine = new g.PicnicAudioEngine({ getState: () => state }); await engine.init(); }
        context = engine.context || engine.audioContext || engine._context; if (!context) throw Error(names[id] + ' did not prepare its original audio graph.'); pull = g.KitchenWebAudio.createPull(context);
      } else {
        if (id === 'grain') { engine.state = state; engine.setVoiceState(state); engine.setMasterVolume(state.master ?? .78); engine.setEffects(state); }
        else if (id === 'tine') { engine.state = state; await engine.setVoiceEffects(state.tracks, state.bpm); engine.setMasterVolume(state.master ?? .78); engine.setEffects(state); }
        else if (id === 'form') { engine.setVoiceState(state.sounds, state.bpm); engine.setMasterVolume(.72 * finite(state.masterVolume, .8)); await engine.preload(state.sounds); }
        else if (id === 'fable') { engine.setState(state); for (const asset of state.assets) engine.getAssetAudio(asset); }
        else if (id === 'batter') { engine.setState(state); await engine.ensureSamples(); }
        else await engine.update(state);
      }
      if (id === 'grain') for (const [color, buffer] of await preparedGrainNoise(sampleRate)) engine.environment.buffers.set(color, buffer);
      playbackState = state; buildSequence();
      // Sample transforms and context AudioBuffers are ready before rendering.
      if (id === 'fable') for (const zone of state.zones) { const asset = state.assets.find(a => a.id === zone.assetId); if (asset) engine.graph.prepared(asset, zone); }
      if (id === 'batter') for (const lane of state.lanes) for (const sampleId of [...lane.sampleIds, lane.sampleId, ...(lane.blend?.sampleIds || []), lane.blend?.sampleId].filter(Boolean)) {
        if (engine.audio.has(sampleId)) engine.preparedSample(sampleId, lane, lane.reverse, context);
      }
      if (id === 'batter') for (const event of cycleEvents(0)) { const lane = { ...state.lanes[event.laneIndex], ...event.locks }, sources = engine.sourceIds(lane, event); for (const sampleId of [sources.a, sources.b].filter(Boolean)) if (engine.audio.has(sampleId)) engine.preparedSample(sampleId, lane, event.reverse ?? lane.reverse, context); }
      if (id === 'form') { const sounds = []; for (const event of cycleEvents(0)) if (event.locks && Object.keys(event.locks).some(k => !['cutoff', 'resonance'].includes(k))) sounds.push(g.KitchenHotplateAudio.applySoundLocks?.(state.sounds[event.voiceIndex], event.locks) || state.sounds[event.voiceIndex]); if (sounds.length) await engine.preload(sounds); }
      ready = true; return api;
    }
    function transport(clock) {
      if (!ready) return;
      const tempo = finite(clock.tempo, 120), at = finite(clock.frame, frame) / sampleRate;
      if (lastClock && (clock.revision !== lastClock.revision || lastClock.playing && !clock.playing)) { cancel(patternSource, Math.max(context.currentTime, at)); nextPatternSource(); }
      const anchor = { ...clock, tempo, audioTime: at, time: at };
      if (id === 'fable' && engine.graph.state.tempo !== tempo) { playbackState = { ...state, tempo }; engine.graph.setState(playbackState, context.currentTime); }
      if (id === 'batter' && engine.graph.state.tempo !== tempo) { playbackState = { ...state, tempo }; engine.updateGraph(engine.graph, playbackState); sequenceCache.clear(); }
      if (id === 'picnic' && engine._tempo !== tempo) engine.setTempo(tempo);
      if (id === 'fable' && state.performance.mode === 'arp' && clock.playing && !lastClock?.playing) for (const source of held.values()) cancel(source, Math.max(context.currentTime, at));
      engine.followTransport?.(anchor); engine.setEffectsClock?.(anchor);
      lastClock = { ...clock };
    }
    const api = {
      get ready() { return api._ready; },
      prepare() { return api._ready; },
      getFramePosition() { return frame; },
      setNativeSequence(value) { nativeSequence = value !== false; if (!nativeSequence && ready) { cancel(patternSource, context.currentTime); nextPatternSource(); } },
      setParameter(path, value) {
        if (path === '_nativeSequence') { api.setNativeSequence(value); return; }
        const keys = String(path).split('.'); let target = project;
        for (let i = 0; i < keys.length - 1; i++) { if (!target[keys[i]] || typeof target[keys[i]] !== 'object') throw Error('Unknown instrument control ' + path); target = target[keys[i]]; }
        if (!(keys[keys.length - 1] in target)) throw Error('Unknown instrument control ' + path); target[keys[keys.length - 1]] = value;
        // Host automation changes scalar controls without decoding assets,
        // warming sample variants, or replacing the active graph.
        if (!ready) return;
        if (id === 'grain' || id === 'tine') { engine.setMasterVolume(state.master ?? .78); if (/(drive|space)$/.test(path)) engine.setEffects(state); }
        else if (id === 'form') { if (path === 'masterVolume') engine.setMasterVolume(.72 * value); }
        else if (id === 'fable') engine.setState(state);
        else if (id === 'batter') engine.updateGraph(engine.graph, state);
        else { engine._state = { ...state, tempo: lastClock?.tempo || state.tempo }; engine._pool.state = engine._state; engine._graph.update(engine._state); }
      },
      getState() { if (id === 'batter' && ready) { const portable = engine.getState({ portable: true }); if (project.state) project.state = portable; else project = portable; } return copy(project); },
      setState(value) { ready = false; project = copy(value); unwrap(); api._ready = prepare(); return api._ready; },
      transport,
      noteOn(event) { if (!ready) throw Error(names[id] + ' is still preparing.'); if (!event.velocity) return api.noteOff(event); const key = String(event.id ?? (event.channel || 0) + ':' + event.pitch), source = 'kitchen-plugin-midi:' + (++serial); if (held.has(key)) cancel(held.get(key), when(event)); held.set(key, source); midiHeld.set(key, { ...event, source, down: true, order: serial }); if (id === 'fable' && state.performance.mode === 'arp' && nativeSequence && lastClock?.playing) return true; return schedule(event, when(event), source, lastClock?.tempo || state.bpm || state.tempo || 120, lastClock?.beat || 0); },
      noteOff(event) { if (!ready) return; const key = String(event.id ?? (event.channel || 0) + ':' + event.pitch), source = held.get(key); if (!source) return; const at = when(event);
        if (id === 'fable') engine.noteOff(event.pitch, { source, when: at });
        else if (id === 'picnic') { for (const voice of engine._pool.voices) if (voice.source === source) {
          const part = state.parts.find(p => p.id === voice.part), region = engine._pool.regions.get(voice.part)?.find(r => r.buffer === voice.sources[0].buffer)?.region;
          const release = Math.max(.005, Math.min(125, finite(region?.release, .12) + finite(part.release, .02)));
          voice.gain.gain.cancelAndHoldAtTime(at); voice.gain.gain.setTargetAtTime(0, at, release / Math.log(100000)); voice.stopAt = at + release;
          if (region?.loopMode === 3 && voice.sources[0].loop) {
            // SoundFont "loop until release" exits at the true MIDI gate with
            // the same phase-matched tail used for authored PICNIC notes.
            const original = voice.sources[0], buffer = original.buffer, rate = original.playbackRate.value;
            for (const node of voice.sources) { node.onended = null; try { node.stop(at); } catch (_) {} }
            const loopStart = Math.max(0, Math.min(buffer.length - 1, finite(region.loopStart, 0))), loopEnd = Math.max(loopStart + 1, Math.min(buffer.length, finite(region.loopEnd, buffer.length)));
            const travelled = Math.max(0, at - voice.when) * rate * buffer.sampleRate, offset = travelled < loopEnd ? travelled : loopStart + (travelled - loopStart) % (loopEnd - loopStart);
            const tail = context.createBufferSource(); tail.buffer = buffer; tail.playbackRate.setValueAtTime(rate, at); tail.connect(voice.gain); tail.start(at, Math.min(buffer.duration - 1 / buffer.sampleRate, offset / buffer.sampleRate)); tail.stop(voice.stopAt); voice.sources.push(tail); tail.onended = () => engine._pool._disconnect(voice);
          } else for (const node of voice.sources) try { node.stop(voice.stopAt); } catch (_) {}
        } }
        const heldEvent = midiHeld.get(key); if (heldEvent) heldEvent.down = false;
        if (id !== 'fable' || !state.performance.hold && !sustained) midiHeld.delete(key);
        // Percussion follows the web one-shot/choke behavior; key-up preserves decay.
        held.delete(key); },
      controlChange(event) { if (!ready || id !== 'fable') return; if (event.controller === 1) engine.setExpression({ wheel: event.value }); else if (event.controller === 64) { sustained = event.value >= .5; engine.sustain = sustained; engine.graph.setSustain(sustained, when(event)); if (!sustained && !state.performance.hold) for (const [key, note] of midiHeld) if (!note.down) midiHeld.delete(key); } },
      pitchBend(event) { if (ready && id === 'fable') engine.setExpression({ bend: event.value }); },
      process(left, right, clock = {}) { if (!ready) throw Error(names[id] + ' has not been prepared.'); frame = finite(clock.frame, frame); transport(clock);
        if (nativeSequence && clock.playing && finite(clock.beat, -1) >= 0) { const tempo = finite(clock.tempo, 120), beat = clock.beat, end = beat + left.length / sampleRate * tempo / 60;
          if (id === 'fable' && state.performance.mode === 'arp') {
            const p = state.performance, division = p.division, notes = [];
            for (const note of midiHeld.values()) for (let octave = 0; octave < p.octaves; octave++) if (note.pitch + octave * 12 <= 127) notes.push({ ...note, pitch: note.pitch + octave * 12 });
            notes.sort(p.arpMode === 'asplayed' ? (a, b) => a.order - b.order || a.pitch - b.pitch : (a, b) => a.pitch - b.pitch);
            for (let step = Math.max(0, Math.floor(beat / division) - 1); step * division < end; step++) {
              const b = step * division + (step % 2 ? division * state.swing * .5 : 0); if (b < beat - EPS || b >= end - EPS || !notes.length) continue;
              let index = step % notes.length;
              if (p.arpMode === 'down') index = notes.length - 1 - index;
              else if (p.arpMode === 'updown' && notes.length > 1) { const n = step % (notes.length * 2 - 2); index = n < notes.length ? n : notes.length * 2 - 2 - n; }
              else if (p.arpMode === 'random') index = Math.floor(engine.random() * notes.length);
              const chosen = p.arpMode === 'chord' ? notes : [notes[index]], at = (frame + Math.round((b - beat) * sampleRate * 60 / tempo)) / sampleRate;
              for (const note of chosen) schedule({ pitch: note.pitch, velocity: note.velocity * p.velocity, durationBeats: division * (1 + (step % 2 ? -1 : 1) * state.swing * .5) * p.gate }, at, patternSource, tempo, b);
            }
          } else {
          // Adjacent cycles include negative humanize/microtiming offsets at
          // their boundary; binary search avoids scanning an entire long chain.
          const first = Math.max(0, Math.floor(beat / length) - 1), last = Math.floor((end - EPS) / length) + 1;
          for (let cycle = first; cycle <= last; cycle++) { if (!sequenceLoop && cycle > 0) continue;
            const events = cycleEvents(cycle), origin = cycle * length; let lo = 0, hi = events.length;
            while (lo < hi) { const mid = (lo + hi) >>> 1; if (origin + events[mid].beat < beat - EPS) lo = mid + 1; else hi = mid; }
            for (let index = lo; index < events.length; index++) { const event = events[index], b = origin + event.beat; if (b >= end - EPS) break; const at = (frame + Math.round((b - beat) * sampleRate * 60 / tempo)) / sampleRate; schedule(event, at, patternSource, tempo, b); }
          }
          }
        }
        if (id === 'fable') engine.graph.tick(context.currentTime, (frame + left.length) / sampleRate + .085);
        pull.process(left, right); frame += left.length;
        const barriers = engine._sourceCuts || engine.sourceCuts || engine.futureCancels || engine._pool?.cancellationBarriers;
        for (const [source, boundary] of pendingCancels) if (boundary <= context.currentTime) { if (barriers?.get(source) <= context.currentTime) barriers.delete(source); pendingCancels.delete(source); }
      },
      reset() { if (!ready) return; cancel(undefined, context.currentTime); held.clear(); midiHeld.clear(); pendingCancels.clear(); nextPatternSource(); sustained = false; pull.reset(); lastClock = null; },
      allNotesOff() { if (ready) { cancel(undefined, context.currentTime); if (id === 'fable') engine.setSustain(false); } held.clear(); midiHeld.clear(); pendingCancels.clear(); nextPatternSource(); sustained = false; },
      panic() { api.allNotesOff(); },
      getLatencySamples() { return 128 + (id === 'batter' ? 0 : Math.max(1, Math.round(sampleRate * .006))); },
      dispose() { ready = false; if (!engine) return; if (engine.timer != null) g.clearInterval(engine.timer); if (engine.dispose) return engine.dispose(); if (engine.close) return engine.close(); engine.stopAll?.(); engine.stop?.(); return context?.close(); }
    };
    api._ready = prepare(); return api;
  }
  g.KitchenWebAudioInstruments = Object.freeze({ ids, definitions, create });
})(typeof window === 'object' ? window : globalThis);
