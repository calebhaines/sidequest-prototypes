/* KITCHEN · two genuine GALLEY inserts per percussion voice. */
(function (scope) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const definitions = () => scope.LoomEffectsCatalog || [];
  const definition = type => definitions().find(effect => effect.id === type);
  const empty = () => [null, null];
  function normalizeSlots(raw, options = {}) {
    if (raw === undefined) return empty();
    if (!Array.isArray(raw) || raw.length !== 2 || Object.keys(raw).some(key => !['0', '1'].includes(key))) throw new Error('Each percussion voice needs exactly two GALLEY effect slots.');
    return Array.from({ length: 2 }, (_, slot) => {
      const value = raw[slot]; if (value === null) return null;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['type', 'params'].includes(key))) throw new Error('A voice effect slot is malformed.');
      const def = definition(value.type), source = value.params;
      if (!def || !source || typeof source !== 'object' || Array.isArray(source)) throw new Error('A voice contains an unknown GALLEY effect or invalid settings.');
      const params = {};
      if (options.strict && Object.keys(source).some(key => !Object.prototype.hasOwnProperty.call(def.defaults, key))) throw new Error(def.name + ' contains an unknown control.');
      for (const param of def.params) {
        const v = source[param.key];
        if (param.type === 'range') {
          if (options.strict && (typeof v !== 'number' || !Number.isFinite(v) || v < param.min || v > param.max)) throw new Error(def.name + ' has an invalid ' + param.label + '.');
          params[param.key] = clamp(finite(v, param.default), param.min, param.max);
        } else {
          if (options.strict && !param.options.some(option => option.value === v)) throw new Error(def.name + ' has an invalid ' + param.label + '.');
          params[param.key] = param.options.some(option => option.value === v) ? v : param.default;
        }
      }
      if (options.strict && typeof source.bypass !== 'boolean') throw new Error(def.name + ' has an invalid bypass setting.');
      params.bypass = source.bypass === true;
      return { type: def.id, params };
    });
  }
  function hasEffects(slots) { return Array.isArray(slots) && slots.some(slot => slot && slot.params?.bypass !== true && slot.params?.mix !== 0); }
  let mainEffects;
  function effectsDSP() {
    if (!scope.createLoomEffectsDSP) throw new Error('GALLEY voice effects have not loaded.');
    return mainEffects ||= scope.createLoomEffectsDSP(scope.createLoomVocalDSP, scope.createLoomUtilityDSP, scope.createLoomFilterDSP, scope.createLoomCreativeDSP, scope.createLoomBroilerPedalsDSP, scope.createLoomCompressorDSP, scope.createLoomPreampDSP);
  }
  // Self-contained and serialized into AudioWorklet. Every rack owns two DSP
  // instances, so overlapping hits share one voice's histories but never another's.
  function createVoiceEffectsCore(makeEffects, sampleRate, initialSlots) {
    'use strict';
    const effects = makeEffects(), sr = Math.max(8000, Math.min(192000, sampleRate || 48000)), ramp = Math.max(1, Math.round(sr * .006));
    const entries = Array.from({ length: 2 }, () => ({ spec: null, signature: '', dsp: null, last: [0, 0], offset: [0, 0], pending: false, remaining: 0 }));
    let initialized = false;
    function setSlots(slots) {
      const swapped = initialized && entries[0].signature === JSON.stringify(slots[1] || null) && entries[1].signature === JSON.stringify(slots[0] || null) && entries[0].signature !== entries[1].signature;
      for (let index = 0; index < 2; index++) {
        const entry = entries[index], spec = slots[index] || null, signature = JSON.stringify(spec);
        if (entry.signature === signature) continue;
        const prior = entry.spec;
        if (prior?.type === spec?.type && spec) {
          if (swapped || !!prior.params.bypass !== !!spec.params.bypass) entry.dsp.reset();
          entry.dsp.setParams(spec.params);
        } else {
          entry.dsp?.reset(); entry.dsp = spec ? effects.create(spec.type, sr, spec.params) : null;
        }
        entry.spec = spec ? JSON.parse(JSON.stringify(spec)) : null; entry.signature = signature;
        entry.pending = initialized; entry.remaining = 0;
      }
      initialized = true;
    }
    setSlots(initialSlots || [null, null]);
    return {
      setSlots,
      process(left, right, clock) {
        if (!left || !right || left.length !== right.length) throw new Error('Voice effects need equal stereo blocks.');
        for (const entry of entries) {
          if (!entry.spec && !entry.pending && !entry.remaining) { if (left.length) { entry.last[0] = left[left.length - 1]; entry.last[1] = right[right.length - 1]; } continue; }
          if (entry.dsp && !entry.spec.params.bypass) entry.dsp.process(left, right, clock || null);
          if (entry.pending && left.length) {
            entry.offset[0] = entry.last[0] - left[0]; entry.offset[1] = entry.last[1] - right[0]; entry.remaining = ramp; entry.pending = false;
          }
          for (let i = 0; i < left.length && entry.remaining > 0; i++, entry.remaining--) {
            const amount = entry.remaining / ramp;
            left[i] += entry.offset[0] * amount; right[i] += entry.offset[1] * amount;
          }
          if (left.length) { entry.last[0] = left[left.length - 1]; entry.last[1] = right[right.length - 1]; }
        }
      },
      reset() { for (const entry of entries) { entry.dsp?.reset(); entry.last[0] = entry.last[1] = entry.offset[0] = entry.offset[1] = 0; entry.pending = false; entry.remaining = 0; } },
      getMeters() { return entries.map(entry => entry.spec ? { type: entry.spec.type, bypass: entry.spec.params.bypass, ...(entry.dsp.getMeters?.() || {}) } : null); },
      getTailTime(clock) { return Math.min(20, entries.reduce((sum, entry) => sum + (!entry.spec || entry.spec.params.bypass || entry.spec.params.mix === 0 ? 0 : Math.max(0, entry.dsp.getTailTime?.(clock) || 0)), 0)); }
    };
  }
  function createProcessor(sampleRate, slots = empty(), clock = {}) {
    const core = createVoiceEffectsCore(() => effectsDSP(), sampleRate, normalizeSlots(slots));
    let position = finite(clock.beat, 0), tempo = clamp(finite(clock.tempo, 120), 30, 300), playing = clock.playing !== false;
    return {
      setSlots(next) { core.setSlots(normalizeSlots(next)); },
      process(left, right, next = {}) {
        tempo = clamp(finite(next.tempo, tempo), 30, 300); playing = typeof next.playing === 'boolean' ? next.playing : playing;
        position = finite(next.beat, position); core.process(left, right, { tempo, beat: position, playing }); if (playing) position += left.length / sampleRate * tempo / 60;
      },
      reset() { core.reset(); }, getMeters: () => core.getMeters(), getTailTime: value => core.getTailTime({ tempo: finite(value, tempo), beat: position, playing })
    };
  }
  function tailTime(slots, tempo = 120) { if (!hasEffects(slots)) return 0; return createProcessor(48000, slots, { tempo }).getTailTime(tempo); }
  function processBuffer(slots, audio, options = {}) {
    const rate = finite(audio.sampleRate, 48000), size = audio.left.length, extra = Math.max(0, Math.ceil(finite(options.tailSeconds, 0) * rate));
    const left = new Float32Array(size + extra), right = new Float32Array(size + extra); left.set(audio.left); right.set(audio.right || audio.left);
    const processor = createProcessor(rate, slots, options);
    for (let at = 0; at < left.length; at += 128) processor.process(left.subarray(at, at + 128), right.subarray(at, at + 128));
    return { left, right, sampleRate: rate, duration: left.length / rate };
  }
  const contexts = new WeakMap();
  let bankOrdinal = 0;
  const offline = context => typeof context?.startRendering === 'function';
  function workletSource() {
    const names = ['createLoomVocalDSP', 'createLoomUtilityDSP', 'createLoomFilterDSP', 'createLoomCreativeDSP', 'createLoomBroilerPedalsDSP', 'createLoomCompressorDSP', 'createLoomPreampDSP'];
    if (!scope.createLoomEffectsDSP || names.some(name => typeof scope[name] !== 'function')) throw new Error('The complete GALLEY effect library has not loaded.');
    return names.map(name => `const ${name}=${scope[name].toString()};`).join('\n') + `\nconst createEffects=${scope.createLoomEffectsDSP.toString()};\nconst createCore=${createVoiceEffectsCore.toString()};\nconst makeEffects=()=>createEffects(${names.join(',')});\n` + `
      class KitchenVoiceEffectsProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();const p=options.processorOptions||{};this.core=createCore(makeEffects,sampleRate,p.slots);this.clock=p.clock||{tempo:120,beat:0,time:0,playing:false};this.pending=[];this.clocks=[];this.count=0;this.offlineId=p.offlineId||null;this.offlineConfigured=false;
          this.port.onmessage=event=>{const m=event.data;if(this.offlineId)return;if(m.type==='slots')this.core.setSlots(m.slots);else if(m.type==='clock'){const frame=Math.round(m.clock.time*sampleRate);if(m.replaceFuture||!m.clock.playing)this.clocks=this.clocks.filter(item=>item.frame<frame);if(frame<=currentFrame)this.clock=m.clock;else{this.clocks=this.clocks.filter(item=>item.frame!==frame);this.clocks.push({frame,clock:m.clock});this.clocks.sort((a,b)=>a.frame-b.frame);}}else if(m.type==='reset'){this.pending=[];if(m.frame<=currentFrame)this.core.reset();else this.pending=[m.frame];}};
        }
        process(inputs,outputs) {
          if(this.offlineId&&!this.offlineConfigured){const all=globalThis.__kitchenVoiceFxOfflineConfigs,config=all?.racks?.[this.offlineId],bank=config&&all.banks[config.bank];if(config&&bank){this.core=createCore(makeEffects,sampleRate,config.slots);this.clock=bank.clock;this.clocks=bank.clocks.map(clock=>({frame:Math.round(clock.time*sampleRate),clock}));this.pending=config.resetFrames.slice();this.offlineConfigured=true;}}
          const output=outputs[0],left=output[0],right=output[1]||left,input=inputs[0];if(!left)return true;if(input[0])left.set(input[0]);else left.fill(0);if(right!==left){if(input[1]||input[0])right.set(input[1]||input[0]);else right.fill(0);}
          let at=0;while(at<left.length){while(this.pending[0]<=currentFrame+at){this.core.reset();this.pending.shift();}while(this.clocks[0]?.frame<=currentFrame+at)this.clock=this.clocks.shift().clock;const end=Math.min(left.length,this.pending.length?Math.max(at,this.pending[0]-currentFrame):left.length,this.clocks.length?Math.max(at,this.clocks[0].frame-currentFrame):left.length);if(end<=at)continue;const c=this.clock,beat=c.beat+(c.playing?(currentFrame+at)/sampleRate-c.time:0)*c.tempo/60;this.core.process(left.subarray(at,end),right.subarray(at,end),{tempo:c.tempo,beat,playing:c.playing});at=end;}
          if(++this.count>=16){this.count=0;this.port.postMessage({type:'meters',value:this.core.getMeters()});}return true;
        }
      }
      registerProcessor('kitchen-voice-effects-v1',KitchenVoiceEffectsProcessor);`;
  }
  async function prepare(context) {
    if (!context || typeof context.createGain !== 'function') throw new Error('Voice effects need an audio context.');
    let record = contexts.get(context); if (record) return record.promise;
    record = { mode: 'pending', promise: null, banks: new Map(), racks: new Map(), finalSignature: '', finalizing: null, startCalled: false, nativeStarted: false }; contexts.set(context, record);
    record.promise = (async () => {
      if (context.audioWorklet && typeof scope.AudioWorkletNode === 'function') {
        let url;
        try { url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' })); await context.audioWorklet.addModule(url); record.mode = 'worklet'; }
        catch (error) { record.error = error?.message || String(error); record.mode = !offline(context) && typeof context.createScriptProcessor === 'function' ? 'script' : 'unavailable'; }
        finally { if (url) URL.revokeObjectURL(url); }
      } else record.mode = !offline(context) && typeof context.createScriptProcessor === 'function' ? 'script' : 'unavailable';
      if (offline(context) && !record.originalStart) {
        record.originalStart = context.startRendering;
        context.startRendering = function (...args) {
          if (this !== context || context.state === 'closed') return record.originalStart.apply(this, args);
          if (record.startCalled) return Promise.reject(new DOMException('Offline rendering has already started.', 'InvalidStateError'));
          record.startCalled = true;
          if (!record.racks.size || record.mode !== 'worklet') { record.nativeStarted = true; return record.originalStart.apply(context, args); }
          return finalizeOffline(context).then(() => { record.nativeStarted = true; return record.originalStart.apply(context, args); }, error => { record.startCalled = false; throw error; });
        };
      }
      return { mode: record.mode, latencyFrames: record.mode === 'script' ? 256 : 0, error: record.error || null };
    })();
    return record.promise;
  }
  async function finalizeOffline(context) {
    const record = contexts.get(context);
    if (!record || !offline(context) || record.mode !== 'worklet' || !record.racks.size || record.nativeStarted || context.state === 'closed') return;
    if (record.finalizing) { await record.finalizing; return finalizeOffline(context); }
    const data = { banks: Object.fromEntries(Array.from(record.banks, ([id, snapshot]) => [id, snapshot()])), racks: Object.fromEntries(Array.from(record.racks, ([id, snapshot]) => [id, snapshot()])) };
    const signature = JSON.stringify(data); if (signature === record.finalSignature) return;
    record.finalizing = (async () => {
      const url = URL.createObjectURL(new Blob(['globalThis.__kitchenVoiceFxOfflineConfigs=' + signature.replace(/</g, '\\u003c') + ';'], { type: 'application/javascript' }));
      try { await context.audioWorklet.addModule(url); record.finalSignature = signature; }
      finally { URL.revokeObjectURL(url); record.finalizing = null; }
    })();
    await record.finalizing;
  }
  function createBank(context, destinations, options = {}) {
    const bankId = 'voice-bank-' + ++bankOrdinal;
    const count = Math.max(1, Math.min(64, Math.round(finite(options.voiceCount, Array.isArray(destinations) ? destinations.length : 8))));
    const destination = index => Array.isArray(destinations) ? destinations[index] : destinations;
    if (Array.from({ length: count }, (_, i) => destination(i)).some(node => !node || typeof node.connect !== 'function')) throw new Error('Every voice effects bank needs a valid destination.');
    const slots = Array.from({ length: count }, empty), racks = Array(count).fill(null), audible = Array(count).fill(true), routes = Array.from({ length: count }, () => new Set());
    let clock = { tempo: clamp(finite(options.tempo, 120), 30, 300), beat: 0, time: 0, playing: false }, latestClock = clock, disposed = false;
    const clockEvents = [];
    function clockAt(time) { let value = clock; for (const event of clockEvents) { if (event.time > time + 1e-9) break; value = event; } return value; }
    const check = index => { if (disposed) throw new Error('This voice effects bank has been disposed.'); if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('Choose a valid percussion voice.'); };
    function makeRack(index) {
      const prepared = contexts.get(context), mode = prepared?.mode;
      if (!mode || mode === 'pending') throw new Error('Prepare GALLEY voice effects before starting audio.');
      if (mode === 'unavailable') throw new Error('This browser cannot render GALLEY voice effects offline. Use a current browser with Offline AudioWorklet support, or clear the two voice effect slots.');
      const gate = context.createGain(); gate.gain.value = audible[index] ? 1 : 0; gate.connect(destination(index));
      const rack = { node: null, gate, mode, meters: [null, null], core: null, resetFrames: [], offlineId: offline(context) ? bankId + '-' + index : null };
      if (mode === 'worklet') {
        rack.node = new scope.AudioWorkletNode(context, 'kitchen-voice-effects-v1', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { slots: slots[index], clock: clockAt(context.currentTime || 0), offlineId: rack.offlineId } });
        rack.node.port.onmessage = event => { if (event.data?.type === 'meters') rack.meters = event.data.value; };
        for (const value of clockEvents) if (value.time > (context.currentTime || 0)) rack.node.port.postMessage({ type: 'clock', clock: value });
      } else {
        rack.core = createProcessor(context.sampleRate, slots[index], clock); rack.node = context.createScriptProcessor(256, 2, 2); rack.node.channelCount = 2; rack.node.channelCountMode = 'explicit';
        rack.node.onaudioprocess = event => {
          const left = event.outputBuffer.getChannelData(0), right = event.outputBuffer.getChannelData(1); left.set(event.inputBuffer.getChannelData(0)); right.set(event.inputBuffer.getChannelData(Math.min(1, event.inputBuffer.numberOfChannels - 1)));
          const start = Math.round((event.playbackTime || context.currentTime) * context.sampleRate); let at = 0;
          while (at < left.length) { while (rack.resetFrames[0] <= start + at) { rack.core.reset(); rack.resetFrames.shift(); } const nextClock = clockEvents.find(event => Math.round(event.time * context.sampleRate) > start + at), end = Math.min(left.length, rack.resetFrames.length ? Math.max(at, rack.resetFrames[0] - start) : left.length, nextClock ? Math.round(nextClock.time * context.sampleRate) - start : left.length); if (end <= at) continue; const time = (start + at) / context.sampleRate, active = clockAt(time); rack.core.process(left.subarray(at, end), right.subarray(at, end), { tempo: active.tempo, beat: active.beat + (active.playing ? time - active.time : 0) * active.tempo / 60, playing: active.playing }); at = end; }
          rack.meters = rack.core.getMeters();
        };
      }
      if (rack.offlineId) { prepared.banks.set(bankId, () => ({ clock: clockAt(0), clocks: clockEvents.filter(value => value.time > 0) })); prepared.racks.set(rack.offlineId, () => ({ bank: bankId, slots: slots[index], resetFrames: rack.resetFrames.slice() })); }
      rack.node.connect(gate); racks[index] = rack; if (routes[index].size) gate.gain.value = 0; return rack;
    }
    function moveGain(param, value) {
      const now = context.currentTime || 0;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
      else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
      param.linearRampToValueAtTime(value, now + .006);
    }
    function reroute(index) {
      const rack = racks[index], active = hasEffects(slots[index]); if (!rack) return;
      for (const route of routes[index]) {
        if (route.direct) {
          route.node.disconnect(destination(index)); route.direct = false;
          route.dry = context.createGain(); route.dry.gain.value = 1; route.dry.connect(destination(index)); route.node.connect(route.dry); route.node.connect(rack.node);
        }
        if (route.dry) moveGain(route.dry.gain, 0);
      }
      moveGain(rack.gate.gain, audible[index] ? 1 : 0);
    }
    return {
      setVoice(index, value) { check(index); const next = normalizeSlots(value), prior = hasEffects(slots[index]); slots[index] = next; const rack = racks[index] || (hasEffects(next) ? makeRack(index) : null); if (rack) { if (rack.mode === 'worklet') rack.node.port.postMessage({ type: 'slots', slots: next }); else rack.core.setSlots(next); if (prior !== hasEffects(next)) reroute(index); } },
      input(index) { check(index); return racks[index]?.node || (hasEffects(slots[index]) ? makeRack(index).node : destination(index)); },
      connectSource(index, node) {
        check(index); if (!node || typeof node.connect !== 'function') throw new Error('Choose a source node for this voice.');
        const active = hasEffects(slots[index]), rack = racks[index] || (active ? makeRack(index) : null), target = rack?.node || destination(index), route = { node, direct: !rack, dry: null };
        node.connect(target); routes[index].add(route); let detached = false;
        const detach = () => { if (detached) return; detached = true; routes[index].delete(route); try { node.disconnect(route.direct ? destination(index) : racks[index]?.node); } catch (_) {} if (route.dry) { try { node.disconnect(route.dry); } catch (_) {} try { route.dry.disconnect(); } catch (_) {} route.dry = null; } };
        route.detach = detach; detach.disconnect = detach; detach.dispose = detach; return detach;
      },
      setClock(next = {}) {
        if (disposed) return;
        const now = context.currentTime || 0, nextTempo = clamp(finite(next.tempo, latestClock.tempo), 30, 300), nextPlaying = typeof next.playing === 'boolean' ? next.playing : latestClock.playing;
        if (!Number.isFinite(next.beat) && !Number.isFinite(next.time) && nextTempo === latestClock.tempo && nextPlaying === latestClock.playing) return;
        const time = Math.round(finite(next.time, now) * context.sampleRate) / context.sampleRate, previous = clockAt(time);
        const value = { tempo: nextTempo, beat: finite(next.beat, previous.beat + (previous.playing ? time - previous.time : 0) * previous.tempo / 60), time, playing: nextPlaying };
        latestClock = value;
        const replaceFuture = !value.playing || time <= now + 1e-9;
        if (replaceFuture) for (let i = clockEvents.length - 1; i >= 0; i--) if (clockEvents[i].time > time) clockEvents.splice(i, 1);
        const old = clockEvents.findIndex(item => item.time === time); if (old >= 0) clockEvents.splice(old, 1); clockEvents.push(value); clockEvents.sort((a, b) => a.time - b.time);
        while (clockEvents[0]?.time < now - 2) clock = clockEvents.shift();
        for (const rack of racks) if (rack?.mode === 'worklet') rack.node.port.postMessage({ type: 'clock', clock: value, replaceFuture });
      },
      setAudible(index, value) { check(index); audible[index] = value !== false; const rack = racks[index]; if (rack) { moveGain(rack.gate.gain, audible[index] ? 1 : 0); for (const route of routes[index]) if (route.dry) moveGain(route.dry.gain, 0); } },
      reset(index, when = context.currentTime || 0) { const list = index === undefined ? racks.map((_, i) => i) : [index]; for (const i of list) { check(i); const rack = racks[i]; if (!rack) continue; const frame = Math.round(Math.max(0, finite(when, context.currentTime || 0)) * context.sampleRate); if (rack.mode === 'worklet') { rack.resetFrames.length = 0; rack.resetFrames.push(frame); rack.node.port.postMessage({ type: 'reset', frame }); } else { rack.resetFrames.length = 0; if (frame <= Math.round(context.currentTime * context.sampleRate)) rack.core.reset(); else rack.resetFrames.push(frame); } } },
      finalizeOffline: () => finalizeOffline(context),
      getMeters(index) { return index === undefined ? racks.map(rack => clone(rack?.meters || [null, null])) : clone(racks[index]?.meters || [null, null]); },
      get mode() { return contexts.get(context)?.mode || 'pending'; }, get latencySeconds() { return racks.some(rack => rack?.mode === 'script') ? 256 / context.sampleRate : 0; },
      dispose() { if (disposed) return; const record = contexts.get(context); record?.banks.delete(bankId); for (const rack of racks) if (rack?.offlineId) record?.racks.delete(rack.offlineId); for (const row of routes) for (const route of Array.from(row)) route.detach(); disposed = true; for (const rack of racks) if (rack) { rack.node.onaudioprocess = null; if (rack.node.port) { rack.node.port.onmessage = null; rack.node.port.close(); } rack.node.disconnect(); rack.gate.disconnect(); rack.core?.reset(); } }
    };
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let gestureOrdinal = 0;
  function mount(element, options) {
    if (!element) throw new Error('Choose a container for voice effects.');
    element.classList.add('voice-fx-rack');
    element.innerHTML = '<div class="voice-fx-heading"><span>VOICE EFFECTS</span><small>GALLEY / TWO INSERTS</small></div><div class="voice-fx-slots">' + [0, 1].map(slot => `<button type="button" data-voice-fx-slot="${slot}"></button>`).join('') + '</div>';
    const dialog = document.createElement('dialog'); dialog.className = 'voice-fx-dialog'; document.body.append(dialog);
    let selected = 0, sessionKey = null, activeGesture = null, destroyed = false, meterTimer = null, committing = false, dialogSignature = '';
    const key = () => String(options.getKey?.() ?? options.getLabel?.() ?? 'Selected voice');
    const get = () => normalizeSlots(options.getSlots?.());
    function render() {
      if (destroyed) return;
      if (dialog.open && sessionKey !== key()) close();
      const slots = get();
      if (dialog.open && !committing && dialogSignature !== JSON.stringify(slots[selected])) close();
      element.querySelectorAll('[data-voice-fx-slot]').forEach((button, index) => { const spec = slots[index], def = spec && definition(spec.type); button.innerHTML = `<span>${index + 1}</span><strong>${escape(def?.name || 'Add effect')}</strong><small>${spec?.params.bypass ? 'BYPASSED' : def ? 'Edit' : '+'}</small>`; button.style.setProperty('--voice-fx-color', def?.color || '#b8be9c'); button.setAttribute('aria-label', (options.getLabel?.() || 'Selected voice') + ', effect slot ' + (index + 1) + (def ? ', ' + def.name : ', empty')); });
    }
    function close() { if (dialog.open) dialog.close(); sessionKey = null; activeGesture = null; clearInterval(meterTimer); meterTimer = null; }
    function commit(next, metadata = {}) {
      if (destroyed || !dialog.open || sessionKey !== key()) { close(); return; }
      committing = true;
      try { options.onChange?.(normalizeSlots(next, { strict: true }), { gesture: metadata.gesture || 'voice-fx-' + ++gestureOrdinal, phase: metadata.phase || 'change' }); }
      finally { committing = false; dialogSignature = JSON.stringify(get()[selected]); }
      render();
    }
    function controls(def, slots) {
      const params = slots[selected].params, seen = new Set();
      const groups = (def.groups || []).map(group => ({ ...group, keys: (group.keys || []).filter(k => def.params.some(p => p.key === k)) })).filter(group => group.keys.length);
      groups.forEach(group => group.keys.forEach(key => seen.add(key)));
      const rest = def.params.filter(param => !seen.has(param.key)).map(param => param.key);
      if (rest.length) groups.push({ label: groups.length ? 'More controls' : 'Sound controls', keys: rest, section: groups.length ? 'advanced' : 'main' });
      return groups.map((group, index) => `<details class="voice-fx-group" ${index === 0 ? 'open' : ''}><summary>${escape(group.label)}</summary>${group.help || group.description ? `<p>${escape(group.help || group.description)}</p>` : ''}<div class="voice-fx-controls">${group.keys.map(key => {
        const p = def.params.find(param => param.key === key), value = params[key];
        return `<label class="voice-fx-control"><span>${escape(p.label)}${p.type === 'range' ? `<output data-voice-fx-output="${key}">${escape(value)} ${escape(p.unit || '')}</output>` : ''}</span>${p.type === 'select' ? `<select data-voice-fx-param="${key}">${p.options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select>` : `<div><input type="range" data-voice-fx-param="${key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}"><input type="number" data-voice-fx-number="${key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}" aria-label="${escape(p.label)} exact value"></div>`}</label>`;
      }).join('')}</div></details>`).join('');
    }
    function renderDialog() {
      if (!dialog.open || sessionKey !== key()) return;
      const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
      const focusAttributes = ['data-voice-fx-action','data-voice-fx-type','data-voice-fx-preset','data-voice-fx-param','data-voice-fx-number'];
      const focusAttribute = focusAttributes.find(name => focused?.hasAttribute?.(name)), focusValue = focusAttribute ? focused.getAttribute(focusAttribute) : null;
      const slots = get(), spec = slots[selected], def = spec && definition(spec.type);
      dialog.innerHTML = `<div class="voice-fx-dialog-top"><div><span>SLOT ${selected + 1} / GALLEY INSERT</span><h2>${escape(options.getLabel?.() || 'Selected voice')}</h2></div><button type="button" data-voice-fx-action="close" aria-label="Close voice effects">×</button></div><div class="voice-fx-route">Voice → Slot 1 → Slot 2 → Instrument master</div><div class="voice-fx-picker"><label>Effect slot ${selected + 1}<select data-voice-fx-type><option value="">Empty slot</option>${definitions().map(effect => `<option value="${effect.id}" ${spec?.type === effect.id ? 'selected' : ''}>${escape(effect.name)} · ${escape(effect.subtitle)}</option>`).join('')}</select></label><button type="button" data-voice-fx-action="swap" ${slots.every(item => !item) ? 'disabled' : ''}>Swap 1 / 2</button></div>${def ? `<p class="voice-fx-description">${escape(def.description)}</p><div class="voice-fx-actions"><button type="button" data-voice-fx-action="bypass" aria-pressed="${spec.params.bypass}">${spec.params.bypass ? 'Enable effect' : 'Bypass'}</button><button type="button" data-voice-fx-action="reset">Reset</button><button type="button" data-voice-fx-action="remove">Remove</button></div>${def.presets?.length ? `<label class="voice-fx-recipe">Complete recipe<select data-voice-fx-preset><option value="">Custom settings</option>${def.presets.map(recipe => `<option value="${escape(recipe.id)}" ${Object.keys(recipe.params).every(key => recipe.params[key] === spec.params[key]) ? 'selected' : ''}>${escape(recipe.name)}</option>`).join('')}</select></label>` : ''}<p class="voice-fx-model-note" data-voice-fx-model-note></p><div class="voice-fx-meter" aria-live="off" data-voice-fx-meter>Play this voice to hear its effects.</div>${controls(def, slots)}` : '<p class="voice-fx-empty">Choose any GALLEY effect. Each voice keeps its own two-slot chain and settings.</p>'}`;
      dialogSignature = JSON.stringify(spec); updateModelNote();
      const focusTarget = focusAttribute ? Array.from(dialog.querySelectorAll('[' + focusAttribute + ']')).find(node => node.getAttribute(focusAttribute) === focusValue && !node.disabled) : null;
      (focusTarget || dialog.querySelector('[data-voice-fx-type]'))?.focus({ preventScroll: true });
    }
    function syncRecipe() {
      const select = dialog.querySelector('[data-voice-fx-preset]'), spec = get()[selected], def = spec && definition(spec.type);
      if (!select || !def) return;
      const recipe = def.presets?.find(item => Object.keys(item.params).every(key => item.params[key] === spec.params[key]));
      select.value = recipe?.id || '';
    }
    function updateModelNote() {
      const slots = get(), spec = slots[selected], def = spec && definition(spec.type), note = dialog.querySelector('[data-voice-fx-model-note]');
      syncRecipe(); if (!note) return; const models = def.models || def.ampModels || [], model = models.find(model => model.id === spec.params.model);
      note.textContent = model ? [model.inspiration, model.description].filter(Boolean).join(' · ') : '';
      for (const input of dialog.querySelectorAll('[data-voice-fx-param],[data-voice-fx-number]')) { const key = input.dataset.voiceFxParam || input.dataset.voiceFxNumber; const p = spec.params;
        input.disabled = spec.type === 'saute' && (p.model === 'clean' && ['colour', 'impedance', 'transformer', 'headroom', 'bias', 'feedback', 'slew'].includes(key) || model?.inactiveControls?.includes(key)) || spec.type === 'velvet' && (p.model === 'clean' && ['colour', 'timing', 'fetMode', 'thrust'].includes(key) || p.model !== 'clean' && p.timing === 'classic' && ['attack', 'release'].includes(key) || key === 'fetMode' && p.model !== 'fet-76' || key === 'thrust' && p.model !== 'bus-2500') || spec.type === 'parallax' && (key === 'time' && p.clock === 'sync' || key === 'division' && p.clock === 'free') || ['strainer', 'swirl'].includes(spec.type) && (['rate', 'lfoRate'].includes(key) && (p.clock || p.lfoClock) === 'sync' || ['division', 'lfoDivision'].includes(key) && (p.clock || p.lfoClock) === 'free'); }
    }
    element.addEventListener('click', event => {
      const button = event.target.closest('[data-voice-fx-slot]'); if (!button) return; event.preventDefault(); event.stopPropagation(); selected = Number(button.dataset.voiceFxSlot); sessionKey = key(); dialog.showModal(); renderDialog();
      meterTimer = setInterval(() => { const meter = options.getMeters?.()?.[selected], target = dialog.querySelector('[data-voice-fx-meter]'); if (!target || !meter) return; if (meter.bypass) { target.textContent = 'Bypassed · original voice audio.'; return; } if (meter.type === 'scales') {
          const hz = meter.detectedHz, p = get()[selected]?.params || {}, ready = Number.isFinite(hz) && hz > 0 && meter.confidence >= .5;
          if (ready) { const pitch = 69 + 12 * Math.log2(hz / (meter.reference || 440)), guide = definition('scales')?.tunings?.[p.tuning] || []; let note = p.target === 'manual' ? p.targetNote : Math.round(pitch); if (p.target !== 'manual' && guide.length) note = guide.reduce((best, item) => Math.abs(item - pitch) < Math.abs(best - pitch) ? item : best, guide[0]); const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']; target.textContent = names[((note % 12) + 12) % 12] + (Math.floor(note / 12) - 1) + ' · ' + hz.toFixed(2) + ' Hz · ' + ((pitch - note) * 100).toFixed(1) + ' cents · Output ' + finite(meter.outputDb, -120).toFixed(1) + ' dB'; }
          else target.textContent = 'Tuner: play one clear, sustained pitch. Output ' + finite(meter.outputDb, -120).toFixed(1) + ' dB';
          return;
        }
        const preferred = ['inputDb',...(['velvet','glaze'].includes(meter.type)?['reductionDb']:[]),'stageDb','outputDb','cutoffLHz','cutoffRHz','envelopeDb','correlation'], values = preferred.filter(k => typeof meter[k] === 'number' && Number.isFinite(meter[k])).slice(0, 4).map(k => [k,meter[k]]); if (values.length) target.textContent = values.map(([k, value]) => k.replace(/Db$/, '').replace(/([A-Z])/g, ' $1') + ' ' + value.toFixed(1) + (/Db$/.test(k) ? ' dB' : '')).join(' · '); }, 100);
    });
    dialog.addEventListener('close', () => { sessionKey = null; activeGesture = null; clearInterval(meterTimer); meterTimer = null; render(); });
    dialog.addEventListener('cancel', () => { activeGesture = null; });
    dialog.addEventListener('keydown', event => { event.stopPropagation(); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && (event.shiftKey ? options.onRedo : options.onUndo)) { event.preventDefault(); activeGesture = null; committing = true; try { (event.shiftKey ? options.onRedo : options.onUndo)(); } finally { committing = false; dialogSignature = JSON.stringify(get()[selected]); } if (dialog.open) { render(); renderDialog(); } return; } if (event.target.matches('input[type=range]') && !activeGesture) activeGesture = { token: 'voice-fx-' + ++gestureOrdinal, started: false, key: event.target.dataset.voiceFxParam }; });
    dialog.addEventListener('pointerdown', event => { if (event.target.matches('input[type=range]')) activeGesture = { token: 'voice-fx-' + ++gestureOrdinal, started: false, key: event.target.dataset.voiceFxParam }; });
    const end = () => { if (!activeGesture) return; const gesture = activeGesture; activeGesture = null; if (gesture.started && dialog.open) commit(get(), { gesture: gesture.token, phase: 'end' }); };
    for (const name of ['pointerup', 'pointercancel', 'keyup', 'focusout']) dialog.addEventListener(name, end);
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-voice-fx-action]'); if (!button) return; event.preventDefault(); event.stopPropagation(); const action = button.dataset.voiceFxAction; if (action === 'close') { close(); return; }
      const slots = get(); if (action === 'swap') { slots.reverse(); selected = 1 - selected; } else if (slots[selected]) { if (action === 'bypass') slots[selected].params.bypass = !slots[selected].params.bypass; else if (action === 'reset') slots[selected].params = clone(definition(slots[selected].type).defaults); else if (action === 'remove') slots[selected] = null; }
      commit(slots); renderDialog();
    });
    dialog.addEventListener('input', event => {
      const input = event.target, key = input.dataset.voiceFxParam; if (!key || input.type !== 'range') return;
      const slots = get(); if (!slots[selected]) return; const value = Number(input.value); if (value === slots[selected].params[key]) return;
      if (!activeGesture || activeGesture.key !== key) activeGesture = { token: 'voice-fx-' + ++gestureOrdinal, started: false, key };
      const gesture = activeGesture; slots[selected].params[key] = value; commit(slots, { gesture: gesture.token, phase: gesture.started ? 'change' : 'start' }); if (activeGesture === gesture) gesture.started = true;
      const number = dialog.querySelector('[data-voice-fx-number="' + key + '"]'), output = dialog.querySelector('[data-voice-fx-output="' + key + '"]'), param = definition(slots[selected].type).params.find(p => p.key === key); if (number && document.activeElement !== number) number.value = value; if (output) output.textContent = value + ' ' + (param.unit || ''); syncRecipe();
    });
    dialog.addEventListener('change', event => {
      const input = event.target, slots = get();
      if (input.hasAttribute('data-voice-fx-type')) { slots[selected] = input.value ? { type: input.value, params: clone(definition(input.value).defaults) } : null; commit(slots); renderDialog(); return; }
      if (input.hasAttribute('data-voice-fx-preset')) { const def = slots[selected] && definition(slots[selected].type), preset = def?.presets?.find(p => p.id === input.value); if (preset) { slots[selected].params = clone(preset.params); commit(slots); renderDialog(); } return; }
      const key = input.dataset.voiceFxNumber || input.dataset.voiceFxParam; if (!key || input.type === 'range' || !slots[selected]) return;
      const def = definition(slots[selected].type), p = def.params.find(p => p.key === key), value = p.type === 'range' ? Number(input.value) : input.value;
      if (p.type === 'range' && (!Number.isFinite(value) || value < p.min || value > p.max)) { input.value = slots[selected].params[key]; return; }
      if (value === slots[selected].params[key]) return; slots[selected].params[key] = value; commit(slots);
      const range = dialog.querySelector('[data-voice-fx-param="' + key + '"]'), output = dialog.querySelector('[data-voice-fx-output="' + key + '"]'); if (range && range !== input) range.value = value; if (output) output.textContent = value + ' ' + (p.unit || ''); updateModelNote();
    });
    render(); return { render, close, destroy() { close(); destroyed = true; dialog.remove(); element.innerHTML = ''; } };
  }
  scope.KitchenVoiceEffects = Object.freeze({ get catalog() { return definitions(); }, defaults: type => clone(definition(type)?.defaults || {}), normalizeSlots, hasEffects, tailTime, prepare, finalizeOffline, createBank, createProcessor, processBuffer, mount, createCore: createVoiceEffectsCore });
})(typeof window === 'undefined' ? globalThis : window);
