/* MORSEL native adapter. Neural/WASM work is performed by the original editor
 * preparation helper; this synchronous backend uses its actual cached audio.
 * Fixed authored notes retain the original fit and routing. Live MIDI has an
 * unknown future gate, so voiced material sustains a prepared voiced region
 * until note-off instead of guessing and blocking the audio callback. */
(function (scope) {
  'use strict';
  const ID = 'morsel', VOICES = ['alto', 'tenor', 'bass', 'robot'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const hash = text => { let value = 2166136261; for (let at = 0; at < text.length; at++) value = Math.imul(value ^ text.charCodeAt(at), 16777619); return value >>> 0; };
  function definitions() {
    const recipe = scope.MorselSchema.defaultState();
    const ranges = [['tone', 'Tone', 0, 1, .01], ['air', 'Air', 0, 1, .01], ['vibrato', 'Vibrato', 0, 1, .01], ['space', 'Space', 0, 1, .01], ['volume', 'Volume', 0, 1, .01], ['attack', 'Attack', .001, .5, .001], ['release', 'Release', .005, 2, .001]];
    const parameters = ranges.map(([key, label, min, max, step]) => ({ key, path: 'recipe.' + key, label, type: 'range', min, max, step, default: recipe[key], normalizedDefault: (recipe[key] - min) / (max - min) }));
    parameters.push({ key: 'voice', path: 'recipe.voice', label: 'Voice', type: 'select', min: 0, max: 3, step: 1, default: recipe.voice, normalizedDefault: 0, options: scope.MorselSchema.VOICES.map(voice => ({ value: voice.id, label: voice.name })) });
    parameters.push({ key: 'followHost', path: 'followHost', label: 'Follow DAW pattern', type: 'boolean', min: 0, max: 1, step: 1, default: true, normalizedDefault: 1 });
    return [{ id: ID, name: 'MORSEL', kind: 'instrument', category: 'Voice synthesis', latencySamples: 128, defaultBankResource: 'morsel-bank.json', parameters, defaults: { recipe, followHost: true, bank: null }, preparation: 'Original neural word and note preparation in the editor; bank retained in plugin state.', liveMidi: 'Prepared per-pitch speech with a voiced sustain loop and key-off release; authored phrase notes use their exact prepared durations.' }];
  }
  function create(id, sampleRate, supplied = {}, resources = {}) {
    if (id !== ID) throw Error('Unknown MORSEL native instrument.');
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw Error('Unsupported MORSEL sample rate.');
    const S = scope.MorselSchema, Q = scope.MorselSequence, P = scope.KitchenMorselPreparation, W = scope.KitchenWebAudio;
    if (!S || !Q || !P || !W || !scope.MorselAudio) throw Error('MORSEL native sources or Web Audio compatibility are missing.');
    let recipe = S.normalize(supplied.recipe || supplied.state || supplied), bank = supplied.bank || resources.morselBank || resources.bank || scope.KitchenMorselDefaultBank;
    let followHost = supplied.followHost !== false, lastClock = null, disposed = false;
    W.installContextFactory(sampleRate);
    // MorselAudio.init creates its graph synchronously before awaiting speech.
    // A restored bank never calls neural synthesis or a stretch worker here.
    scope.MorselSpeech = { backend: 'kitten-tts-nano-0.8-int8', prepare: () => Promise.resolve(), render: () => Promise.reject(Error('Prepare changed MORSEL words in its editor before playing them.')) };
    const audio = new scope.MorselAudio(recipe); const initialization = audio.init(); initialization.catch(() => {});
    if (!audio.context || !audio.graph) throw Error('MORSEL could not construct its native audio graph.');
    P.hydrateBank(audio, bank);
    const pull = W.createPull(audio.context), held = new Map(), preparedBuffers = new Map(), sent = new Set();
    let sentCycle = null;
    function identity(note) { return scope.MorselAudioDSP.identity(note, recipe); }
    function validateCoverage(nextRecipe, nextBank) {
      const words = new Set(nextBank.words.map(value => value.identity)), notes = new Set(nextBank.notes.map(value => value.identity + '\u0000' + value.pitch));
      const keyboard = nextRecipe.voice + '\u0000' + nextRecipe.lyric.trim().replace(/\s+/g, ' ');
      for (let pitch = 36; pitch <= 84; pitch++) if (!words.has(keyboard) || !notes.has(keyboard + '\u0000' + pitch)) throw Error('Prepare every MORSEL keyboard note before using this word or voice.');
      for (const note of Q.events(nextRecipe, { realizeProbability: false })) {
        const value = scope.MorselAudioDSP.identity(note, nextRecipe), key = value.voice + '\u0000' + value.lyric;
        if (!words.has(key) || !notes.has(key + '\u0000' + value.pitch)) throw Error('Prepare the edited MORSEL phrase before playing it.');
      }
    }
    validateCoverage(recipe, bank);
    function makeBuffers() {
      preparedBuffers.clear();
      for (const entry of audio.noteCache.values()) {
        const buffer = audio.context.createBuffer(1, entry.left.length, entry.sampleRate); buffer.getChannelData(0).set(entry.left);
        const noiseData = scope.MorselAudioDSP.breathBuffer(entry.left, hash(entry.key)), noise = audio.context.createBuffer(1, noiseData.length, entry.sampleRate); noise.getChannelData(0).set(noiseData);
        let heldBuffer = buffer, heldNoise = noise;
        if (entry.hasHold && entry.holdBegin > 1 && entry.holdEnd - entry.holdBegin > 4) {
          const fade = Math.min(Math.round(entry.sampleRate * .006), entry.holdBegin, Math.floor((entry.holdEnd - entry.holdBegin) / 4));
          if (fade > 1) {
            heldBuffer = audio.context.createBuffer(1, entry.left.length, entry.sampleRate); heldNoise = audio.context.createBuffer(1, entry.left.length, entry.sampleRate);
            const left = heldBuffer.getChannelData(0), air = heldNoise.getChannelData(0); left.set(entry.left); air.set(noiseData);
            for (let at = 0; at < fade; at++) {
              const gain = .5 - .5 * Math.cos(Math.PI * (at + 1) / fade), target = entry.holdEnd - fade + at, source = entry.holdBegin - fade + at;
              left[target] = left[target] * (1 - gain) + entry.left[source] * gain;
              air[target] = air[target] * (1 - gain) + noiseData[source] * gain;
            }
          }
        }
        preparedBuffers.set(entry.key, { buffer, noise, heldBuffer, heldNoise });
      }
    }
    makeBuffers();
    function schedule(event, isHeld) {
      const note = identity(event), at = Math.max(audio.context.currentTime, Number.isFinite(event.when) ? event.when : (event.frame || 0) / sampleRate);
      const duration = isHeld ? 120 : event.durationSeconds, velocity = event.velocity ?? .8;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 120 || !Number.isFinite(velocity) || velocity <= 0 || velocity > 1) return null;
      const entry = audio._preparedNote(note, isHeld ? .8 + recipe.release : duration + recipe.release), cached = preparedBuffers.get(entry.key);
      if (!cached) throw Error('The prepared MORSEL sample is unavailable.');
      if (audio.records.size >= 32) audio._cancel([...audio.records].sort((a, b) => a.start - b.start)[0], audio.context.currentTime, true);
      const context = audio.context, source = context.createBufferSource(), air = context.createBufferSource(), bus = context.createGain(), airGain = context.createGain(), vibrato = context.createOscillator(), vibratoDepth = context.createGain();
      source.buffer = isHeld ? cached.heldBuffer : cached.buffer; air.buffer = isHeld ? cached.heldNoise : cached.noise;
      if (isHeld && entry.hasHold) for (const node of [source, air]) { node.loop = true; node.loopStart = entry.holdBegin / entry.sampleRate; node.loopEnd = entry.holdEnd / entry.sampleRate; }
      airGain.gain.value = recipe.air * .35; air.connect(airGain); airGain.connect(bus); source.connect(bus); bus.connect(audio.graph.input);
      vibrato.type = 'sine'; vibrato.frequency.value = 5.2; vibratoDepth.gain.value = recipe.vibrato * 38; vibrato.connect(vibratoDepth); vibratoDepth.connect(source.detune);
      const attack = Math.min(recipe.attack, duration * .4), end = at + duration + recipe.release, gain = velocity * .9;
      bus.gain.setValueAtTime(0, at); bus.gain.linearRampToValueAtTime(gain, at + attack); bus.gain.setValueAtTime(gain, at + duration); bus.gain.linearRampToValueAtTime(0, end);
      const record = { source, air, bus, airGain, vibrato, vibratoDepth, scope: event.source || 'morsel-native', start: at, gate: at + duration, end, attack, gain, stopped: false, channel: event.channel ?? 0, pitch: note.pitch, cancelledAt: undefined, cancelEnd: undefined };
      audio.records.add(record);
      const cleanup = () => { if (record.cleaned) return; record.cleaned = true; audio.records.delete(record); if (record.nativeKey && held.get(record.nativeKey) === record) held.delete(record.nativeKey); for (const node of [source, air, bus, airGain, vibrato, vibratoDepth]) try { node.disconnect(); } catch (_) {} };
      record.cleanup = cleanup; source.onended = cleanup; source.start(at); air.start(at); vibrato.start(at); source.stop(end + .001); air.stop(end + .001); vibrato.stop(end + .001);
      return record;
    }
    function release(record, when) {
      if (!record || record.cleaned || record.cancelledAt !== undefined) return;
      const at = Math.max(audio.context.currentTime, when), end = at + recipe.release;
      const param = record.bus.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
      else { const gain = at < record.start + record.attack ? record.gain * Math.max(0, at - record.start) / record.attack : record.gain; param.cancelScheduledValues(at); param.setValueAtTime(gain, at); }
      param.linearRampToValueAtTime(0, end); record.cancelledAt = at; record.cancelEnd = end;
      for (const node of [record.source, record.air, record.vibrato]) try { node.stop(end + .001); } catch (_) {}
    }
    function eventKey(event) { return (event.channel ?? 0) + ':' + (event.id === undefined ? event.pitch : event.id); }
    function reset() {
      for (const record of [...audio.records]) audio._cancel(record, audio.context.currentTime, true);
      held.clear(); sent.clear(); sentCycle = null; lastClock = null; pull.reset();
    }
    function transport(clock) {
      if (disposed) return;
      if (lastClock && (clock.revision !== lastClock.revision || !clock.playing && lastClock.playing)) {
        audio.stopNotes({ source: 'morsel-native-pattern', when: audio.context.currentTime }); sent.clear(); sentCycle = null;
      }
      lastClock = { ...clock };
    }
    function sequence(clock, frames) {
      if (!followHost || !clock?.playing || !Number.isFinite(clock.beat) || !Number.isFinite(clock.tempo) || clock.tempo <= 0) return;
      const length = Q.lengthBeats(recipe), end = clock.beat + frames / sampleRate * clock.tempo / 60;
      const firstCycle = Math.floor(clock.beat / length), finalCycle = Math.floor(end / length);
      if (sentCycle !== firstCycle) { sent.clear(); sentCycle = firstCycle; }
      for (let cycle = firstCycle; cycle <= finalCycle; cycle++) for (const note of Q.events(recipe, { cycle })) {
        const beat = cycle * length + note.beat, offset = Math.round((beat - clock.beat) * 60 / clock.tempo * sampleRate), token = cycle + ':' + note.id;
        if (offset < 0 || offset >= frames || sent.has(token)) continue;
        sent.add(token); schedule({ ...note, frame: (clock.frame || 0) + offset, durationSeconds: note.duration * 60 / clock.tempo, source: 'morsel-native-pattern' }, false);
      }
    }
    return {
      getState() { return { recipe: clone(recipe), bank, followHost }; },
      setState(value = {}) {
        const next = S.normalize(value.recipe || value.state || value), nextBank = value.bank || bank; validateCoverage(next, nextBank);
        if (nextBank !== bank) {
          const prepared = {}; P.hydrateBank(prepared, nextBank); reset();
          audio.words = prepared.words; audio.noteCache = prepared.noteCache; audio.wordBytes = prepared.wordBytes; audio.noteBytes = prepared.noteBytes;
          bank = nextBank; makeBuffers();
        }
        recipe = next; if (value.followHost !== undefined) followHost = value.followHost !== false; audio.setState(recipe); sent.clear();
      },
      setParameter(path, value) {
        if (path === 'followHost') { followHost = !!value; if (!followHost) audio.stopNotes({ source: 'morsel-native-pattern', when: audio.context.currentTime }); return; }
        const key = path.replace(/^recipe\./, ''), permitted = ['tone', 'air', 'vibrato', 'space', 'volume', 'attack', 'release', 'voice'];
        if (!permitted.includes(key)) throw Error('Unknown MORSEL parameter.');
        const next = S.normalize({ ...recipe, [key]: value }); validateCoverage(next, bank); recipe = next; audio.setState(recipe);
      },
      reset, transport,
      noteOn(event) {
        if (!Number.isInteger(event.pitch) || event.pitch < 36 || event.pitch > 84 || !(event.velocity > 0)) return false;
        const key = eventKey(event), previous = held.get(key); if (previous) release(previous, (event.frame || 0) / sampleRate);
        const record = schedule({ ...event, voice: recipe.voice, lyric: recipe.lyric, source: 'morsel-native-midi-' + key }, true); if (record) { record.nativeKey = key; held.set(key, record); } return !!record;
      },
      noteOff(event) { const key = eventKey(event), record = held.get(key); if (!record) return false; release(record, (event.frame || 0) / sampleRate); held.delete(key); return true; },
      allNotesOff() { for (const record of held.values()) release(record, audio.context.currentTime); held.clear(); },
      process(left, right, clock) { if (disposed) { left.fill(0); right.fill(0); return; } transport(clock || {}); sequence(clock, left.length); pull.process(left, right); },
      scheduleAuthoredNote(event) { return schedule(event, false); },
      getLatencySamples() { return pull.getLatencySamples(); },
      getTailSeconds() { return 1.25 + recipe.release; },
      getMeters() { return audio.getMeters(); },
      getPreparedStatus() { return { ready: true, backend: bank.backend, words: audio.words.size, notes: audio.noteCache.size, bankKey: bank.key, liveMidi: 'voiced-hold-until-note-off' }; },
      get engine() { return audio; },
      dispose() { if (disposed) return; reset(); disposed = true; audio.disposed = true; for (const value of [audio.graph, ...audio.retiredGraphs.keys()]) for (const key of ['input', 'highpass', 'tone', 'master', 'wet', 'room', 'analyser']) try { value?.[key]?.disconnect(); } catch (_) {} audio.output?.disconnect(); audio.stretch.dispose(); audio.context.close(); }
    };
  }
  scope.KitchenMorselPlugin = Object.freeze({ ids: Object.freeze([ID]), definitions, create });
})(typeof window === 'object' ? window : globalThis);
