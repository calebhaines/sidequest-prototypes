/* CITRUS portable projects and exact acid-bass phrases. */
(function (g) {
  'use strict';
  const VERSION='1.0.0', D=g.createCitrusDSP(), copy=v=>JSON.parse(JSON.stringify(v)), plain=v=>v&&Object.prototype.toString.call(v)==='[object Object]';
  const number=(v,a,b,d)=>typeof v==='number'&&Number.isFinite(v)?Math.max(a,Math.min(b,v)):d;
  const labels={wave:'Waveform',tune:'Tuning',cutoff:'Cutoff',resonance:'Resonance',envMod:'Envelope',decay:'Decay',accent:'Accent',volume:'Volume',quality:'Processing',slideTime:'Slide time',filterDrive:'Filter drive',drift:'Analog variation'};
  const units={tune:'cents',cutoff:'Hz',decay:'s',slideTime:'s'}, defaults=Object.freeze(copy(D.defaults));
  const CONTROLS=Object.freeze(Object.entries(D.specifications).map(([key,r])=>Object.freeze(typeof r[0]==='number'?{key,label:labels[key]||key,type:'range',min:r[0],max:r[1],default:defaults[key],step:key==='cutoff'?1:key==='tune'?.1:.001,unit:units[key]||'',log:['cutoff','decay','slideTime'].includes(key)}:{key,label:labels[key]||key,type:'select',default:defaults[key],options:r.map(value=>({value,label:value==='high'?'High · 4×':value==='eco'?'Eco · 2×':value==='saw'?'Saw':'Square'}))})));
  const controls=Object.freeze(Object.fromEntries(CONTROLS.map(v=>[v.key,v]))), control=key=>controls[key];
  const noteName=p=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((Math.round(p)%12)+12)%12]+(Math.floor(Math.round(p)/12)-1);
  function position(key,v){const c=controls[key];return c?.type==='range'?Math.max(0,Math.min(1,c.log?Math.log(Math.max(c.min,v)/c.min)/Math.log(c.max/c.min):(v-c.min)/(c.max-c.min))):0;}
  function valueAt(key,x){const c=controls[key];x=number(x,0,1,0);return c?.type==='range'?(c.log?c.min*Math.pow(c.max/c.min,x):c.min+(c.max-c.min)*x):c?.default;}
  function makeBank(bank=0){const pitches=[36,36,43,36,48,39,36,46,36,43,39,48,36,46,43,39];return {length:16,steps:pitches.map((pitch,i)=>({on:bank===0?![3,7,11].includes(i):i%4!==3,pitch:Math.max(24,Math.min(84,pitch+([0,0,7,-5,12,3,-12,5][bank]||0))),accent:[0,6,10,14].includes(i),slide:[1,4,8,14].includes(i)}))};}
  function defaultState(){return {version:1,name:'Fresh squeeze',tempo:122,synth:copy(defaults),bank:0,patterns:Array.from({length:8},(_,i)=>makeBank(i)),chainEnabled:false,chain:[{bank:0,repeats:1},{bank:1,repeats:1}],importedPattern:null};}
  function normalize(raw={}){const d=defaultState(),v=plain(raw)?raw:{};return {version:1,name:typeof v.name==='string'?v.name.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100):d.name,tempo:number(v.tempo,40,240,d.tempo),synth:D.normalize(v.synth||{}),bank:Math.round(number(v.bank,0,7,0)),patterns:Array.from({length:8},(_,i)=>{const p=v.patterns?.[i]||d.patterns[i];return {length:Math.round(number(p.length,1,16,16)),steps:Array.from({length:16},(_,j)=>{const s=p.steps?.[j]||{on:false,pitch:36,accent:false,slide:false};return {on:s.on===true,pitch:Math.round(number(s.pitch,24,84,36)),accent:s.accent===true,slide:s.slide===true};})};}),chainEnabled:v.chainEnabled===true,chain:(Array.isArray(v.chain)?v.chain:d.chain).slice(0,8).map(x=>({bank:Math.round(number(x?.bank,0,7,0)),repeats:Math.round(number(x?.repeats,1,8,1))})),importedPattern:v.importedPattern==null?null:g.MusicLabPatternSchema.parse(v.importedPattern)};}
  function pattern(state,{scope='current'}={}){
    const s=normalize(state);if(!['current','pattern','chain','native'].includes(scope))throw Error('Choose the current part, a step pattern or the chain.');
    if(scope==='current'&&s.importedPattern)return g.MusicLabPatternSchema.normalize({...s.importedPattern,tempo:s.tempo});
    const chain=scope==='chain'||scope==='current'&&s.chainEnabled, entries=chain&&s.chain.length?s.chain:[{bank:s.bank,repeats:1}],notes=[];let beat=0;
    entries.forEach((entry,chainIndex)=>{const p=s.patterns[entry.bank];for(let repeat=0;repeat<entry.repeats;repeat++){for(let step=0;step<p.length;step++){const n=p.steps[step];if(n.on)notes.push({id:'c-'+chainIndex+'-'+repeat+'-'+step,pitch:n.pitch,beat:beat+step/4,duration:.25,velocity:n.accent?1:.65,voice:'bass',probability:1,accent:n.accent,slide:n.slide});}beat+=p.length/4;}});
    return g.MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:s.name+(chain?' · chain':' · Pattern '+String.fromCharCode(65+s.bank)),sourceApp:'citrus',kind:'notes',tempo:s.tempo,swing:0,lengthBeats:Math.max(.25,beat),meter:[4,4],seed:303,voices:[{id:'bass',name:'CITRUS · acid bass',pitch:36}],notes,tags:['citrus','acid-bass']});
  }
  function validate(v){
    if(!plain(v)||v.version!==1||typeof v.name!=='string'||v.name.length>100||/[\u0000-\u001f\u007f]/.test(v.name)||typeof v.tempo!=='number'||!Number.isFinite(v.tempo)||v.tempo<40||v.tempo>240||!Number.isInteger(v.bank)||v.bank<0||v.bank>7||!plain(v.synth)||typeof v.chainEnabled!=='boolean'||!Array.isArray(v.patterns)||v.patterns.length!==8||!Array.isArray(v.chain)||v.chain.length>8)throw Error('Invalid CITRUS project settings.');
    for(const [key,r]of Object.entries(D.specifications)){const n=v.synth[key];if(typeof r[0]==='number'?typeof n!=='number'||!Number.isFinite(n)||n<r[0]||n>r[1]:!r.includes(n))throw Error('Invalid CITRUS sound setting: '+key+'.');}
    for(const p of v.patterns){if(!plain(p)||!Number.isInteger(p.length)||p.length<1||p.length>16||!Array.isArray(p.steps)||p.steps.length!==16)throw Error('Invalid CITRUS pattern.');for(const s of p.steps)if(!plain(s)||typeof s.on!=='boolean'||typeof s.accent!=='boolean'||typeof s.slide!=='boolean'||!Number.isInteger(s.pitch)||s.pitch<24||s.pitch>84)throw Error('Invalid CITRUS step.');}
    for(const e of v.chain)if(!plain(e)||!Number.isInteger(e.bank)||e.bank<0||e.bank>7||!Number.isInteger(e.repeats)||e.repeats<1||e.repeats>8)throw Error('Invalid CITRUS chain entry.');
    if(v.importedPattern!==null){const p=g.MusicLabPatternSchema.parse(v.importedPattern);if(p.voices.length!==1||p.voices[0].id!=='bass'||p.notes.some(n=>n.voice!=='bass'))throw Error('Map imported notes to CITRUS bass.');}
    return v;
  }
  function parseProject(input){let v;if(typeof input==='string'){if(new TextEncoder().encode(input).length>2*1024*1024)throw Error('CITRUS projects must fit within 2 MiB.');try{v=JSON.parse(input);}catch{throw Error('Choose a valid CITRUS JSON project.');}}else v=copy(input);
    if(v?.format==='loom-instrument-state'){if(v.version!==1||v.app!=='citrus')throw Error('Choose a CITRUS instrument state.');v=v.state;}
    if(v&&('format'in v||'state'in v)){if(v.format!=='citrus-project'||v.formatVersion!==1||!plain(v.state))throw Error('Choose a CITRUS version 1 project.');v=v.state;}
    if(new TextEncoder().encode(JSON.stringify(v)).length>2*1024*1024)throw Error('CITRUS projects must fit within 2 MiB.');validate(v);return normalize(v);
  }
  function serializeProject(s){const v=normalize(s);validate(v);const json=JSON.stringify({format:'citrus-project',formatVersion:1,appVersion:VERSION,state:v});if(new TextEncoder().encode(json).length>2*1024*1024)throw Error('CITRUS projects must fit within 2 MiB.');return json;}
  g.CitrusSchema=Object.freeze({VERSION,copy,plain,number,defaults,specifications:D.specifications,CONTROLS,controls,control,position,valueAt,noteName,defaultState,normalize,normalizeSynth:D.normalize,pattern,validateState:validate,parseProject,serializeProject,serialize:serializeProject});
})(typeof window==='undefined'?globalThis:window);
