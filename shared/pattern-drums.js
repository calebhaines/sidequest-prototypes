/* Kitchen's native drum, slice and tape adapters. No alternate synthesis engine. */
(() => {
  'use strict';
  const IDS = ['grain', 'tine', 'form', 'ravel', 'spool'];
  const NAMES = { grain:'SIZZLE', tine:'CLATTER', form:'HOTPLATE', ravel:'DICER', spool:'ROTISSERIE' };
  const FACADES = { grain:'GrainApp', tine:'TineApp', form:'FormApp', ravel:'RavelApp', spool:'SpoolApp' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const abort = signal => { if (signal?.aborted) throw new DOMException('Pattern operation cancelled.', 'AbortError'); };
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const eventBeat = (packet,note) => {
    const grid=Math.round(note.beat*4),onGrid=Math.abs(note.beat*4-grid)<1e-7;
    return Math.min(packet.lengthBeats-1e-8,note.beat+(onGrid&&grid%2?packet.swing/4:0));
  };
  function install(id) {
    if (!IDS.includes(id)) throw new Error('Unknown native pattern instrument.');
    if (window.MusicLabPatternInstrument?.app === id) return window.MusicLabPatternInstrument;
    const schema = () => { if (!window.MusicLabPatternSchema) throw new Error('The portable pattern schema is unavailable.'); return window.MusicLabPatternSchema; };
    const native = () => { const app=window[FACADES[id]]; if (!app) throw new Error('The instrument is still opening.'); return app; };
    const engine = () => native().engine;
    const state = () => native().getState();
    const viewState = () => native().getPatternState?.() || ((id==='ravel'||id==='spool')?engine().state:state());
    const unwrap = snapshot => snapshot?.state || snapshot?.project || snapshot;
    const tempoOf = s => s.bpm ?? s.tempo ?? 120;
    const voicesFor = s => {
      if (id==='ravel') return Array.from({length:16},(_,i)=>({id:'slice-'+i,name:'Slice '+String(i+1).padStart(2,'0'),pitch:60+i}));
      if (id==='spool') return s.decks.map((deck,i)=>({id:'deck-'+i,name:'Deck '+String.fromCharCode(65+i)+' · '+deck.name,pitch:60+i}));
      return (s.tracks||s.sounds).map((voice,i)=>({id:'voice-'+i,name:voice.name||'Voice '+(i+1),pitch:36+i}));
    };
    const indexOfVoice = (voice,s) => { const index=voicesFor(s).findIndex(v=>v.id===voice); if (index<0) throw new Error('Choose a valid '+NAMES[id]+' voice.'); return index; };
    let timer=null, startTime=0, cursor=0, scheduledState=null, display=null, generation=0, wrappedEngine=null;
    function clearTimer() { ++generation; if(timer!==null)clearInterval(timer);timer=null;scheduledState=null; }
    function stopPattern() { clearTimer(); }
    function validateMap(pattern,map,s) {
      if (!map || typeof map!=='object' || Array.isArray(map)) throw new Error('Map each source voice explicitly before sending the pattern.');
      const allowed=new Set(voicesFor(s).map(v=>v.id)), result={};
      for(const voice of pattern.voices){const target=map[voice.id];if(typeof target!=='string'||!allowed.has(target))throw new Error('Choose a destination for '+voice.name+'.');Object.defineProperty(result,voice.id,{value:target,enumerable:true,writable:true,configurable:true});}
      for(const key of Object.keys(map))if(!pattern.voices.some(voice=>voice.id===key))throw new Error('The mapping contains an unknown source voice.');
      return result;
    }
    function nativeMap(pattern,s) {
      const available=voicesFor(s), result={};
      for(const voice of pattern.voices){const match=available.find(v=>v.id===voice.id);if(!match)throw new Error('This pattern needs explicit voice mapping for '+NAMES[id]+'.');Object.defineProperty(result,voice.id,{value:match.id,enumerable:true,writable:true,configurable:true});}
      return result;
    }
    function validateNotes(pattern,map,s) {
      const target=voicesFor(s);
      for(const note of pattern.notes){const voice=target.find(v=>v.id===map[note.voice]);if(!voice)throw new Error('Missing note voice mapping.');const offset=note.pitch-voice.pitch;if(offset<-48||offset>48)throw new Error(NAMES[id]+' supports up to four octaves of note transposition from each voice.');}
      if(id==='spool'){
        const ends=new Map();
        for(const note of [...pattern.notes].sort((a,b)=>a.beat-b.beat)) {const voice=map[note.voice],end=ends.get(voice)||0;if(note.beat<end-1e-8)throw new Error('Each ROTISSERIE deck plays one tape at a time. Shorten overlapping notes or map them to separate decks.');ends.set(voice,note.beat+note.duration);}
      }
    }
    function applyOverlay(overlay) {
      const app=native();
      if(app.applyMusicLabPattern) app.applyMusicLabPattern(overlay);
      else {const next=state();if(overlay)next.musicLabPattern=clone(overlay);else delete next.musicLabPattern;app.loadState(next);}
      document.dispatchEvent(new CustomEvent('musiclab:state-change',{bubbles:true,detail:{app:id,kind:'pattern'}}));
    }
    function random(seed) {let value=seed>>>0;return()=>{value+=0x6D2B79F5;let x=Math.imul(value^value>>>15,1|value);x^=x+Math.imul(x^x>>>7,61|x);return((x^x>>>14)>>>0)/4294967296;};}
    function packetFromNative(s,options={}) {
      if(s.musicLabPattern){
        const packet=schema().normalize(s.musicLabPattern.pattern),map=validateMap(packet,s.musicLabPattern.voiceMap,s),available=voicesFor(s),used=new Set(Object.values(map));
        return schema().normalize({...packet,sourceApp:id,kind:'drums',voices:available.filter(v=>used.has(v.id)),notes:packet.notes.map(note=>({...note,voice:map[note.voice]}))});
      }
      const all=voicesFor(s), notes=[], selected=Number(options.voice??0), scope=options.scope||'pattern';
      let lengthBeats=4, counter=0;
      const add=(voice,beat,duration,velocity,pitch,probability=1)=>notes.push({id:'note-'+counter++,voice:voice.id,pitch,beat:Math.max(0,beat),duration:Math.min(duration,lengthBeats-Math.max(0,beat)),velocity,probability});
      if(id==='grain'||id==='tine') {
        const solo=s.tracks.some(track=>track.solo);
        s.tracks.forEach((track,index)=>{if(track.mute||solo&&!track.solo||scope==='voice'&&index!==selected)return;track.steps.forEach((hit,step)=>{if(hit)add(all[index],step/4+(step%2?s.swing/4:0),Math.min(.25,4-step/4-(step%2?s.swing/4:0)),hit>=2?1:.73,all[index].pitch);});});
      } else if(id==='form') {
        lengthBeats=s.steps[0].length/4;
        s.steps.forEach((steps,index)=>{if(s.muted[index]||scope==='voice'&&index!==selected)return;steps.forEach((on,step)=>{if(on){const beat=step/4+(step%2?s.swing/400:0);add(all[index],beat,Math.min(.25,lengthBeats-beat),step%4===0?1:.86,all[index].pitch);}});});
      } else if(id==='ravel') {
        const steps=s.patterns[s.selectedPattern].steps;
        steps.forEach((step,index)=>{if(!step.on)return;const at=index/4+(index%2?s.swing/8:0)+step.micro/4;for(let ratchet=0;ratchet<step.ratchet;ratchet++){const beat=Math.max(0,at+ratchet/(4*step.ratchet));if(beat<4)add(all[step.slice],beat,Math.min(step.gate/(4*step.ratchet),4-beat),step.velocity,all[step.slice].pitch+step.pitch,step.probability);}});
      } else {
        lengthBeats=Math.max(4,...s.decks.map(deck=>deck.beats));const solo=s.decks.some(deck=>deck.solo);
        s.decks.forEach((deck,index)=>{if(!s.assets[index]||deck.mute||solo&&!deck.solo)return;add(all[index],0,lengthBeats,1,all[index].pitch);});
      }
      return schema().normalize({format:'musiclab-pattern',version:1,name:s.name+' · '+NAMES[id],sourceApp:id,kind:'drums',tempo:tempoOf(s),swing:0,lengthBeats,meter:[4,4],voices:all,notes,seed:s.seed??0x5a17c0de});
    }
    function prepareEngineWrappers() {
      const audio=engine();if(!audio||audio===wrappedEngine)return;wrappedEngine=audio;
      if(typeof audio.start==='function') {
        const start=audio.start.bind(audio);
        audio.start=async (...args)=>{
          if(!state().musicLabPattern)return start(...args);
          const token=++generation;await adapter.prepare();if(token!==generation)return false;
          if(id==='grain'||id==='tine'){audio.state=args[0];audio.onStep=args[1];audio.running=true;}
          else audio.isPlaying=true;
          startPattern(typeof args[1]==='function'?args[1]:null);return true;
        };
      }
      const stopName=typeof audio.stop==='function'?'stop':null;
      if(stopName){const stop=audio.stop.bind(audio);audio.stop=(...args)=>{clearTimer();return stop(...args);};}
      if(typeof audio.panic==='function'){const panic=audio.panic.bind(audio);audio.panic=(...args)=>{clearTimer();return panic(...args);};}
    }
    function startPattern(onStep=null) {
      clearTimer();const s=viewState(),overlay=s.musicLabPattern;if(!overlay)return;
      const pattern=schema().normalize(overlay.pattern),map=validateMap(pattern,overlay.voiceMap,s);validateNotes(pattern,map,s);
      scheduledState={pattern,map,s};startTime=(engine().context||engine().audioContext).currentTime+.055;cursor=0;display=onStep;
      const draw=()=>{
        if(!scheduledState)return;const audio=engine(),context=audio.context||audio.audioContext;
        const tempo=tempoOf(viewState()),seconds=60/tempo,length=pattern.lengthBeats*seconds;
        if(context.state!=='running')return;
        const current=context.currentTime;
        let budget=0;
        while(budget++<512){
          const cycle=Math.floor(cursor/Math.max(1,pattern.notes.length)),note=pattern.notes[cursor%Math.max(1,pattern.notes.length)];if(!note)break;
          const when=startTime+cycle*length+eventBeat(pattern,note)*seconds;if(when>current+.13)break;cursor++;
          if(when<current-.03)continue;
          const rng=random((pattern.seed||0)^cycle^cursor);if(rng()>= (note.probability??1))continue;
          adapter.scheduleNote({id:'received-'+cycle+'-'+note.id,pitch:note.pitch,velocity:note.velocity,voice:map[note.voice],when,durationSeconds:Math.min(note.duration,pattern.lengthBeats-eventBeat(pattern,note))*seconds,source:'pattern'});
        }
        if(display)display(Math.floor(Math.max(0,current-startTime)/seconds*4)%16);
      };
      pattern.notes.sort((a,b)=>a.beat-b.beat);draw();timer=setInterval(draw,25);
    }
    const adapter={
      app:id,
      get patternExport(){return{scopes:[{id:'pattern',label:id==='spool'?'Deck arrangement':'Current pattern'}],defaultScope:'pattern'};},
      get patternImport(){const s=viewState();return{targets:[{id:'current',name:'Received pattern',occupied:!!s.musicLabPattern||packetFromNative(s).notes.length>0}],voices:voicesFor(s),mode:id==='spool'?'decks':'drums',description:id==='spool'?'Exact notes trigger four tape decks. Each deck is monophonic; overlapping notes need separate decks. Received patterns keep all timing and play from Play.':'Received patterns keep exact notes, velocity and timing. Drum voices retain their natural decay; Play uses the received part until Use native sequence.'};},
      get notes(){return{voices:voicesFor(viewState()),polyphonic:true,pitched:true,scheduledCancel:true};},
      validatePattern({pattern,voiceMap}={}){const s=viewState(),packet=schema().normalize(pattern),map=validateMap(packet,voiceMap,s);validateNotes(packet,map,s);return true;},
      exportPattern(options={}){return packetFromNative(viewState(),options);},
      async importPattern({pattern,options={},signal}={}){
        abort(signal);abort(options.signal);const s=viewState(),packet=schema().normalize(pattern);if(options.target!==undefined&&options.target!=='current')throw new Error('Choose the received pattern destination.');
        const map=validateMap(packet,options.voiceMap,s);validateNotes(packet,map,s);
        if(adapter.patternImport.targets[0].occupied&&options.replace!==true)throw new Error('Confirm replacing the active part before sending this pattern.');
        abort(signal);abort(options.signal);applyOverlay({pattern:packet,voiceMap:map});adapter.cancelNotes();return{app:id,target:'current',notes:packet.notes.length};
      },
      get importedPattern(){return viewState().musicLabPattern?.pattern||null;},
      getImportedPattern(){return viewState().musicLabPattern?.pattern||null;},
      clearImportedPattern(){applyOverlay(undefined);adapter.cancelNotes();},
      async prepare(){const app=native();if(app.prepare)await app.prepare();else {const audio=engine();if(audio.init)await audio.init();else await audio.resume();}prepareEngineWrappers();const audio=engine(),context=audio.context||audio.audioContext;if(context?.state==='suspended')await context.resume();const s=state();if(audio.setMasterVolume&&s.master!==undefined&&typeof s.master==='number')audio.setMasterVolume(s.master);if(audio.setEffects)audio.setEffects({drive:s.drive||0,space:s.space||0});},
      scheduleNote(note){
        const s=viewState(),index=indexOfVoice(note.voice,s),voice=voicesFor(s)[index],audio=engine();
        if(!Number.isFinite(note.when)||!Number.isFinite(note.durationSeconds)||note.durationSeconds<=0||!Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1||!Number.isFinite(note.pitch)||note.pitch<0||note.pitch>127)throw new Error('Invalid native note.');
        const options={velocity:note.velocity,pitch:note.pitch-voice.pitch,duration:note.durationSeconds,tempo:tempoOf(s),source:note.source||'loom'};
        if(options.pitch<-48||options.pitch>48)throw new Error('Note exceeds the native four-octave transpose range.');
        if(id==='form')return native().scheduleNativeNote(index,note.when,options);
        return audio.scheduleNativeNote(id==='grain'||id==='tine'?s.tracks[index]:index,note.when,options);
      },
      cancelNotes(options={}){if(options.source===undefined||options.source==='pattern')clearTimer();const audio=engine();if(!audio)return;if(audio.cancelNativeNotes)audio.cancelNativeNotes(options);else if(audio.stopAll)audio.stopAll();else audio.stop();},
      panic(){clearTimer();const app=native(),audio=engine();if(!audio)return;if(app.panic)app.panic();else if(audio.panic)audio.panic();else if(app.stop)app.stop();else audio.stopAll?.();},
      async renderPattern({pattern,state:snapshot,tempo,tailSeconds=0,voiceMap:explicitMap,signal}={}){
        abort(signal);const s=clone(unwrap(snapshot)||state()),packet=schema().normalize(pattern),bpm=tempo??packet.tempo;
        if(!Number.isFinite(bpm)||bpm<5||bpm>1920||!Number.isFinite(tailSeconds)||tailSeconds<0||tailSeconds>15)throw new Error('Invalid pattern render tempo or tail.');
        const seconds=packet.lengthBeats*60/bpm;if(seconds+tailSeconds>120)throw new Error('Split this part into patterns of no more than 120 seconds including the tail.');
        const map=explicitMap?validateMap(packet,explicitMap,s):packet.voices.every(voice=>voicesFor(s).some(target=>target.id===voice.id))?nativeMap(packet,s):s.musicLabPattern?validateMap(packet,s.musicLabPattern.voiceMap,s):nativeMap(packet,s);validateNotes(packet,map,s);const rng=random(packet.seed||0x5a17c0de),available=voicesFor(s);
        const events=packet.notes.filter(note=>rng()<(note.probability??1)).map(note=>{const voice=available.find(v=>v.id===map[note.voice]);return{voice:available.indexOf(voice),at:eventBeat(packet,note)*60/bpm,duration:Math.min(note.duration,packet.lengthBeats-eventBeat(packet,note))*60/bpm,velocity:note.velocity,pitch:note.pitch-voice.pitch};});
        if(id==='grain'||id==='tine')s.bpm=bpm;else s.tempo=bpm;
        const options={durationSeconds:seconds,tailSeconds,signal,tempo:bpm};let result;
        if(id==='form'){
          if(snapshot&&native().renderNativeSnapshotEvents)result=await native().renderNativeSnapshotEvents(s,events,options);
          else result=await native().renderNativeEvents(events,options);
        }else result=await engine().renderNativeEvents(s,events,options);
        abort(signal);return{...result,name:packet.name,tempo:bpm,sourceApp:id};
      },
      startPattern,stopPattern,
      transport(clock){if(id==='spool')engine().followTransport(clock);},
    };
    window.MusicLabPatternInstrument=adapter;
    const ready=()=>{try{prepareEngineWrappers();}catch(_){}};ready();document.addEventListener('musiclab:app-ready',ready);
    return adapter;
  }
  window.MusicLabPatternDrums=Object.freeze({install});
  const declared = document.documentElement?.dataset?.musiclabApp;
  const found=IDS.find(id=>window[FACADES[id]])||(IDS.includes(declared)?declared:null)||(/\bFORM\b/.test(document.title)?'form':null);
  if(found)install(found);
})();
