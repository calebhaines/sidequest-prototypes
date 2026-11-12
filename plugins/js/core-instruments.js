/* Native, pull-driven adapters for Kitchen's original portable DSP cores.
 * No AudioContext, browser timer, or replacement oscillator renders this audio.
 * create/reset and real sample/model changes prepare outside the audio callback.
 */
(function (g) {
  'use strict';
  const INFO = {
    mire: ['REDUCE', 'MireSchema'], spool: ['ROTISSERIE', 'SpoolSchema'],
    haze: ['STEAM', 'HazeSchema'], bower: ['SKEWER', 'BowerSchema'],
    ravel: ['DICER', 'RavelSchema'], roux: ['ROUX', 'RouxSchema'],
    proof: ['LEAVEN', 'ProofSchema'], marinade: ['MARINADE', 'MarinadeSchema'],
    heirloom: ['HEIRLOOM', 'HeirloomSchema'], brine: ['BRINE', 'BrineSchema'], citrus: ['CITRUS', 'CitrusSchema']
  };
  const ids = Object.freeze(Object.keys(INFO));
  const copy = x => JSON.parse(JSON.stringify(x));
  const bounded = (x, a, b, fallback) => Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : fallback;
  const mod = (x, n) => ((x % n) + n) % n;
  const SOURCE = 'kitchen-plugin-pattern';
  const HOLD = 600;
  const parameterCache = new Map();
  // A prepared throwaway instance can train JSC's inline caches for the live
  // instance only when both use the same original classes/prototypes. These
  // factories contain immutable tables; all voices/filter/delay state belongs
  // to each Core. Keep the classes per JS context, never a running engine.
  const playbackCache = new Map();
  function capturedFactory(factory, bindings={}) {
    const source=typeof factory==='function'?factory.toString():factory;
    // Capture the same original intrinsic functions once: repeated global
    // Math/Number resolution can dominate small DSP helpers in an embedded VM.
    const names=[...new Set([...source.matchAll(/\bMath\.(\w+)\(/g)].map(match=>match[1]))],entries=Object.entries(bindings);
    const optimized=source.replace(/\bMath\.(\w+)\(/g,(_,name)=>'__kitchenMath_'+name+'(').replace(/\bNumber\.isFinite\(/g,'__kitchenFinite(');
    return new Function(...entries.map(([name])=>name),...names.map(name=>'__kitchenMath_'+name),'__kitchenFinite','return ('+optimized+');')(...entries.map(([,value])=>value),...names.map(name=>Math[name]),Number.isFinite);
  }
  function playbackDSP(id) {
    if (!playbackCache.has(id)) {
      const title = id[0].toUpperCase() + id.slice(1);
      let synth=g['create' + title + 'DSP'];
      if(id==='heirloom') {
        let source=synth.toString();
        const scope='const wheelSource=this.lfoValue*(1-s[11])+this.pinkValue*s[11],white=this.whiteValue*s[4];let sum=0;';
        const b='(bendB===0?1:exp2(bendB))',a='(bendA===0?1:exp2(bendA))';
        for(const needle of [scope,b,a])if(!source.includes(needle)||source.indexOf(needle)!==source.lastIndexOf(needle))throw Error('HEIRLOOM native pitch-modulation contract changed.');
        // All voices hear the same LFO sample; the default global mod wheel
        // therefore asks for the identical exp2 ratio up to ten times. Reuse
        // only exactly equal inputs within this one oversample. Per-channel
        // wheel values and poly modulation keep their original calculation.
        const ratio=value=>'('+value+'===0?1:'+value+'===__kitchenPitchValue?__kitchenPitchRatio:(__kitchenPitchValue='+value+',__kitchenPitchRatio=exp2('+value+')))';
        source=source.replace(scope,scope.slice(0,-1)+',__kitchenPitchValue=0,__kitchenPitchRatio=1;').replace(b,ratio('bendB')).replace(a,'(bendA===0?1:bendA===bendB?__kitchenPitchRatio:exp2(bendA))');
        synth=source;
      }
      playbackCache.set(id, capturedFactory(g['create' + title + 'PlaybackDSP'])(capturedFactory(synth)));
    }
    return playbackCache.get(id);
  }
  let spectralDSP = null;
  function marinadeDSP() {
    if (spectralDSP) return spectralDSP;
    // MARINADE's independent partial rotations account for 36 oscillators per
    // voice, per sample. Keep precisely the original operation order and f32
    // stores, while running this small numeric loop in scalar WebAssembly.
    // Compilation, memory and every voice view are prepared before rendering.
    const offsets = { cos:16, sin:304, rotC:592, rotS:880, amp:1168, ampStep:1312, quality:1456, qualityStep:1600, panL:1744, panR:1888 };
    const u = number => { const bytes=[]; do { const byte=number&127;number>>>=7;bytes.push(byte|(number?128:0)); } while(number); return bytes; };
    const str = value => [value.length,...Array.from(value,c=>c.charCodeAt(0))];
    const section = (id,data) => [id,...u(data.length),...data];
    const get = i => [0x20,...u(i)], set = i => [0x21,...u(i)];
    const f64 = value => { const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value,true);return [0x44,...new Uint8Array(data.buffer)]; };
    const load64 = (key,local=3) => [...get(local),0x2b,3,...u(offsets[key])];
    const load32 = key => [...get(4),0x2a,2,...u(offsets[key]),0xbb];
    const store32 = (key,step) => [...get(4),...load32(key),...load32(step),0xa0,0xb6,0x38,2,...u(offsets[key])];
    const body = [2,3,0x7f,7,0x7c, // locals: index/address8/address4; seven f64s
      0x02,0x40,0x03,0x40,...get(2),...get(1),0x4f,0x0d,1,
      ...get(0),...get(2),0x41,3,0x74,0x6a,...set(3),
      ...get(0),...get(2),0x41,2,0x74,0x6a,...set(4),
      ...store32('amp','ampStep'),...store32('quality','qualityStep'),
      ...load32('quality'),...f64(.00001),0x63,...load32('qualityStep'),...f64(0),0x65,0x71,
      0x04,0x40,0x05, // Skip the same inaudible partials as the canonical loop.
      ...load64('cos'),...set(8),...load64('sin'),...set(9),
      ...get(9),...load32('amp'),0xa2,...load32('quality'),0xa2,...set(7),
      ...get(3),...get(8),...load64('rotC'),0xa2,...get(9),...load64('rotS'),0xa2,0xa1,0x39,3,...u(offsets.cos),
      ...get(3),...get(9),...load64('rotC'),0xa2,...get(8),...load64('rotS'),0xa2,0xa0,0x39,3,...u(offsets.sin),
      ...get(5),...get(7),...load32('panL'),0xa2,0xa0,...set(5),
      ...get(6),...get(7),...load32('panR'),0xa2,0xa0,...set(6),
      0x0b,...get(2),0x41,1,0x6a,...set(2),0x0c,0,0x0b,0x0b,
      ...get(0),...get(5),0x39,3,0,...get(0),...get(6),0x39,3,8,0x0b];
    const module = new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0,
      ...section(1,[1,0x60,2,0x7f,0x7f,0]),...section(3,[1,0]),...section(5,[1,0,1]),
      ...section(7,[2,...str('memory'),2,0,...str('step'),0,0]),...section(10,[1,...u(body.length),...body])]));
    const engines = new WeakMap();
    function prepare(core) {
      const instance=new WebAssembly.Instance(module), buffer=instance.exports.memory.buffer, slots=[];
      for(let i=0;i<16;i++) {const base=i*2048,arrays={};for(const [key,offset]of Object.entries(offsets))arrays[key]=key==='cos'||key==='sin'||key==='rotC'||key==='rotS'?new Float64Array(buffer,base+offset,36):new Float32Array(buffer,base+offset,36);slots.push({base,arrays,output:new Float64Array(buffer,base,2)});}
      engines.set(core,{step:instance.exports.step,slots,voices:new WeakMap()});
    }
    function partialSample(core,voice) {const engine=engines.get(core),slot=engine.voices.get(voice);engine.step(slot.base,core.lanes.length);return slot.output;}
    const original='let l=0,r=0;for(let k=0;k<this.lanes.length;k++){v.amp[k]+=v.ampStep[k];v.quality[k]+=v.qualityStep[k];if(v.quality[k]<.00001&&v.qualityStep[k]<=0)continue;const value=v.sin[k]*v.amp[k]*v.quality[k],cos=v.cos[k],sin=v.sin[k];v.cos[k]=cos*v.rotC[k]-sin*v.rotS[k];v.sin[k]=sin*v.rotC[k]+cos*v.rotS[k];l+=value*v.panL[k];r+=value*v.panR[k];}';
    const source=g.createMarinadeDSP.toString();
    if(!source.includes(original)||source.indexOf(original)!==source.lastIndexOf(original))throw Error('MARINADE native oscillator contract changed; update its exact scalar kernel.');
    const dsp=capturedFactory(source.replace(original,'const partials=partialSample(this,v);let l=partials[0],r=partials[1];'),{createMarinadeSequence:g.createMarinadeSequence,partialSample})();
    const note=dsp.Core.prototype._note;
    dsp.Core.prototype._note=function(event){note.call(this,event);const voice=this.voices[this.voices.length-1],engine=engines.get(this);if(!voice||engine.voices.has(voice))return;
      const used=new Set(this.voices.map(v=>engine.voices.get(v))),slot=engine.slots.find(s=>!used.has(s));if(!slot)throw Error('MARINADE exceeded its canonical16voice budget.');
      for(const [key,array]of Object.entries(slot.arrays)){array.set(voice[key]);voice[key]=array;}engine.voices.set(voice,slot);
    };
    spectralDSP={Core:dsp.Core,prepare};return spectralDSP;
  }
  const atPath = (state, path) => path.split('.').reduce((object, key) => object?.[key], state);
  function putPath(state, path, value) { const parts=path.split('.'); let object=state; for(let i=0;i<parts.length-1;i++)object=object[parts[i]]; object[parts[parts.length-1]]=value; }
  function parameters(id) {
    if (parameterCache.has(id)) return copy(parameterCache.get(id));
    const schema=g[INFO[id][1]]; if(!schema)return [];
    const defaults=schema.normalize(schema.defaultState()), result=[];
    const label=path=>path.replace(/\.(\d+)\./g, (_,i)=>' '+(Number(i)+1)+' ').replace(/\./g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
    if(schema.CONTROLS) for(const control of schema.CONTROLS) {
      result.push({ ...copy(control), path:'synth.'+control.key, id:'synth.'+control.key,
        type:control.type==='range'?'number':control.type==='toggle'?'boolean':'select',
        values:control.options?.map(option=>option.value), default:defaults.synth[control.key] });
    } else {
      const visit=(value,path='')=>{
        for(const [key,current] of Object.entries(value)) {
          const p=path?path+'.'+key:key;
          // Arrangement cells, sample assets and UI bookkeeping retain their
          // full project representation; only sound controls become parameters.
          if(['tempo','version','seed','name','asset','assets','samples','score','steps','patterns','pattern','patternBanks','notePatterns','chords','recipe','sequence','musicLabPattern','performance','view','record','routing','boundaries'].includes(key))continue;
          if(typeof current==='number') {
            const low=copy(defaults),high=copy(defaults);putPath(low,p,-Number.MAX_VALUE);putPath(high,p,Number.MAX_VALUE);
            const min=atPath(schema.normalize(low),p),max=atPath(schema.normalize(high),p);
            if(Number.isFinite(min)&&Number.isFinite(max)&&max>min)result.push({path:p,id:p,label:label(p),type:'number',min,max,default:current,
              step:['root','octave','pitch','selectedPattern','length','destination','patternLength'].includes(key)?1:undefined,log:['cutoff','tone','highpass','decay','attack','release','rate','bodyDecay'].includes(key)&&min>0});
          } else if(typeof current==='boolean')result.push({path:p,id:p,label:label(p),type:'boolean',default:current});
          else if(current&&typeof current==='object')visit(current,p);
        }
      }; visit(defaults);
      const selections={
        mire:{'nodes.*.model':schema.NODE_MODELS?.map(x=>x.id),'nodes.*.division':schema.DIVISIONS,'sources.*.kind':schema.SOURCE_KINDS?.map(x=>x.id),'modulators.*.shape':['sine','triangle','random']},
        spool:{'source.voice':schema.VOICES?.map(x=>x.id),'master.echoDivision':schema.DIVISIONS},
        haze:{scale:schema.SCALES?.map?.(x=>x.id),direction:schema.DIRECTIONS?.map?.(x=>x.id),echoDivision:schema.DIVISIONS},
        bower:{scale:Object.keys(schema.SCALES||{}),'lanes.*.body':schema.BODIES,'lanes.*.exciter':schema.EXCITERS,'lanes.*.division':Object.keys(schema.DIVISIONS||{})},
        roux:{'synth.waveform':['saw','square','triangle','fold'],'synth.material':schema.MATERIALS,'synth.filterType':['lowpass','bandpass','highpass']},
        proof:{'synth.model':schema.ENUMS?.model,'synth.wave':schema.ENUMS?.wave,'synth.filter.type':schema.ENUMS?.filterType,'synth.lfo.shape':schema.ENUMS?.lfoShape,'synth.lfo.target':schema.ENUMS?.lfoTarget},
        marinade:{'synth.scanMode':schema.ENUMS?.scanMode,'synth.filter.type':schema.ENUMS?.filterType,'synth.lfo.shape':schema.ENUMS?.lfoShape,'synth.lfo.target':schema.ENUMS?.lfoTarget}
      }[id]||{};
      for(const [pattern,values]of Object.entries(selections))if(values?.length) {
        const expanded=pattern.includes('*')?Array.from({length:atPath(defaults,pattern.split('.*')[0]).length},(_,i)=>pattern.replace('*',i)):[pattern];
        for(const p of expanded)result.push({path:p,id:p,label:label(p),type:'select',values,options:values.map(value=>({value,label:String(value)})),default:atPath(defaults,p)});
      }
    }
    parameterCache.set(id,result); return copy(result);
  }
  function definitions() {
    return ids.map(id => ({ id, name: INFO[id][0], schema: INFO[id][1],
      defaults: g[INFO[id][1]] ? g[INFO[id][1]].defaultState() : null,
      parameters:parameters(id),
      midi: id === 'haze' ? 'nearest spectral band' : id === 'ravel' ? 'channel selects slice; C4 is untransposed' : ['mire', 'bower'].includes(id) ? 'channel selects voice; note sets pitch' : 'pitched notes' }));
  }
  function floatPCM(text) {
    const raw = g.atob(text), bytes = new Uint8Array(raw.length);
    if (raw.length % 4) throw Error('Incomplete Float32 source audio.');
    for (let i = 0; i < bytes.length; i++) bytes[i] = raw.charCodeAt(i);
    const view = new DataView(bytes.buffer), pcm = new Float32Array(bytes.length / 4);
    for (let i = 0; i < pcm.length; i++) { pcm[i] = view.getFloat32(i * 4, true); if (!Number.isFinite(pcm[i])) throw Error('Invalid Float32 source audio.'); }
    return pcm;
  }
  function stereoPCM(asset) {
    const raw = g.atob(asset.pcm), channels = asset.channels === 1 ? 1 : 2;
    if (raw.length !== asset.frames * channels * 2) throw Error('Incomplete source audio.');
    const bytes = new Uint8Array(raw.length); for (let i = 0; i < bytes.length; i++) bytes[i] = raw.charCodeAt(i);
    const view = new DataView(bytes.buffer), pcm = new Float32Array(asset.frames * 2);
    for (let i = 0; i < asset.frames; i++) for (let c = 0; c < 2; c++) pcm[i * 2 + c] = view.getInt16((i * channels + Math.min(c, channels - 1)) * 2, true) / 32768;
    return { pcm, sampleRate: asset.sampleRate };
  }
  function create(id, sampleRate, initialState, resources = {}) {
    if (!ids.includes(id)) throw Error('Unknown Kitchen Core instrument: ' + id);
    const S = g[INFO[id][1]]; if (!S) throw Error('Missing ' + INFO[id][1] + ' source.');
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw Error('Choose an 8–192 kHz sample rate.');
    let envelope = null, state, core, localFrame = 0, anchored = false, lastClock = null, serial = 0;
    let nativeSequence = resources.nativeSequence !== false, nativeWasPlaying = false, resourceKey = '', models = resources.models || null;
    let inputEnabled=resources.nativeInput===true,inputDestination=Math.round(bounded(resources.inputDestination,0,3,0));
    let sequenceEvents = [], sequenceLength = 4, externalSequence = false;
    const held = new Map(), midiJobs = [];
    const wrapper = ['heirloom', 'brine', 'citrus'].includes(id);
    function setInput(options={}) {
      if(id!=='mire'&&id!=='spool')throw Error('This instrument does not accept live audio input.');
      if(typeof options==='boolean')options={enabled:options};
      if(options.enabled!==undefined)inputEnabled=options.enabled===true;
      if(options.destination!==undefined)inputDestination=Math.round(bounded(options.destination,0,3,inputDestination));
      if(id==='mire'){core.micGain=inputEnabled?1:0;core.micDestination=inputDestination;}
      else core.micEnabled=inputEnabled;
      return {enabled:inputEnabled,destination:inputDestination};
    }
    function normalize(raw) {
      if (raw && raw.state && typeof raw.format === 'string') { envelope = { ...raw }; raw = raw.state; }
      else envelope = null;
      return S.normalize(raw === undefined || raw === null ? S.defaultState() : raw);
    }
    function voiceIndex(event, count) { return Math.max(0, Math.min(count - 1, Math.round(event.voiceIndex ?? event.voice ?? event.channel ?? 0))); }
    function key(event) { return String(event.id ?? ((event.channel || 0) + ':' + event.pitch)); }
    function source(keyValue) { return 'vst:' + keyValue; }
    function cancelSource(value, frame) {
      if (id === 'mire') core.stopSources(value, frame);
      else if (id === 'spool') core.clearPatternNotes(value, frame, frame > localFrame);
      else if (id === 'ravel') core.clearExternalNotes(value, frame, frame > localFrame);
      else if (id === 'haze' || id === 'bower' || id === 'roux') core.stopNotes(value, frame);
      else if (id === 'proof' || id === 'marinade') core.stopNotes({ source: value, frame });
      else core.enqueue('cancel', { source: value, frame });
    }
    function buildSequence() {
      const overlay = state.musicLabPattern;
      externalSequence = id === 'mire' || !!overlay && ['spool', 'haze', 'bower', 'ravel'].includes(id);
      sequenceEvents = [];
      if (externalSequence && overlay) {
        const packet = overlay.pattern; sequenceLength = packet.lengthBeats;
        sequenceEvents = packet.notes.map((n, i) => ({ ...n, index: overlay.voiceMap[n.voice]==='auto'?undefined:Number(String(overlay.voiceMap[n.voice]).replace(/^slice-/,'')) || 0,
          beat: n.beat + (Math.abs(n.beat * 4 - Math.round(n.beat * 4)) < 1e-8 && Math.round(n.beat * 4) % 2 ? (packet.swing || 0) / 4 : 0), identity: n.id || i }));
      } else if (id === 'mire') {
        sequenceLength = (state.patternLength === 32 ? 32 : 16) / 4;
        state.sources.forEach((voice, index) => { if (voice.mute) return;
          voice.steps.slice(0, sequenceLength * 4).forEach((hit, step) => { if (!hit.on) return;
            const rats = Math.max(1, Math.min(4, hit.ratchet || 1)), interval = .25 * (step % 2 ? 1 - state.swing : 1 + state.swing);
            for (let r = 0; r < rats; r++) sequenceEvents.push({ index, beat: step / 4 + (step % 2 ? state.swing / 4 : 0) + r * interval / rats,
              velocity: hit.velocity * (r ? .88 : 1), probability: hit.probability, identity: index + ':' + step, duration: undefined });
          });
        });
      }
      sequenceEvents.sort((a, b) => a.beat - b.beat);
    }
    function prepareResources(force) {
      let nextKey = '';
      if (id === 'marinade') {
        nextKey = JSON.stringify(state.samples.map(b => ({ ref: b.ref, rootNote: b.rootNote, trimStart: b.trimStart, trimEnd: b.trimEnd, reverse: b.reverse, gain: b.gain })));
        if (force || resourceKey !== nextKey) {
          if (!force || !models) models = state.samples.map(bay => {
            const audio = g.MarinadeSources.resolve(bay.ref);
            return g.MarinadeAnalysis.analyze(audio, { sampleRate: audio.sampleRate, rootNote: bay.rootNote, trimStart: bay.trimStart, trimEnd: bay.trimEnd, reverse: bay.reverse, gain: bay.gain });
          });
          if (core) core.setModels(models);
        }
      } else if (id === 'spool') {
        nextKey = JSON.stringify(state.assets);
        if (force || resourceKey !== nextKey) state.assets.forEach((asset, index) => {
          const decoded = resources.samples?.[index] || g.SpoolAudio.decodePCM(asset);
          core.setSample(index, decoded?.pcm || null, decoded?.sampleRate || sampleRate);
        });
      } else if (id === 'ravel') {
        nextKey = JSON.stringify(state.asset);
        if (force || resourceKey !== nextKey) {
          const sample = resources.sample || (state.asset.kind === 'seed' ? g.RavelDSP.generateSeed(state.asset) : stereoPCM(state.asset));
          core.setSample(sample);
        }
      } else if (id === 'mire') {
        nextKey = JSON.stringify(state.samples);
        if (force || resourceKey !== nextKey) (state.samples || []).forEach((asset, index) => {
          const decoded = resources.samples?.[index] || (asset ? { pcm: floatPCM(asset.pcm), sampleRate: asset.sampleRate } : null);
          core.setSample(index, decoded?.pcm || null, decoded?.sampleRate || sampleRate);
        });
      }
      resourceKey = nextKey;
    }
    function construct() {
      if (id === 'mire') core = new g.MireDSP(sampleRate, state);
      else if (id === 'spool') core = new g.SpoolDSP(sampleRate, state);
      else if (id === 'haze') core = new g.HazeDSP.Core(state, sampleRate);
      else if (id === 'bower') core = new g.BowerDSP.Core(sampleRate, state);
      else if (id === 'ravel') core = new g.RavelDSP.Core(state, resources.sample || (state.asset.kind === 'seed' ? g.RavelDSP.generateSeed(state.asset) : stereoPCM(state.asset)), sampleRate);
      else if (id === 'roux') core = new g.RouxDSP.Core(sampleRate, state, g.RouxNativeScore(state));
      else if (id === 'proof') core = new g.ProofDSP.Core(sampleRate, state);
      else if (id === 'marinade') { core = null; prepareResources(true); const DSP=marinadeDSP();core = new DSP.Core(sampleRate, state, models);DSP.prepare(core); }
      else if (id === 'heirloom' || id === 'brine') core = new (playbackDSP(id).Core)(sampleRate, state, localFrame);
      else core = new (playbackDSP(id).Core)(sampleRate, g.CitrusAudio.prepareState(state), localFrame);
      prepareResources(true); buildSequence();
      if(id==='mire'||id==='spool')setInput();
    }
    function setState(raw, controlPath) {
      state = normalize(raw);
      if(!controlPath||/^(sources|swing|pattern|musicLabPattern)/.test(controlPath))buildSequence();
      const playbackState=lastClock?{...state,tempo:lastClock.tempo}:state;
      if (wrapper) core.enqueue('state', { frame: localFrame, state: id === 'citrus' ? g.CitrusAudio.prepareState(playbackState) : playbackState });
      else if (id === 'roux') core.setState(playbackState, g.RouxNativeScore(playbackState));
      else core.setState(playbackState);
      // Updating an ordinary knob must neither analyze PCM nor restart held
      // native notes. Real resource edits remain explicit preparation work.
      if(!controlPath||/^(asset|assets|samples)(\.|$)/.test(controlPath))prepareResources(false);
      return controlPath?atPath(state,controlPath):api.getState();
    }
    function clockPosition(clock) {
      const beat = bounded(clock.beat ?? clock.ppqPosition, -1000000, 1000000, 0), tempo = bounded(clock.tempo ?? clock.bpm, 1, 1000, state.tempo || 120);
      return { ...clock, beat, tempo, frame: Math.max(localFrame, Math.round(bounded(clock.frame, 0, Number.MAX_SAFE_INTEGER, localFrame))), playing: clock.playing === true };
    }
    function transport(raw) {
      const clock = clockPosition(raw || {});
      if (!anchored) { localFrame = clock.frame; if (id !== 'ravel') core.frame = localFrame; anchored = true; }
      const previous = lastClock, expected = previous ? previous.beat + (previous.playing ? (clock.frame - previous.frame) * previous.tempo / (60 * sampleRate) : 0) : clock.beat;
      const jump = !previous || previous.revision !== clock.revision || Math.abs(expected - clock.beat) > 2 / sampleRate * clock.tempo / 60;
      const tempoChanged = !previous || previous.tempo !== clock.tempo, nativePlaying = nativeSequence && clock.playing && clock.beat >= 0;
      const wasNativePlaying = nativeWasPlaying;
      if (tempoChanged && !wrapper && id !== 'proof' && id !== 'marinade') {
        if (id === 'roux') core.setState({ ...state, tempo: clock.tempo }, g.RouxNativeScore(state));
        else core.setState({ ...state, tempo: clock.tempo });
        if (id === 'bower') { core.tempo = clock.tempo; core.stepsPerBeat = sampleRate * 60 / clock.tempo; }
        if (id === 'mire' || id === 'spool') core.tempo = clock.tempo;
        if (id === 'haze') core.state.tempo = clock.tempo;
      }
      if (wrapper) {
        core.enqueue('transport', { ...clock, playing: clock.playing });
        if (nativePlaying && (!wasNativePlaying || jump || tempoChanged)) core.enqueue('start', { frame: clock.frame, beat: clock.beat });
        else if (!nativePlaying && wasNativePlaying) core.enqueue('stop', { frame: clock.frame });
      } else if (id === 'proof' || id === 'marinade') {
        core.setTransport(clock);
        if (nativePlaying && (!wasNativePlaying || jump || tempoChanged)) core.start({ frame: clock.frame, beat: clock.beat });
        else if (!nativePlaying && wasNativePlaying) core.stop();
      } else if (externalSequence) {
        if (jump || !nativePlaying) cancelSource(SOURCE, clock.frame);
        if (id !== 'mire') core.running = false;
      } else if (id === 'spool') {
        if (jump || tempoChanged || nativePlaying !== wasNativePlaying) core.clockSeek(Math.max(0, clock.beat), clock.tempo, nativePlaying);
      } else if (id === 'haze') {
        if (nativePlaying) {
          if (jump || tempoChanged || !wasNativePlaying) {
            const span=state.sequenceMode==='pattern'?state.patternBanks[state.selectedPattern].length/4:state.bars*4;
            const reverse=state.sequenceMode!=='pattern'&&state.direction==='reverse';
            const travel=(reverse?32-state.position:state.position)+clock.beat/span*32;
            const position=state.sequenceMode!=='pattern'&&state.direction==='pingpong'?(mod(travel,64)<32?mod(travel,64):63.999-mod(travel,64)):reverse?mod(32-travel,32):mod(travel,32);
            core.setPosition(position);core.travel=travel;
          }
          core.running = true;
        } else core.running = false;
      } else if (id === 'ravel') {
        if (nativePlaying && (!wasNativePlaying || jump || tempoChanged)) {
          let pattern=state.selectedPattern,cycle,startBeat;
          if(state.chain){const lengths=Array.from({length:4},(_,i)=>state.patterns[mod(state.selectedPattern+i,4)].length/4),total=lengths.reduce((a,b)=>a+b,0),round=Math.floor(clock.beat/total);startBeat=round*total;cycle=round*4;
            for(let i=0;i<3&&startBeat+lengths[i]<=clock.beat+1e-8;i++){startBeat+=lengths[i];cycle++;pattern=mod(pattern+1,4);}
          }else{const length=state.patterns[pattern].length/4;cycle=Math.floor(clock.beat/length);startBeat=cycle*length;}
          core.running = true; core.frame = clock.beat * sampleRate * 60 / clock.tempo; core.nextBar = startBeat * sampleRate * 60 / clock.tempo;
          core.bar = cycle;core.pending=null;core.pattern=state.chain&&cycle>0?mod(pattern-1,4):pattern;
          core.events = []; core.scheduleBar(); core.events = core.events.filter(e => e.frame >= core.frame);
        } else if (!nativePlaying) core.running = false;
      } else if (id === 'roux') {
        if (nativePlaying && (!wasNativePlaying || jump || tempoChanged)) {
          if (!wasNativePlaying && clock.beat === 0) core.start();
          core.running = true; core.transport = clock.beat * core.framesPerBeat; core.cycle = Math.floor(clock.beat / core.score.lengthBeats);
          core.noteAt = 0; while (core.noteAt < core.score.notes.length && core.cycle * core.score.lengthBeats + core.score.notes[core.noteAt].beat < clock.beat - 1e-8) core.noteAt++;
          core.stepAt = 0; while (core.stepAt < core.score.steps.length && core.cycle * core.score.lengthBeats + core.score.steps[core.stepAt].beat < clock.beat - 1e-8) core.stepAt++;
        } else if (!nativePlaying && wasNativePlaying) core.stop();
      } else if (id === 'bower') {
        if (nativePlaying && (!wasNativePlaying || jump || tempoChanged)) {
          const midiEvents=core.events.filter(e=>e.source?.startsWith('vst:'));
          if (!wasNativePlaying && clock.beat === 0) core.start();
          core.events=midiEvents;core.running = true; core.transport = clock.beat * core.stepsPerBeat;
          const divisions = { '1/16': .25, '1/8': .5, '1/4': 1, '3/8': 1.5, '1/2': 2 };
          core.clocks.forEach((c, i) => { const division = state.sequenceMode === 'pattern' ? .25 : divisions[state.lanes[i].division] || .5;
            let k = Math.max(0, Math.floor(clock.beat / division)); while ((k + (k % 2 ? state.swing * .5 : 0)) * division < clock.beat - 1e-8) k++;
            c.count = k; c.next = (k + (k % 2 ? state.swing * .5 : 0)) * division * core.stepsPerBeat;
          });
        } else if (!nativePlaying && wasNativePlaying) {const midiEvents=core.events.filter(e=>e.source?.startsWith('vst:')),cancellations=core.cancellations.filter(e=>e.source?.startsWith('vst:'));core.stop();core.events=midiEvents;core.cancellations=cancellations;}
      }
      nativeWasPlaying = nativePlaying; lastClock = clock; return clock;
    }
    function nearestBand(pitch) {
      const frequency = 440 * Math.pow(2, (pitch - 69) / 12); let best = 0, error = Infinity;
      for (let i = 0; i < 24; i++) { const d = Math.abs(Math.log(g.HazeDSP.frequencyForBand(core.state, i) / frequency)); if (d < error) { error = d; best = i; } }
      return best;
    }
    function trigger(event, valueSource, duration = HOLD) {
      const frame = Math.max(localFrame, Math.round(event.frame ?? localFrame)), pitch = event.pitch, velocity = event.velocity;
      if (id === 'mire') core.trigger({ index: event.channel>=12?0:voiceIndex(event, 4), note: event.channel>=12?undefined:pitch, velocity, frame, source: valueSource, durationSeconds: duration,
        ...(event.channel>=12?{audition:true,destination:event.channel-12}:{}) });
      else if (id === 'spool') {
        // The web keyboard releases by pitch. A DAW may hold that pitch on
        // several channels; retain each existing gate while using its voice DSP.
        const existing = core.voices.map(voice => [voice, voice.releasing]);
        core.noteOn(pitch, velocity);
        for (const [voice, releasing] of existing) if (core.voices.includes(voice)) voice.releasing = releasing;
        const voice = core.voices[core.voices.length - 1]; if (voice) voice.pluginSource = valueSource;
      }
      else if (id === 'haze') core.scheduleNote(event.voiceIndex === undefined ? nearestBand(pitch) : voiceIndex(event, 24), velocity, frame, Math.round(duration * sampleRate), valueSource);
      else if (id === 'bower') core.scheduleNote(voiceIndex(event, 4), pitch, velocity, frame, duration, valueSource);
      else if (id === 'ravel') core.queueSlice(voiceIndex(event, 16), { velocity, pitch: pitch - 60, duration, source: valueSource }, frame);
      else if (id === 'roux') core.scheduleNote(pitch, velocity, frame, duration, valueSource);
      else if (id === 'proof' || id === 'marinade') core.scheduleNote({ note: pitch, velocity, frame, duration, source: valueSource });
      else core.enqueue(id === 'citrus' || id === 'brine' ? 'manualOn' : 'on', { ...event, source: valueSource, frame, id: String(event.id) });
    }
    function noteOn(event = {}) {
      const pitch = Math.round(bounded(event.pitch ?? event.note, 0, 127, 60)), velocity = bounded(event.velocity, 0, 1, 1), channel = Math.round(bounded(event.channel, 0, 15, 0));
      if (!velocity) return noteOff({ ...event, pitch, channel });
      const identity = key({ ...event, pitch, channel }), valueSource = source(identity);
      const prior = held.get(identity); if (prior) noteOff({ ...prior, frame: event.frame ?? localFrame });
      const e = { ...event, id: identity, pitch, channel, velocity, frame: Math.max(localFrame, Math.round(event.frame ?? localFrame)), source: valueSource };
      held.set(identity, e);
      // The two legacy direct-key APIs have no internal sample queue. The
      // adapter queues their actions on the same monotonic grid instead.
      if (id === 'spool') { midiJobs.push({ ...e, on: true }); midiJobs.sort((a,b) => a.frame - b.frame); }
      else trigger(e, valueSource);
      return identity;
    }
    function noteOff(event = {}) {
      const identity = key({ ...event, pitch: event.pitch ?? event.note }), active = held.get(identity); if (!active) return false;
      const frame = Math.max(localFrame, Math.round(event.frame ?? localFrame)); held.delete(identity);
      if (id === 'spool') { midiJobs.push({ ...active, frame, on: false }); midiJobs.sort((a,b) => a.frame - b.frame); }
      else if (wrapper) core.enqueue(id === 'citrus' || id === 'brine' ? 'manualOff' : 'off', { ...active, frame });
      else cancelSource(active.source, frame);
      return true;
    }
    function scheduleExternal(clock, count) {
      if (!externalSequence || !nativeSequence || !clock?.playing || !sequenceEvents.length) return;
      const spb = sampleRate * 60 / clock.tempo, end = clock.beat + count / spb;
      const first = Math.max(0, Math.floor(clock.beat / sequenceLength)), last = Math.floor(end / sequenceLength);
      for (let cycle = first; cycle <= last; cycle++) {
        const lo = clock.beat - cycle * sequenceLength, hi = end - cycle * sequenceLength;
        let a = 0, b = sequenceEvents.length; while (a < b) { const m = (a+b) >>> 1; if (sequenceEvents[m].beat < lo - 1e-8) a = m+1; else b = m; }
        for (; a < sequenceEvents.length && sequenceEvents[a].beat < hi - 1e-8; a++) {
          const e = sequenceEvents[a]; let random = Math.imul((state.seed || 0x4d495245) ^ cycle, 16777619);
          for (const c of String(e.identity ?? a)) random = Math.imul(random ^ c.charCodeAt(0), 16777619);
          if ((random >>> 0) / 4294967296 >= (e.probability ?? 1) || !e.velocity) continue;
          const frame = localFrame + Math.max(0, Math.round((cycle * sequenceLength + e.beat - clock.beat) * spb)), duration = (e.duration ?? .25) * 60 / clock.tempo;
          if (id === 'spool') core.queueDeck(e.index, { velocity: e.velocity, pitch: (e.pitch ?? 60) - 60, duration, source: SOURCE }, frame);
          else trigger({ pitch: e.pitch ?? state.sources?.[e.index]?.pitch ?? 60, velocity: e.velocity, voiceIndex: e.index, frame }, SOURCE, e.duration === undefined ? HOLD : duration);
        }
      }
    }
    function render(left, right, frame,inputLeft,inputRight,inputOffset=0) {
      // Match the original worklets: REDUCE receives the first (mono) channel;
      // ROTISSERIE retains independent stereo input for monitoring/capture.
      const a=inputOffset&&inputLeft?inputLeft.subarray(inputOffset):inputLeft,b=inputOffset&&inputRight?inputRight.subarray(inputOffset):inputRight;
      if (wrapper) core.process(left, right);
      else if (id === 'ravel') core.processBlock(left, right, frame);
      else if (id === 'spool') core.processBlock(left, right, a, b, frame);
      else if(id==='mire')core.processBlock(left,right,a);
      else core.processBlock(left, right);
    }
    function process(left, right, clock,inputLeft,inputRight) {
      if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) throw Error('Provide equal stereo Float32 output buffers.');
      if(inputLeft!==undefined&&(!(inputLeft instanceof Float32Array)||inputLeft.length<left.length)||inputRight!==undefined&&(!(inputRight instanceof Float32Array)||inputRight.length<left.length))throw Error('Live audio input must be a Float32 channel at least as long as the output.');
      let c = clock ? transport(clock) : lastClock;
      if(c?.playing&&c.beat<0&&nativeSequence){const lead=Math.round(-c.beat*sampleRate*60/c.tempo);
        if(lead>0&&lead<left.length){process(left.subarray(0,lead),right.subarray(0,lead),c,inputLeft,inputRight);process(left.subarray(lead),right.subarray(lead),{...c,frame:c.frame+lead,beat:0},inputLeft?.subarray(lead),inputRight?.subarray(lead));return true;}
        if(lead===0)c=transport({...c,beat:0});
      }
      scheduleExternal(c, left.length);
      if (id === 'spool' && midiJobs.length) {
        let at = 0;
        while (at < left.length) {
          while (midiJobs.length && midiJobs[0].frame <= localFrame + at) { const e = midiJobs.shift();
            if (e.on) trigger(e, e.source); else for (const voice of core.voices) if (voice.pluginSource === e.source) voice.releasing = true;
          }
          const end = Math.min(left.length, midiJobs.length ? Math.max(at, midiJobs[0].frame - localFrame) : left.length);
          if (end > at) render(left.subarray(at,end), right.subarray(at,end), localFrame+at,inputLeft,inputRight,at); at = end;
        }
      } else render(left, right, localFrame,inputLeft,inputRight);
      localFrame += left.length;
      if (lastClock) lastClock = { ...lastClock, frame: localFrame, beat: lastClock.beat + (lastClock.playing ? left.length * lastClock.tempo / (60 * sampleRate) : 0) };
      return true;
    }
    function reset() {
      // Called directly by a DAW reset on its audio thread. Keep each original
      // Core, delay line, decoded sample and spectral model; never construct or
      // prepare assets here. The canonical panic routines clear existing DSP.
      held.clear();midiJobs.length=0;
      if(wrapper){core.enqueue('panic',{frame:core.frame});core.synth.reset?.();}
      else if(core.panic)core.panic();else core.clear(true);
      core.frame=0;
      if(id==='spool')core.rewind();
      else if(id==='haze')core.setPosition(state.position);
      else if(id==='bower'||id==='roux')core.rewind();
      else if(id==='ravel'){
        core.clockFrame=0;core.nextBar=0;core.bar=0;core.pattern=state.selectedPattern;core.pending=null;core.rng=g.RavelDSP.random(state.seed);
      }
      if(id==='proof'||id==='marinade'){
        core.originFrame=core.originBeat=0;core.clockRevision=undefined;
      }else if(wrapper){
        if(id==='citrus'){core.origin=core.originBeat=core.cycle=core.cursor=0;core.transportRevision=null;}
        else {core.nativeOriginFrame=core.nativeOriginBeat=core.nativeCycle=core.nativeCursor=0;core.clockOriginFrame=core.clockOriginBeat=0;core.clockRevision=undefined;
          if(id==='brine'){core.arpOriginFrame=core.arpStep=0;}
        }
      }
      localFrame=0;anchored=false;lastClock=null;nativeWasPlaying=false;
      if(id==='mire'||id==='spool')setInput();
    }
    const api = {
      id, get core() { return core; },
      getState() { return envelope ? { ...copy(envelope), state: copy(state) } : copy(state); },
      getNativeState() { return copy(state); }, setState, noteOn, noteOff, transport, process,
      setInput,getInput(){return {enabled:inputEnabled,destination:inputDestination};},
      controlChange(event={}) {
        if(event.controller===123||event.controller===120){api.panic();return true;}
        if(id!=='heirloom'&&id!=='brine')return false;
        const frame=Math.max(localFrame,Math.round(event.frame??localFrame)),channel=event.channel??0,value=bounded(event.value,0,1,0);
        if(event.controller===64)core.enqueue('sustain',{frame,channel,down:value>=.5});
        else if(event.controller===1)core.enqueue('wheel',{frame,channel,value});else return false;return true;
      },
      pitchBend(event={}) { if(id!=='heirloom'&&id!=='brine')return false;core.enqueue('bend',{frame:Math.max(localFrame,Math.round(event.frame??localFrame)),channel:event.channel??0,value:bounded(event.value,-1,1,0)});return true; },
      setNativeSequence(value) { if (nativeSequence === !!value) return; nativeSequence = !!value; if (lastClock) transport(lastClock); },
      setParameter(path, value) { const p = String(path).replace(/^state\./, '').split('.'); if (p.some(k => ['__proto__','prototype','constructor'].includes(k))) throw Error('Invalid parameter path.');
        if(path==='_nativeSequence'){api.setNativeSequence(value);return nativeSequence;}
        if(path==='_nativeInput'){setInput({enabled:value});return inputEnabled;}
        if(path==='_nativeInputDestination'){setInput({destination:value});return inputDestination;}
        const next = copy(state); let object = next; for (let i=0;i<p.length-1;i++) { if (!object[p[i]] || typeof object[p[i]] !== 'object') throw Error('Unknown parameter path.'); object=object[p[i]]; }
        object[p[p.length-1]]=value; return setState(envelope ? { ...envelope, state: next } : next,p.join('.'));
      },
      reset,
      prepare() { prepareResources(false); return true; },
      panic() { held.clear(); midiJobs.length=0; if (wrapper) core.enqueue('panic',{frame:localFrame}); else if (core.panic) core.panic(); else core.clear(true);if(id==='mire'||id==='spool')setInput(); },
      getMeters() { return core.getMeters?.() || (typeof core.meters === 'function' ? core.meters() : core.meters) || {}; }
    };
    state = normalize(initialState); construct(); return api;
  }
  g.KitchenCoreInstruments = Object.freeze({ ids, definitions, create });
})(typeof window === 'undefined' ? globalThis : window);
