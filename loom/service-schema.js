/* Optional SERVICE performance data. Arrangement state and audio remain authoritative. */
(() => {
  'use strict';
  const LIMITS = Object.freeze({ scenes: 16, macros: 4, mappingsPerMacro: 32, midiBindings: 64, takeEvents: 8192, overridesPerEvent: 128, beats: 256 });
  const QUANTIZE = Object.freeze([0, 1, 2, 4, 8, 16]);
  const STUTTER = Object.freeze([0, .125, .25, .5]);
  const MACRO_NAMES = Object.freeze(['Heat', 'Pressure', 'Space', 'Motion']);
  const CONTROLS = new Set(['control:play', 'control:stop', 'pad:stutter', 'pad:fill', 'pad:drop']);
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const number = (v, lo, hi, fallback) => finite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  const label = (v, fallback, max = 60) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || fallback : fallback;
  const identifier = v => typeof v === 'string' && /^[a-z0-9_-]{1,100}$/i.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
  const targetName = v => v === 'level' || v === 'pan' || typeof v === 'string' && /^fx:[0-3]:[a-z][a-z0-9_]{0,59}$/i.test(v);
  const trackId = v => typeof v === 'string' && /^track-[1-8]$/.test(v);
  const macroId = v => typeof v === 'string' && /^macro-[1-4]$/.test(v);
  const fail = message => { throw Error('SERVICE ' + message); };
  const trackFor = (state, id) => state?.tracks?.find(t => t.id === id);
  const validClip = (state, index, id) => typeof id === 'string' && state?.tracks?.[index]?.clips?.some(c => c.id === id);
  const uid = () => window.LoomSchema?.uid('scene') || 'scene-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  function defaults() {
    return { version: 1, quantize: 4, selectedSceneId: null, scenes: [], macros: MACRO_NAMES.map((name, i) => ({ id: 'macro-' + (i + 1), name, value: .5, mappings: [] })), midiBindings: [] };
  }
  function targets(track) {
    const result = (window.LoomSchema?.automationTargets(track) || []).map(p => ({ ...p }));
    for (let slot = 0; slot < 4; slot++) {
      const effect = track?.effects?.[slot], definition = (window.LoomEffectsCatalog || []).find(p => p.id === effect?.type);
      const target = 'fx:' + slot + ':mix';
      if (definition && !result.some(p => p.target === target)) result.push({ target, label: (slot + 1) + ' · ' + definition.name + ' · Mix', min: 0, max: 1, step: .01, default: definition.defaults.mix ?? 1, value: number(effect.params?.mix, 0, 1, definition.defaults.mix ?? 1), unit: '', effectType: definition.id });
    }
    return result;
  }
  function targetIndex(state) {
    return new Map((state?.tracks || []).map(track => [track.id, new Map(targets(track).map(d => [d.target, d]))]));
  }
  function descriptor(state, reference, index) {
    const track = trackFor(state, reference?.trackId);
    if (!track) return null;
    const result = index ? index.get(track.id)?.get(reference?.target) : targets(track).find(p => p.target === reference?.target);
    if (!result || result.effectType && reference.effectType && reference.effectType !== result.effectType) return null;
    return result;
  }
  function referenceShape(reference, state, valueKeys, index) {
    if (!plain(reference) || !trackId(reference.trackId) || !targetName(reference.target)) fail('contains an invalid parameter target.');
    const fx = reference.target.startsWith('fx:');
    if (fx ? !identifier(reference.effectType) : reference.effectType !== undefined) fail('contains an invalid effect reference.');
    for (const key of valueKeys) if (!finite(reference[key]) || Math.abs(reference[key]) > 1e9) fail('contains a non-finite or excessive parameter value.');
    return descriptor(state, reference, index);
  }
  function normalizeMapping(raw, state, index) {
    if (!plain(raw) || !trackId(raw.trackId) || !targetName(raw.target)) return null;
    const d = descriptor(state, raw, index);
    if (!d) return null;
    const min = number(raw.min, d.min, d.max, d.min), max = number(raw.max, min, d.max, d.max);
    const result = { trackId: raw.trackId, target: d.target, min, max, baseline: number(raw.baseline, min, max, number(d.value, min, max, d.default)), polarity: raw.polarity === 'inverse' ? 'inverse' : 'normal' };
    if (d.effectType) result.effectType = d.effectType;
    return result;
  }
  function mappingValue(mapping, value) {
    const at = number(value, 0, 1, .5), x = mapping?.polarity === 'inverse' ? 1 - at : at;
    const min = finite(mapping?.min) ? mapping.min : 0, max = finite(mapping?.max) ? Math.max(min, mapping.max) : min;
    const baseline = number(mapping?.baseline, min, max, min);
    return x < .5 ? min + (baseline - min) * x * 2 : baseline + (max - baseline) * (x - .5) * 2;
  }
  function midiTarget(value, scenes) {
    if (CONTROLS.has(value)) return true;
    if (typeof value !== 'string') return false;
    if (value.startsWith('macro:')) return macroId(value.slice(6));
    return value.startsWith('scene:') && scenes.some(s => s.id === value.slice(6));
  }
  function phaseFields(event) {
    const result = {};
    for (const key of ['sceneBeat', 'padBeat']) if (event[key] !== undefined) result[key] = number(event[key], 0, LIMITS.beats, 0);
    if (event.tempo !== undefined) result.tempo = number(event.tempo, 40, 240, 96);
    for (const key of ['phaseOrigins', 'sceneStarts', 'padBeats']) if (event[key] !== undefined) result[key] = Array.from({ length: 8 }, (_, i) => number(event[key]?.[i], 0, key === 'phaseOrigins' ? LIMITS.beats : number(event.beat, 0, LIMITS.beats, 0), 0));
    return result;
  }
  function normalizeTake(raw, state, sceneIds, index) {
    if (!plain(raw)) return null;
    const lengthBeats = number(raw.lengthBeats, 0, LIMITS.beats, 0), events = [];
    for (const e of (Array.isArray(raw.events) ? raw.events : []).slice(0, LIMITS.takeEvents)) {
      if (!plain(e) || !finite(e.beat)) continue;
      const beat = number(e.beat, 0, lengthBeats, 0);
      if (e.kind === 'scene') {
        events.push({ kind: 'scene', beat, sceneId: sceneIds.has(e.sceneId) ? e.sceneId : null, clips: Array.from({ length: 8 }, (_, i) => validClip(state, i, e.clips?.[i]) ? e.clips[i] : null), ...phaseFields(e) });
      } else if (e.kind === 'performance') {
        const overrides = [], seen = new Set();
        for (const r of (Array.isArray(e.overrides) ? e.overrides : []).slice(0, LIMITS.overridesPerEvent)) {
          if (!plain(r) || !finite(r.value)) continue;
          const d = descriptor(state, r, index), key = r.trackId + ':' + r.target;
          if (!d || seen.has(key)) continue;
          seen.add(key);
          const override = { trackId: r.trackId, target: d.target, value: number(r.value, d.min, d.max, d.default) };
          if (d.effectType) override.effectType = d.effectType;
          overrides.push(override);
        }
        events.push({ kind: 'performance', beat, drops: Array.from({ length: 8 }, (_, i) => e.drops?.[i] === true), stutterBeats: STUTTER.includes(e.stutterBeats) ? e.stutterBeats : 0, fill: e.fill === 1 ? 1 : 0, overrides, ...phaseFields(e) });
      }
    }
    // Stable ordering keeps same-beat gestures in their recorded order.
    events.sort((a, b) => a.beat - b.beat);
    return { lengthBeats, events };
  }
  function normalize(raw, state) {
    const result = defaults();
    if (!plain(raw)) return result;
    const index = targetIndex(state);
    result.quantize = QUANTIZE.includes(raw.quantize) ? raw.quantize : 4;
    const ids = new Set();
    for (const scene of (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, LIMITS.scenes)) {
      if (!plain(scene)) continue;
      const id = identifier(scene.id) ? scene.id : uid();
      if (ids.has(id)) continue;
      ids.add(id);
      result.scenes.push({ id, name: label(scene.name, 'Scene ' + (result.scenes.length + 1)), lengthBeats: number(scene.lengthBeats, 4, LIMITS.beats, 4), slots: Array.from({ length: 8 }, (_, i) => {
        const slot = scene.slots?.[i];
        if (slot?.mode === 'clip' && validClip(state, i, slot.clipId)) return { mode: 'clip', clipId: slot.clipId };
        return { mode: slot?.mode === 'hold' ? 'hold' : 'silence' };
      }) });
    }
    result.selectedSceneId = ids.has(raw.selectedSceneId) ? raw.selectedSceneId : null;
    result.macros = result.macros.map((base, i) => {
      const rawMacro = Array.isArray(raw.macros) ? raw.macros.find(m => m?.id === base.id) || raw.macros[i] : null;
      return { ...base, name: label(rawMacro?.name, base.name), value: number(rawMacro?.value, 0, 1, .5), mappings: (Array.isArray(rawMacro?.mappings) ? rawMacro.mappings : []).slice(0, LIMITS.mappingsPerMacro).map(r => normalizeMapping(r, state, index)).filter(Boolean) };
    });
    const bindingIds = new Set();
    for (const binding of (Array.isArray(raw.midiBindings) ? raw.midiBindings : []).slice(0, LIMITS.midiBindings)) {
      if (!plain(binding) || !midiTarget(binding.target, result.scenes) || !['note', 'cc'].includes(binding.type) || !Number.isInteger(binding.number) || binding.number < 0 || binding.number > 127) continue;
      const id = identifier(binding.id) ? binding.id : uid().replace(/^scene-/, 'midi-');
      if (bindingIds.has(id)) continue;
      bindingIds.add(id);
      result.midiBindings.push({ id, inputId: typeof binding.inputId === 'string' && binding.inputId.length <= 200 && !/[\u0000-\u001f\u007f]/.test(binding.inputId) ? binding.inputId || '*' : '*', channel: Number.isInteger(binding.channel) && binding.channel >= 0 && binding.channel <= 15 ? binding.channel : null, type: binding.type, number: binding.number, target: binding.target });
    }
    if (raw.take !== undefined) result.take = normalizeTake(raw.take, state, ids, index) || { lengthBeats: 0, events: [] };
    return result;
  }
  function validate(raw, state) {
    if (!plain(raw) || raw.version !== 1 || !QUANTIZE.includes(raw.quantize) || raw.selectedSceneId !== null && !identifier(raw.selectedSceneId)) fail('contains invalid settings.');
    if (!Array.isArray(raw.scenes) || raw.scenes.length > LIMITS.scenes || !Array.isArray(raw.macros) || raw.macros.length !== LIMITS.macros || !Array.isArray(raw.midiBindings) || raw.midiBindings.length > LIMITS.midiBindings) fail('exceeds its scene, macro, or MIDI capacity.');
    const index = targetIndex(state);
    const ids = new Set();
    for (const scene of raw.scenes) {
      if (!plain(scene) || !identifier(scene.id) || ids.has(scene.id) || typeof scene.name !== 'string' || scene.name.length > 60 || !finite(scene.lengthBeats) || scene.lengthBeats < 4 || scene.lengthBeats > LIMITS.beats || !Array.isArray(scene.slots) || scene.slots.length !== 8) fail('contains an invalid scene.');
      ids.add(scene.id);
      for (const slot of scene.slots) if (!plain(slot) || !['clip', 'silence', 'hold'].includes(slot.mode) || slot.mode === 'clip' && (typeof slot.clipId !== 'string' || !slot.clipId || slot.clipId.length > 100) || slot.mode !== 'clip' && slot.clipId !== undefined) fail('contains an invalid scene slot.');
    }
    for (let i = 0; i < LIMITS.macros; i++) {
      const macro = raw.macros[i];
      if (!plain(macro) || macro.id !== 'macro-' + (i + 1) || typeof macro.name !== 'string' || macro.name.length > 60 || !finite(macro.value) || macro.value < 0 || macro.value > 1 || !Array.isArray(macro.mappings) || macro.mappings.length > LIMITS.mappingsPerMacro) fail('contains an invalid macro.');
      for (const mapping of macro.mappings) {
        const d = referenceShape(mapping, state, ['min', 'max', 'baseline'], index);
        if (!['normal', 'inverse'].includes(mapping.polarity) || mapping.min > mapping.max || mapping.baseline < mapping.min || mapping.baseline > mapping.max || d && (mapping.min < d.min || mapping.max > d.max)) fail('contains a macro mapping outside its valid range.');
      }
    }
    const bindingIds = new Set();
    for (const binding of raw.midiBindings) {
      const target = binding?.target;
      // Missing scene references are harmless and removed by normalization.
      const action = midiTarget(target, raw.scenes) || typeof target === 'string' && target.startsWith('scene:') && identifier(target.slice(6));
      if (!plain(binding) || !identifier(binding.id) || bindingIds.has(binding.id) || typeof binding.inputId !== 'string' || !binding.inputId || binding.inputId.length > 200 || /[\u0000-\u001f\u007f]/.test(binding.inputId) || binding.channel !== null && (!Number.isInteger(binding.channel) || binding.channel < 0 || binding.channel > 15) || !['note', 'cc'].includes(binding.type) || !Number.isInteger(binding.number) || binding.number < 0 || binding.number > 127 || !action) fail('contains an invalid MIDI binding.');
      bindingIds.add(binding.id);
    }
    if (raw.take !== undefined) {
      const take = raw.take;
      if (!plain(take) || !finite(take.lengthBeats) || take.lengthBeats < 0 || take.lengthBeats > LIMITS.beats || !Array.isArray(take.events) || take.events.length > LIMITS.takeEvents) fail('contains an invalid performance take.');
      for (const e of take.events) {
        if (!plain(e) || !finite(e.beat) || e.beat < 0 || e.beat > take.lengthBeats) fail('contains an invalid recorded event time.');
        for (const key of ['sceneBeat', 'padBeat']) if (e[key] !== undefined && (!finite(e[key]) || e[key] < 0 || e[key] > LIMITS.beats)) fail('contains an invalid recorded phase.');
        if (e.tempo !== undefined && (!finite(e.tempo) || e.tempo < 40 || e.tempo > 240)) fail('contains an invalid recorded tempo.');
        for (const key of ['phaseOrigins', 'sceneStarts', 'padBeats']) if (e[key] !== undefined && (!Array.isArray(e[key]) || e[key].length !== 8 || e[key].some(v => !finite(v) || v < 0 || v > (key === 'phaseOrigins' ? LIMITS.beats : e.beat)))) fail('contains invalid recorded clip phases.');
        if (e.kind === 'scene') {
          if (e.sceneId !== null && !identifier(e.sceneId) || !Array.isArray(e.clips) || e.clips.length !== 8 || e.clips.some(id => id !== null && (typeof id !== 'string' || !id || id.length > 100))) fail('contains an invalid recorded scene.');
        } else if (e.kind === 'performance') {
          if (!Array.isArray(e.drops) || e.drops.length !== 8 || e.drops.some(v => typeof v !== 'boolean') || !STUTTER.includes(e.stutterBeats) || ![0, 1].includes(e.fill) || !Array.isArray(e.overrides) || e.overrides.length > LIMITS.overridesPerEvent) fail('contains an invalid recorded gesture.');
          const seen = new Set();
          for (const override of e.overrides) {
            const d = referenceShape(override, state, ['value'], index), key = override.trackId + ':' + override.target;
            if (seen.has(key) || d && (override.value < d.min || override.value > d.max)) fail('contains an invalid recorded parameter value.');
            seen.add(key);
          }
        } else fail('contains an unknown recorded event.');
      }
    }
    return true;
  }
  window.LoomServiceSchema = Object.freeze({ LIMITS, QUANTIZE, STUTTER, defaults, targets, normalize, validate, mappingValue });
})();
