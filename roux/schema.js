/* ROUX: a circular recipe whose instructions move through a musical scale. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const SCALES = { minor:[0,2,3,5,7,8,10], major:[0,2,4,5,7,9,11], dorian:[0,2,3,5,7,9,10], phrygian:[0,1,3,5,7,8,10], pentatonic:[0,3,5,7,10], harmonic:[0,2,3,5,7,8,11], chromatic:[0,1,2,3,4,5,6,7,8,9,10,11], whole:[0,2,4,6,8,10] };
  const DIVISIONS = { '1/16':.25, '1/8':.5, '1/4':1, '1/8T':1/3, '1/16T':1/6, '1/2':2, '3/8':1.5, '1/1':4 };
  const MATERIALS = ['copper','iron','ceramic','rubber'];
  const PITCH_RANGE = [12,108];
  const copy = value => JSON.parse(JSON.stringify(value));
  const num = (v,min,max,d) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max,Math.max(min,v)) : d;
  const integer = (v,min,max,d) => Math.round(num(v,min,max,d));
  const choice = (v,values,d) => values.includes(v) ? v : d;
  const bool = (v,d=false) => typeof v === 'boolean' ? v : d;
  const text = (v,d) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,90) || d : d;
  const step = (mode='note',move=0,velocity=.72) => ({mode,move,octave:0,velocity,gate:.84,probability:1,accent:false,slide:false});
  function defaultState() {
    const moves=[0,0,2,-1,0,3,-2,0,0,1,-1,0,4,-2,-2,0];
    return {version:VERSION,name:'The low simmer',tempo:112,root:36,scale:'dorian',seed:435817,swing:.12,exportBars:4,
      recipe:{length:16,division:'1/8',direction:'forward',stride:1,rotation:0,gate:.9,drift:0,
        accents:{length:5,pulses:2,rotation:0,amount:.32},slides:{length:7,pulses:2,rotation:1},
        steps:moves.map((move,i)=>step([0,8].includes(i)?'root':[4,11].includes(i)?'rest':i===7?'hold':'note',move,i%4===0?.84:.68))},
      synth:{waveform:'saw',pulseWidth:.45,oscillator:.4,sub:.72,body:.35,bodyDecay:1.8,damping:.55,material:'copper',excitation:.55,bite:.35,bodyTune:0,drive:.32,fold:.15,cutoff:1200,resonance:.25,filterType:'lowpass',glide:.09,legato:true,pitchDepth:0,pitchDecay:.055,
        amp:{attack:.006,decay:.23,sustain:.38,release:.12},filterEnv:{attack:.002,decay:.22,sustain:.05,release:.1,amount:3.5},
        lfo:{shape:'triangle',rate:1.5,sync:'free',depth:.12,target:'cutoff'}},
      master:{volume:.72,width:.2,echo:.12,division:'3/8',feedback:.3,tone:.55}};
  }
  function envelope(raw,d,filter=false) {
    const r=raw||{}, e={attack:num(r.attack,.001,3,d.attack),decay:num(r.decay,.008,5,d.decay),sustain:num(r.sustain,0,1,d.sustain),release:num(r.release,.008,5,d.release)};
    if(filter)e.amount=num(r.amount,-6,8,d.amount);return e;
  }
  function normalize(raw={}) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
    const d=defaultState(),r=raw.recipe||{},s=raw.synth||{},m=raw.master||{},a=r.accents||{},g=r.slides||{},l=s.lfo||{};
    const state={version:VERSION,name:text(raw.name,d.name),tempo:num(raw.tempo,20,240,d.tempo),root:integer(raw.root,24,60,d.root),scale:choice(raw.scale,Object.keys(SCALES),d.scale),seed:integer(raw.seed,1,0xffffffff,d.seed),swing:num(raw.swing,0,.6,d.swing),exportBars:integer(raw.exportBars,1,16,d.exportBars),
      recipe:{length:integer(r.length,1,16,d.recipe.length),division:choice(r.division,['1/16','1/8','1/4','1/8T','1/16T'],d.recipe.division),direction:choice(r.direction,['forward','reverse','pendulum'],d.recipe.direction),stride:integer(r.stride,1,8,1),rotation:integer(r.rotation,0,15,0),gate:num(r.gate,.1,1,d.recipe.gate),drift:integer(r.drift,-7,7,0),
        accents:{length:integer(a.length,1,16,5),pulses:integer(a.pulses,0,16,2),rotation:integer(a.rotation,0,15,0),amount:num(a.amount,0,.8,.32)},slides:{length:integer(g.length,1,16,7),pulses:integer(g.pulses,0,16,2),rotation:integer(g.rotation,0,15,1)},
        steps:Array.from({length:16},(_,i)=>{const v=r.steps?.[i]||{},x=d.recipe.steps[i];return {mode:choice(v.mode,['note','rest','root','hold'],x.mode),move:integer(v.move,-7,7,x.move),octave:integer(v.octave,-1,1,0),velocity:num(v.velocity,.05,1,x.velocity),gate:num(v.gate,.1,1,x.gate),probability:num(v.probability,0,1,1),accent:bool(v.accent),slide:bool(v.slide)};})},
      synth:{waveform:choice(s.waveform,['saw','square','triangle','fold'],d.synth.waveform),pulseWidth:num(s.pulseWidth,.08,.92,.45),oscillator:num(s.oscillator,0,1,.4),sub:num(s.sub,0,1,.72),body:num(s.body,0,1,.35),bodyDecay:num(s.bodyDecay,.08,8,1.8),damping:num(s.damping,0,1,.55),material:choice(s.material,MATERIALS,'copper'),excitation:num(s.excitation,0,1,.55),bite:num(s.bite,0,1,.35),bodyTune:num(s.bodyTune,-12,12,0),drive:num(s.drive,0,1,.32),fold:num(s.fold,0,1,.15),cutoff:num(s.cutoff,35,16000,1200),resonance:num(s.resonance,0,.95,.25),filterType:choice(s.filterType,['lowpass','bandpass','highpass'],'lowpass'),glide:num(s.glide,0,1.5,.09),legato:bool(s.legato,true),pitchDepth:num(s.pitchDepth,-24,24,0),pitchDecay:num(s.pitchDecay,.008,1.5,.055),amp:envelope(s.amp,d.synth.amp),filterEnv:envelope(s.filterEnv,d.synth.filterEnv,true),lfo:{shape:choice(l.shape,['triangle','sine','square','random'],'triangle'),rate:num(l.rate,.03,24,1.5),sync:choice(l.sync,['free','1/16','1/8','1/4','1/2','1/1'],'free'),depth:num(l.depth,0,1,.12),target:choice(l.target,['cutoff','body','pitch','drive','pulse'],'cutoff')}},
      master:{volume:num(m.volume,0,1,.72),width:num(m.width,0,1,.2),echo:num(m.echo,0,1,.12),division:choice(m.division,['1/16','1/8','1/4','3/8','1/2'],'3/8'),feedback:num(m.feedback,0,.82,.3),tone:num(m.tone,0,1,.55)}};
    state.recipe.accents.pulses=Math.min(state.recipe.accents.length,state.recipe.accents.pulses);
    state.recipe.slides.pulses=Math.min(state.recipe.slides.length,state.recipe.slides.pulses);
    if(raw.musicLabPattern!==undefined){const o=raw.musicLabPattern,schema=window.MusicLabPatternSchema;
      if(!schema||!o||typeof o!=='object'||!o.voiceMap||typeof o.voiceMap!=='object')throw new Error('The imported bass pattern is incomplete.');
      const pattern=schema.parse(o.pattern),voiceMap={};
      if(pattern.kind!=='notes')throw new Error('ROUX needs a pitched note pattern.');
      if(pattern.notes.some(n=>n.pitch<12||n.pitch>108))throw new Error('Imported bass notes must be between C0 and C8.');
      const starts=pattern.notes.filter(n=>n.velocity>0&&n.probability>0).map(n=>{const tick=n.beat*4;return Math.min(pattern.lengthBeats-1/1024,n.beat+(Math.abs(tick-Math.round(tick))<1e-7&&Math.round(tick)%2===1?pattern.swing/4:0));}).sort((a,b)=>a-b);
      if(starts.some((beat,i)=>i&&Math.abs(beat-starts[i-1])<1e-8))throw new Error('ROUX plays one bass line. Separate simultaneous chord notes before importing.');
      for(const v of pattern.voices){if(o.voiceMap[v.id]!=='bass')throw new Error('Map each imported voice to ROUX’s bass voice.');voiceMap[v.id]='bass';}
      if(Object.keys(o.voiceMap).some(id=>!pattern.voices.some(v=>v.id===id)))throw new Error('The imported voice map contains an unknown voice.');
      state.musicLabPattern={pattern,voiceMap};
    }
    return state;
  }
  function degreeMidi(state,degree) { const scale=SCALES[state.scale]||SCALES.minor,d=Math.round(degree),oct=Math.floor(d/scale.length),index=((d%scale.length)+scale.length)%scale.length;return Math.max(24,Math.min(96,state.root+oct*12+scale[index])); }
  function necklace(index,ring) {const length=ring.length,pulses=Math.min(length,ring.pulses),at=((index-ring.rotation)%length+length)%length;return pulses>0&&(at*pulses)%length<pulses;}
  function compileRecipe(raw,options={}) {
    const state=normalize(raw),r=state.recipe,cycles=integer(options.cycles,1,32,1),unit=DIVISIONS[r.division],span=r.direction==='pendulum'&&r.length>1?r.length*2-2:r.length,cycleBeats=span*unit,steps=[],notes=[];
    let seed=state.seed>>>0,serial=0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed=seed>>>0||1;return seed/4294967296;};
    for(let cycle=0;cycle<cycles;cycle++){
      const circuitOffset=r.drift*cycle;let degree=circuitOffset,previousCanTie=false;
      for(let k=0;k<span;k++){
        let offset=k*r.stride;if(r.direction==='pendulum'&&r.length>1){offset%=r.length*2-2;if(offset>=r.length)offset=r.length*2-2-offset;}else{offset%=r.length;if(r.direction==='reverse')offset=r.length-1-offset;}
        const index=(offset+r.rotation)%r.length,step=r.steps[index],beat=cycle*cycleBeats+k*unit+(k%2?state.swing*unit*.5:0),nextBeat=cycle*cycleBeats+(k+1)*unit+((k+1)%2?state.swing*unit*.5:0),interval=nextBeat-beat;
        if(step.mode==='root')degree=circuitOffset;else if(step.mode==='note'){degree+=step.move;while(degree>circuitOffset+14)degree-=7;while(degree<circuitOffset-7)degree+=7;}
        const pitch=degreeMidi(state,degree)+step.octave*12,accent=step.accent||necklace(cycle*span+k,r.accents),slide=step.slide||necklace(cycle*span+k,r.slides),fires=random()<step.probability;
        steps.push({index,beat,pitch:Math.max(12,Math.min(108,pitch)),mode:step.mode,accent,slide,cycle});
        const prior=notes[notes.length-1];
        if(step.mode==='hold'){if(fires&&previousCanTie&&prior&&prior.beat>=cycle*cycleBeats)prior.duration=Math.max(prior.duration,nextBeat-prior.beat);else previousCanTie=false;continue;}
        if(step.mode==='rest'||!fires){previousCanTie=false;continue;}
        const duration=Math.max(.02,interval*step.gate*r.gate),velocity=Math.min(1,step.velocity+(accent?r.accents.amount:0));
        if(slide&&previousCanTie&&prior&&prior.beat>=cycle*cycleBeats&&prior.beat+prior.duration>=beat-unit*.35)prior.duration=Math.max(prior.duration,beat-prior.beat+Math.min(.025,unit*.1));
        notes.push({id:`roux-${serial++}`,pitch:Math.max(12,Math.min(108,pitch)),beat,duration:Math.min(duration,cycle*cycleBeats+cycleBeats-beat),velocity,voice:'bass',probability:1,accent,slide});previousCanTie=true;
      }
    }
    const lengthBeats=cycles*cycleBeats;for(const note of notes)note.duration=Math.min(note.duration,lengthBeats-note.beat);
    return {notes,lengthBeats,steps};
  }
  function noteName(note) {const n=Math.round(note);return ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][((n%12)+12)%12]+(Math.floor(n/12)-1);}
  function serialize(state) {return JSON.stringify({format:'roux-project',formatVersion:1,appVersion:VERSION,state:normalize(state)},null,2);}
  function parseProject(value) {
    if(typeof value!=='string'||value.length>1024*1024)throw new Error('Choose a ROUX project smaller than 1 MB.');let p;try{p=JSON.parse(value);}catch{throw new Error('This file is not valid JSON.');}
    if(p?.format!=='roux-project'||p.formatVersion!==1||!p.state)throw new Error('This is not a ROUX project.');
    const valid=(v,x)=>Array.isArray(x)?Array.isArray(v)&&v.length===x.length&&x.every((y,i)=>valid(v[i],y)):x&&typeof x==='object'?v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(x).every(k=>valid(v[k],x[k])):typeof x==='number'?typeof v==='number'&&Number.isFinite(v):typeof v===typeof x;
    if(!valid(p.state,defaultState()))throw new Error('The ROUX recipe contains missing or invalid controls.');
    const result=normalize(p.state),same=(a,b,keys)=>Array.isArray(keys)?keys.every((x,i)=>same(a[i],b[i],x)):keys&&typeof keys==='object'?Object.keys(keys).filter(k=>k!=='name'&&k!=='version').every(k=>same(a[k],b[k],keys[k])):a===b;
    if(!same(p.state,result,defaultState()))throw new Error('The ROUX recipe contains an out-of-range control or unknown setting.');return result;
  }
  window.RouxSchema={VERSION,SCALES,DIVISIONS,MATERIALS,PITCH_RANGE,copy,step,defaultState,normalize,degreeMidi,noteName,necklace,compileRecipe,serialize,parseProject};
})();
