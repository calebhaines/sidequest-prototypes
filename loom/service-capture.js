/* SERVICE takes become ordinary editable GALLEY clips only when explicitly applied. */
(function (global) {
  'use strict';
  const EPSILON = 1e-8, MIN_CLIP = 1 / 64, MAX_BEATS = 256;
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const modulo = (value, span) => { const remainder = value % span; return remainder < 0 ? remainder + span : remainder; };
  const blankPerformance = () => ({ drops: Array(8).fill(false), stutterBeats: 0, fill: false, overrides: [] });
  function fail(message) { throw Error('SERVICE capture: ' + message); }
  function schema() { if (!global.LoomSchema) fail('the project schema is unavailable.'); return global.LoomSchema; }
  function timing() { if (!global.LoomServiceTiming?.geometry) fail('the performance timing engine is unavailable.'); return global.LoomServiceTiming; }
  function checkPhase(event) {
    if (event.tempo !== undefined && (!finite(event.tempo) || event.tempo < 40 || event.tempo > 240)) fail('the recorded tempo is invalid.');
    for (const key of ['sceneBeat', 'padBeat']) if (event[key] !== undefined && (!finite(event[key]) || event[key] < 0 || event[key] > event.beat + EPSILON)) fail('a recorded source phase is invalid.');
    for (const key of ['phaseOrigins', 'sceneStarts', 'padBeats']) if (event[key] !== undefined && (!Array.isArray(event[key]) || event[key].length !== 8 || event[key].some(value => !finite(value) || value < 0 || value > MAX_BEATS + EPSILON || key !== 'phaseOrigins' && value > event.beat + EPSILON))) fail('a recorded source phase is invalid.');
  }
  function sourceIndex(state) {
    if (!plain(state) || !Array.isArray(state.tracks) || state.tracks.length !== 8 || !Array.isArray(state.assets)) fail('choose an eight-track GALLEY project.');
    const sources = state.tracks.map(track => {
      if (!plain(track) || !Array.isArray(track.effects) || track.effects.length !== 4 || !Array.isArray(track.clips) || track.clips.length > 128) fail('every track needs four effects slots and up to 128 source clips.');
      return new Map(track.clips.map(clip => [clip.id, clip]));
    });
    return sources;
  }
  function validateTake(take, sources, state) {
    if (!plain(take) || !finite(take.lengthBeats) || take.lengthBeats < MIN_CLIP || take.lengthBeats > MAX_BEATS || !Array.isArray(take.events) || !take.events.length) fail('record a performance before applying it.');
    if (take.events.length > 8192) fail('this take exceeds 8,192 performance events. Apply a shorter take.');
    const descriptors = state.tracks.map(track => new Map(schema().automationTargets(track).map(item => [item.target, item])));
    let previous = -1;
    for (const event of take.events) {
      if (!plain(event) || !finite(event.beat) || event.beat < 0 || event.beat > take.lengthBeats + EPSILON || event.beat < previous - EPSILON) fail('performance events must run forward within the take.');
      previous = event.beat; checkPhase(event);
      if (event.kind === 'scene') {
        if (!Array.isArray(event.clips) || event.clips.length !== 8) fail('a recorded scene needs eight resolved clip selections.');
        event.clips.forEach((id, index) => { if (id !== null && (typeof id !== 'string' || !sources[index].has(id))) fail('a scene source is missing. Keep the original source clips until this take has been applied.'); });
      } else if (event.kind === 'performance') {
        if (!Array.isArray(event.drops) || event.drops.length !== 8 || event.drops.some(value => value !== true && value !== false && value !== 0 && value !== 1) || ![0, .125, .25, .5].includes(event.stutterBeats) || ![false, true, 0, 1].includes(event.fill) || !Array.isArray(event.overrides)) fail('a recorded performance control is invalid.');
        const seen = new Set();
        for (const override of event.overrides) {
          const index = state.tracks.findIndex(track => track.id === override?.trackId), descriptor = index < 0 ? null : descriptors[index].get(override?.target), key = index + ':' + override?.target;
          if (!plain(override) || !descriptor || !finite(override.value) || override.value < descriptor.min || override.value > descriptor.max || (override.effectType !== undefined && override.effectType !== descriptor.effectType) || seen.has(key)) fail('a recorded macro targets an unavailable control.');
          seen.add(key);
        }
      } else fail('the take contains an unknown event.');
    }
    return descriptors;
  }
  function nativeSource(clip) {
    if (clip.type === 'notes') fail('a note source must be prepared as dry audio before capture can be applied. Its editable notes and patch can be kept with the printed source.');
    if (!(finite(clip.length) && clip.length >= MIN_CLIP && finite(clip.sourceStart) && finite(clip.sourceEnd) && clip.sourceEnd > clip.sourceStart && finite(clip.sourceOffset) && clip.sourceOffset >= 0 && finite(clip.rate) && clip.rate >= .125 && clip.rate <= 8)) fail('a selected source has invalid native clip geometry.');
    return clip;
  }
  function phaseAt(clip, index, beat, active) {
    if (!clip) return 0;
    const geometry = timing().geometry({ clip, tempo: active.tempo, sceneBeat: active.sceneStarts[index], padBeat: active.padBeats[index], phaseOrigin: active.phaseOrigins[index], stutterBeats: active.performance.stutterBeats, fill: !!active.performance.fill }, beat);
    const origin = active.performance.stutterBeats ? active.phaseOrigins[index] : 0;
    return modulo(Math.max(0, origin + (beat - geometry.start) * geometry.rate / clip.rate), clip.length);
  }
  function compileInternal({ state, take } = {}) {
    const S = schema(), beforeSources = sourceIndex(state), descriptors = validateTake(take, beforeSources, state);
    // This clone is the only project object changed by the compiler. PCM strings remain shared.
    const next = S.copy(state), sources = sourceIndex(next), originalAssets = new Map(next.assets.map(asset => [asset.id, asset])), allIds = new Set(), usedOriginalIds = new Set(), decoded = new Map(), stutterAssets = new Map();
    next.lengthBars = Math.max(1, Math.ceil(take.lengthBeats / 4));
    next.loopEnabled = false; next.loopStart = 0; next.loopEnd = take.lengthBeats;
    next.markers = [];
    next.tracks.forEach(track => { track.clips = []; track.automation = []; track.instrumentLive = false; });
    const active = { clips: Array(8).fill(null), sceneStarts: Array(8).fill(0), padBeats: Array(8).fill(0), phaseOrigins: Array(8).fill(0), tempo: state.tempo, performance: blankPerformance() };
    let boundary = 0, sceneCount = 0, slices = 0, generatedAssets = 0;
    let pcmBytes = next.assets.reduce((sum, asset) => sum + asset.frames * asset.channels * 2, 0);
    const lanes = next.tracks.map(() => new Map()), everTargets = next.tracks.map(() => new Set()), pieceOrigins = new Map();
    for (const event of take.events) if (event.kind === 'performance') {
      event.overrides.forEach(item => everTargets[state.tracks.findIndex(track => track.id === item.trackId)].add(item.target));
      event.drops.forEach((dropped, index) => { if (dropped) everTargets[index].add('level'); });
    }
    function controls(beat, performance) {
      const overrides = new Map(performance.overrides.map(item => [item.trackId + ':' + item.target, item.value]));
      next.tracks.forEach((track, index) => {
        for (const target of everTargets[index]) {
          const descriptor = descriptors[index].get(target);
          let value = overrides.has(track.id + ':' + target) ? overrides.get(track.id + ':' + target) : descriptor.value;
          if (target === 'level' && performance.drops[index]) value = 0;
          let lane = lanes[index].get(target);
          if (!lane) { lane = { target, enabled: true, interpolation: 'hold', points: [], ...(descriptor.effectType ? { effectType: descriptor.effectType } : {}) }; lanes[index].set(target, lane); }
          const previous = lane.points[lane.points.length - 1];
          if (previous?.beat === beat) previous.value = value;
          else if (!previous || previous.value !== value) lane.points.push({ beat, value });
          if (lane.points.length > S.LIMITS.automationPoints) fail('this take exceeds 4,096 moves on one control. Apply a shorter take.');
        }
      });
    }
    controls(0, active.performance);
    function newId(source) {
      let id = usedOriginalIds.has(source.id) ? S.uid('service') : source.id;
      while (allIds.has(id)) id = S.uid('service');
      allIds.add(id); usedOriginalIds.add(source.id); return id;
    }
    function cycleLoop(source, geometry, start, end) {
      // A fast source cycle is one dry, short loop, rather than hundreds of clips.
      // Its cycle includes the same native seam envelope; track effects remain live.
      const key = JSON.stringify([source.assetId, source.sourceStart, source.sourceEnd, source.reverse, geometry.sourceOffset, geometry.rate, geometry.length, geometry.loop, geometry.fadeIn, geometry.fadeOut, active.tempo]);
      let asset = stutterAssets.get(key);
      const periodSeconds = geometry.length * 60 / active.tempo;
      if (periodSeconds > S.LIMITS.assetSeconds) fail('this source cycle exceeds the 120-second audio limit and its boundary needs a dry loop. Shorten the source clip before capturing it.');
      if (!asset) {
        const original = originalAssets.get(source.assetId);
        let audio = decoded.get(original.id);
        if (!audio) { audio = S.decodeAsset(original); decoded.set(original.id, audio); }
        const sampleRate = audio.sampleRate, frames = Math.ceil(periodSeconds * sampleRate) + 1;
        if (pcmBytes + frames * 4 > S.LIMITS.pcmBytes) fail('a fast source loop would exceed the 64 MB audio budget. Remove unused source audio or apply a shorter take.');
        const left = new Float32Array(frames), right = new Float32Array(frames), span = source.sourceEnd - source.sourceStart;
        const fadeIn = Math.min(geometry.length / 2, Math.max(.003 * active.tempo / 60, geometry.fadeIn || 0)), fadeOut = Math.min(geometry.length / 2, Math.max(.003 * active.tempo / 60, geometry.fadeOut || 0));
        for (let frame = 0; frame < frames; frame++) {
          const seconds = frame / sampleRate, localBeat = seconds * active.tempo / 60;
          if (localBeat >= geometry.length) continue;
          let offset = geometry.sourceOffset + seconds * geometry.rate;
          if (geometry.loop) offset = modulo(offset, span);
          else if (offset >= span) continue;
          const position = (source.reverse ? source.sourceEnd - 1 / sampleRate - offset : source.sourceStart + offset) * sampleRate;
          if (position < 0 || position >= audio.left.length) continue;
          const at = Math.floor(position), fraction = position - at, after = Math.min(at + 1, audio.left.length - 1);
          let gain = Math.min(1, localBeat / fadeIn, (geometry.length - localBeat) / fadeOut);
          if (!geometry.loop) gain *= Math.min(1, offset / .003, (span - offset) / .003);
          left[frame] = (audio.left[at] * (1 - fraction) + audio.left[after] * fraction) * gain;
          right[frame] = (audio.right[at] * (1 - fraction) + audio.right[after] * fraction) * gain;
        }
        const name = active.performance.stutterBeats ? 'stutter cycle' : active.performance.fill ? 'fill cycle' : 'capture cycle';
        asset = S.encodeAsset({ left, right, sampleRate, name: source.name + ' · ' + name, id: S.uid('service-audio') });
        next.assets.push(asset); pcmBytes += asset.frames * asset.channels * 2; stutterAssets.set(key, asset); generatedAssets++;
      }
      const name = active.performance.stutterBeats ? 'stutter' : active.performance.fill ? 'fill loop' : 'capture loop';
      const clip = { id: newId(source), name: source.name + ' · ' + name, type: 'audio', assetId: asset.id, start, length: end - start, sourceStart: 0, sourceEnd: periodSeconds, sourceOffset: modulo((start - geometry.start) * 60 / active.tempo, periodSeconds), rate: 1, reverse: false, loop: true, gain: source.gain, fadeIn: 0, fadeOut: 0 };
      if (source.origin) clip.origin = S.copy(source.origin);
      if (clip.length < MIN_CLIP - EPSILON) fail('a source fragment is shorter than GALLEY’s 1/64-beat clip minimum. Finish or switch this take on a slightly later beat.');
      return clip;
    }
    function emitInterval(end) {
      if (end <= boundary + EPSILON) { boundary = end; return; }
      active.clips.forEach((id, index) => {
        if (id === null) return;
        const source = nativeSource(sources[index].get(id)), span = source.sourceEnd - source.sourceStart;
        if (!originalAssets.has(source.assetId)) fail('a selected source audio asset is missing.');
        const firstGeometry = timing().geometry({ clip: source, tempo: active.tempo, sceneBeat: active.sceneStarts[index], padBeat: active.padBeats[index], phaseOrigin: active.phaseOrigins[index], stutterBeats: active.performance.stutterBeats, fill: !!active.performance.fill }, boundary + EPSILON);
        const firstFragment = Math.min(end, firstGeometry.start + firstGeometry.length) - boundary;
        const lastStart = firstGeometry.start + Math.floor((end - firstGeometry.start - EPSILON) / firstGeometry.length) * firstGeometry.length;
        const lastFragment = end - Math.max(boundary, lastStart);
        const tinyFragment = firstFragment > EPSILON && firstFragment < MIN_CLIP - EPSILON || lastFragment > EPSILON && lastFragment < MIN_CLIP - EPSILON;
        if (tinyFragment || Math.ceil(take.lengthBeats / firstGeometry.length) > S.LIMITS.clipsPerTrack || Math.ceil((end - boundary) / firstGeometry.length) + next.tracks[index].clips.length > S.LIMITS.clipsPerTrack) {
          if (next.tracks[index].clips.length >= S.LIMITS.clipsPerTrack) fail('this take needs more than 128 clips on ' + next.tracks[index].name + '. Shorten the take or use a longer loop.');
          const clip = cycleLoop(source, firstGeometry, boundary, end), previous = next.tracks[index].clips[next.tracks[index].clips.length - 1];
          const cycleKey = JSON.stringify([source.id, active.tempo, active.sceneStarts[index], active.padBeats[index], active.phaseOrigins[index], active.performance.stutterBeats, active.performance.fill]);
          if (previous && previous.assetId === clip.assetId && pieceOrigins.get(previous.id)?.cycleKey === cycleKey && Math.abs(previous.start + previous.length - clip.start) <= EPSILON) previous.length += clip.length;
          else { next.tracks[index].clips.push(clip); pieceOrigins.set(clip.id, { cycleKey }); slices++; }
          return;
        }
        let cursor = boundary, guard = 0;
        while (cursor < end - EPSILON) {
          if (++guard > 129) fail('this take needs more than 128 clips on ' + next.tracks[index].name + '. Shorten the take or use a longer loop.');
          const geometry = timing().geometry({ clip: source, tempo: active.tempo, sceneBeat: active.sceneStarts[index], padBeat: active.padBeats[index], phaseOrigin: active.phaseOrigins[index], stutterBeats: active.performance.stutterBeats, fill: !!active.performance.fill }, cursor + EPSILON);
          if (!plain(geometry) || !finite(geometry.start) || !finite(geometry.length) || geometry.length <= 0 || !finite(geometry.rate) || geometry.rate < .125 || geometry.rate > 8) fail('the source timing could not be resolved.');
          const start = Math.max(cursor, geometry.start), finish = Math.min(end, geometry.start + geometry.length), length = finish - start;
          if (length <= EPSILON) fail('the source timing did not advance.');
          let sourceOffset = geometry.sourceOffset + (start - geometry.start) * 60 / active.tempo * geometry.rate;
          if (geometry.loop) sourceOffset = modulo(sourceOffset, span);
          const silent = !geometry.loop && sourceOffset >= span - EPSILON;
          if (!silent) {
            const previous = next.tracks[index].clips[next.tracks[index].clips.length - 1], origin = previous && pieceOrigins.get(previous.id);
            if (previous && origin?.sourceId === source.id && Math.abs(origin.start - geometry.start) <= EPSILON && Math.abs(origin.length - geometry.length) <= EPSILON && Math.abs(previous.start + previous.length - start) <= EPSILON) {
              // Held scene cells stay continuous, even while other tracks switch.
              previous.length += length;
              previous.fadeIn = Math.min(previous.length / 2, previous.start <= geometry.start + EPSILON ? geometry.fadeIn || 0 : 0);
              previous.fadeOut = Math.min(previous.length / 2, finish >= geometry.start + geometry.length - EPSILON ? geometry.fadeOut || 0 : 0);
              cursor = finish; continue;
            }
            if (length < MIN_CLIP - EPSILON) fail('a source fragment is shorter than GALLEY’s 1/64-beat clip minimum. Finish or switch this take on a slightly later beat.');
            if (next.tracks[index].clips.length >= S.LIMITS.clipsPerTrack) fail('this take needs more than 128 clips on ' + next.tracks[index].name + '. Shorten the take or use a longer loop.');
            const clip = S.copy(source);
            Object.assign(clip, { id: newId(source), start, length, sourceOffset, rate: geometry.rate, loop: !!geometry.loop,
              fadeIn: Math.min(length / 2, start <= geometry.start + EPSILON ? geometry.fadeIn || 0 : 0),
              fadeOut: Math.min(length / 2, finish >= geometry.start + geometry.length - EPSILON ? geometry.fadeOut || 0 : 0) });
            next.tracks[index].clips.push(clip); pieceOrigins.set(clip.id, { sourceId: source.id, start: geometry.start, length: geometry.length }); slices++;
          }
          cursor = finish;
        }
      });
      boundary = end;
    }
    for (const event of take.events) {
      if (event.tempo !== undefined && Math.abs(event.tempo - state.tempo) > EPSILON) fail('tempo changes are not supported inside one capture. Use the same tempo throughout this take.');
      if (event.kind === 'scene') {
        emitInterval(event.beat);
        active.clips = event.clips.slice(); active.sceneStarts = event.sceneStarts?.slice() || Array(8).fill(event.sceneBeat ?? event.beat); active.padBeats = event.padBeats?.slice() || Array(8).fill(event.padBeat ?? event.beat); active.phaseOrigins = event.phaseOrigins?.slice() || Array(8).fill(0);
        sceneCount++;
        if (next.markers.length >= S.LIMITS.markers) fail('this take exceeds 128 scene markers. Apply a shorter take.');
        const scene = state.service?.scenes?.find(scene => scene.id === event.sceneId);
        next.markers.push({ id: S.uid('marker'), name: scene?.name || 'Scene ' + sceneCount, beat: event.beat, color: /^#[0-9a-f]{6}$/i.test(scene?.color || '') ? scene.color : S.COLORS[(sceneCount - 1) % 8] });
      } else {
        const padChanged = active.performance.stutterBeats !== event.stutterBeats || !!active.performance.fill !== !!event.fill;
        if (padChanged) {
          emitInterval(event.beat);
          const origins = event.phaseOrigins?.slice() || active.clips.map((id, index) => phaseAt(id === null ? null : sources[index].get(id), index, event.beat, active));
          active.padBeats = event.padBeats?.slice() || Array(8).fill(event.padBeat ?? event.beat); active.phaseOrigins = origins;
        }
        active.performance = { drops: event.drops.slice(), stutterBeats: event.stutterBeats, fill: !!event.fill, overrides: S.copy(event.overrides) };
        controls(event.beat, active.performance);
      }
    }
    emitInterval(take.lengthBeats);
    if (!slices) fail('the take contains no audible source clips. Launch a scene while capture is armed.');
    next.tracks.forEach((track, index) => {
      if (lanes[index].size > S.LIMITS.automationLanes) fail('this take exceeds the automation lane limit.');
      track.automation = [...lanes[index].values()];
    });
    if (next.recording) { next.recording.punchEnabled = false; next.recording.punchStart = 0; next.recording.punchEnd = Math.min(take.lengthBeats, next.lengthBars * 4); }
    delete next.service;
    const normalized = S.normalize(next);
    // Normalization must never silently truncate a take or move its source geometry.
    normalized.tracks.forEach((track, index) => {
      if (track.clips.length !== next.tracks[index].clips.length || track.automation.length !== next.tracks[index].automation.length) fail('the project could not retain the complete performance.');
      track.clips.forEach((clip, at) => { const raw = next.tracks[index].clips[at]; for (const key of ['start', 'length', 'sourceStart', 'sourceEnd', 'sourceOffset', 'rate', 'gain', 'fadeIn', 'fadeOut']) if (Math.abs(clip[key] - raw[key]) > EPSILON) fail('a captured source exceeds native clip limits.'); });
      track.automation.forEach((lane, at) => { if (lane.points.length !== next.tracks[index].automation[at].points.length) fail('the project could not retain every control move.'); });
    });
    return { state: normalized, summary: { lengthBeats: take.lengthBeats, lengthBars: normalized.lengthBars, clips: slices, clipsPerTrack: normalized.tracks.map(track => track.clips.length), automationLanes: normalized.tracks.reduce((sum, track) => sum + track.automation.length, 0), automationPoints: normalized.tracks.reduce((sum, track) => sum + track.automation.reduce((count, lane) => count + lane.points.length, 0), 0), scenes: sceneCount, assets: normalized.assets.length, generatedAssets } };
  }
  function compile(options) { return compileInternal(options).state; }
  function preflight(options) { return compileInternal(options).summary; }
  global.LoomServiceCapture = Object.freeze({ compile, preflight });
})(window);
