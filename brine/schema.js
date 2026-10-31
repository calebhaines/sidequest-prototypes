/* BRINE project and control vocabulary. DSP specifications are authoritative. */
(function (scope) {
  'use strict';
  const VERSION = '1.0.0', LIMITS = Object.freeze({ projectBytes: 2 * 1024 * 1024, notes: 4096, maxPatternBeats: 256 });
  const DSP = scope.createBrineDSP(), specifications = DSP.specifications;
  const copy = value => JSON.parse(JSON.stringify(value));
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && ['[object Object]'].includes(Object.prototype.toString.call(value));
  const number = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const cleanText = (value, fallback, max = 100) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
  const noteName = note => { const n = Math.round(number(note, 0, 127, 60)); return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n % 12] + (Math.floor(n / 12) - 1); };
  const groups = {
    model:'calibration',range:'dco',saw:'dco',pulse:'dco',sub:'dco',pwmSource:'dco',pwmAmount:'dco',dcoLfo:'dco',subLevel:'dco',noiseLevel:'dco',
    hpf:'hpf',cutoff:'vcf',resonance:'vcf',envAmount:'vcf',envPolarity:'vcf',filterLfo:'vcf',keyTrack:'vcf',
    envAttack:'env',envDecay:'env',envSustain:'env',envRelease:'env',ampMode:'vca',ampLevel:'vca',
    lfoRate:'lfo',lfoDelay:'lfo',lfoTriggerMode:'lfo',chorus:'chorus',volume:'performance',masterTune:'performance',modWheel:'performance',bendRange:'performance',bendFilter:'performance',
    age:'calibration',chorusNoise:'calibration',chorusDrive:'calibration',chorusWidth:'calibration',velocityAmount:'calibration',glide:'calibration'
  };
  const labels = {
    model:'Circuit family',range:'Range',saw:'Saw',pulse:'Pulse',sub:'Sub oscillator',pwmSource:'PWM source',pwmAmount:'PWM amount',dcoLfo:'DCO modulation',subLevel:'Sub level',noiseLevel:'Noise',
    hpf:'High-pass filter',cutoff:'Cutoff',resonance:'Resonance',envAmount:'Envelope',envPolarity:'Envelope polarity',filterLfo:'LFO amount',keyTrack:'Keyboard tracking',
    envAttack:'Attack',envDecay:'Decay',envSustain:'Sustain',envRelease:'Release',ampMode:'VCA control',ampLevel:'VCA level',
    lfoRate:'LFO rate',lfoDelay:'LFO delay',lfoTriggerMode:'LFO trigger',chorus:'Chorus',volume:'Volume',masterTune:'Master tune',modWheel:'LFO lever',bendRange:'DCO bend',bendFilter:'VCF bend',
    age:'Analog variation',chorusNoise:'BBD noise',chorusDrive:'BBD input drive',chorusWidth:'Stereo width',velocityAmount:'Velocity → VCA',glide:'Glide'
  };
  const units={cutoff:'Hz',envAttack:'s',envDecay:'s',envRelease:'s',lfoRate:'Hz',lfoDelay:'s',masterTune:'cents',bendRange:'st',glide:'s'};
  const logarithmic=new Set(['cutoff','lfoRate','envAttack','envDecay','envRelease']);
  const defaults = Object.freeze(copy(DSP.defaults));
  const CONTROLS = Object.freeze(Object.entries(specifications).map(([key, rule]) => {
    const numeric = typeof rule[0] === 'number', toggle = typeof rule[0] === 'boolean';
    const item = { key, label: labels[key] || key, section: groups[key] || 'calibration', type: numeric ? 'range' : toggle ? 'toggle' : 'select', default: defaults[key], unit: units[key] || '', log: logarithmic.has(key), curve: logarithmic.has(key) ? 'log' : 'linear' };
    if (numeric) { item.min = rule[0]; item.max = rule[1]; item.step = ['bendRange'].includes(key) ? 1 : key === 'cutoff' ? 1 : key === 'masterTune' ? .1 : .001; }
    else item.options = rule.map(value=>({value,label:key==='range'?value+'′':key==='model'?value==='60'?'60 · analog envelope':'106 · later voicing':key==='pwmSource'?{manual:'Manual',lfo:'LFO',env:'Envelope'}[value]:key==='envPolarity'?value==='positive'?'+ Positive':'− Negative':key==='ampMode'?value==='env'?'Envelope':'Gate':key==='chorus'?value==='off'?'Off':value:String(value)}));
    if(['envAttack','envDecay','envRelease'].includes(key))item.step=.00001;
    return Object.freeze(item);
  }));
  const controls = Object.freeze(Object.fromEntries(CONTROLS.map(item => [item.key, item])));
  function control(key,patch=defaults) {
    const d=controls[key];
    if(key==='lfoRate')return {...d,min:patch.model==='106'?.1:.3,max:patch.model==='106'?30:20};
    if(key==='lfoDelay')return {...d,min:0,max:patch.model==='106'?3:1.5};
    if(['envAttack','envDecay','envRelease'].includes(key))return {...d,min:patch.model==='106'?.0015:key==='envRelease'?.002:.001};
    if(key==='hpf')return {...d,label:'HPF position',unit:'position',displayScale:3,step:1/3};
    if(key==='chorus' && patch.model==='106')return {...d,options:d.options.filter(item=>item.value!=='I+II')};
    if(key==='pwmSource' && patch.model==='106')return {...d,options:d.options.filter(item=>item.value!=='env')};
    return d;
  }
  function position(key,value,patch=defaults) {
    const d=control(key,patch);if(!d||d.type!=='range')return 0;
    value=number(value,d.min,d.max,d.default);
    return d.log?Math.log(value/d.min)/Math.log(d.max/d.min):(value-d.min)/(d.max-d.min);
  }
  function valueAt(key,positionValue,patch=defaults) {
    const d=control(key,patch);if(!d||d.type!=='range')return d?.default;
    const x=number(positionValue,0,1,0);
    return d.log?d.min*Math.pow(d.max/d.min,x):d.min+(d.max-d.min)*x;
  }
  const ARP_LIMITS=Object.freeze({minRate:1.5,maxRate:50});
  function defaultArp(){return {enabled:false,mode:'up',range:1,rate:6,hold:false};}
  function normalizeArp(raw={}){const d=defaultArp(),v=plain(raw)?raw:{};return {enabled:v.enabled===true,mode:['up','down','updown'].includes(v.mode)?v.mode:d.mode,range:Math.round(number(v.range,1,3,d.range)),rate:number(v.rate,ARP_LIMITS.minRate,ARP_LIMITS.maxRate,d.rate),hold:v.hold===true};}
  function normalizeSynth(value = {}) { return DSP.normalize(plain(value) ? value : {}); }
  function normalizePattern(input, tempo = 108) {
    if (!plain(input)) throw new Error('Choose a valid BRINE note phrase.');
    const P = scope.MusicLabPatternSchema;
    if (!P) throw new Error('Kitchen note validation has not loaded.');
    const packet = P.normalize(input);
    if (packet.notes.length > LIMITS.notes || packet.lengthBeats > LIMITS.maxPatternBeats) throw new Error('The phrase exceeds BRINE’s note or length limit.');
    return P.normalize({ ...packet, name: cleanText(packet.name, 'Brine phrase', 160), sourceApp:'brine', kind:'notes', tempo,
      voices:[{id:'synth',name:'BRINE',pitch:60}], notes:packet.notes.map(note => ({...note,voice:'synth'})) });
  }
  function defaultPattern(tempo = 108) {
    const chords = [[48,55,60,62,64,69],[53,60,64,67,69],[45,52,55,60,64],[43,55,60,62,67]];
    return {format:'musiclab-pattern',version:1,name:'Saltwater silk',sourceApp:'brine',kind:'notes',tempo,swing:0,lengthBeats:16,meter:[4,4],seed:1347571509,
      voices:[{id:'synth',name:'BRINE',pitch:60}],tags:['brine','six-voice','chords'],
      notes:chords.flatMap((chord,index)=>chord.map((pitch,n)=>({id:'salt-'+index+'-'+n,voice:'synth',pitch,beat:index*4,duration:index===3?3.75:3,velocity:.8,probability:1}))) };
  }
  function defaultState() { return {version:1,name:'Saltwater silk',tempo:108,synth:copy(defaults),arp:defaultArp(),pattern:defaultPattern(),view:{keyboardOctave:3,snap:.25,patternOpen:false}}; }
  function normalize(input) {
    const d=defaultState(),raw=plain(input)?input:{},tempo=number(raw.tempo,30,240,d.tempo),view=plain(raw.view)?raw.view:{};
    return {version:1,name:cleanText(raw.name,d.name),tempo,synth:normalizeSynth(raw.synth),arp:normalizeArp(raw.arp),pattern:normalizePattern(raw.pattern||d.pattern,tempo),
      view:{keyboardOctave:Math.round(number(view.keyboardOctave,0,7,3)),snap:number(view.snap,.0625,4,.25),patternOpen:view.patternOpen===true}};
  }
  function validateState(raw) {
    if (!plain(raw) || raw.version!==1 || typeof raw.name!=='string' || raw.name.length>100 || /[\u0000-\u001f\u007f]/.test(raw.name) || typeof raw.tempo!=='number' || !Number.isFinite(raw.tempo) || raw.tempo<30 || raw.tempo>240 || !plain(raw.synth) || !plain(raw.view)) throw new Error('The BRINE project contains invalid settings.');
    for (const [key,rule] of Object.entries(specifications)) {
      const value=raw.synth[key];
      if (typeof rule[0]==='number' ? typeof value!=='number' || !Number.isFinite(value) || value<rule[0] || value>rule[1] : !rule.includes(value)) throw new Error('Invalid BRINE sound setting: '+key+'.');
    }
    if (!Number.isInteger(raw.view.keyboardOctave) || raw.view.keyboardOctave<0 || raw.view.keyboardOctave>7 || typeof raw.view.patternOpen!=='boolean' || typeof raw.view.snap!=='number' || !Number.isFinite(raw.view.snap) || raw.view.snap<.0625 || raw.view.snap>4) throw new Error('The BRINE project contains invalid editor settings.');
    const a=raw.arp;
    if(!plain(a)||typeof a.enabled!=='boolean'||typeof a.hold!=='boolean'||!['up','down','updown'].includes(a.mode)||!Number.isInteger(a.range)||a.range<1||a.range>3||typeof a.rate!=='number'||!Number.isFinite(a.rate)||a.rate<ARP_LIMITS.minRate||a.rate>ARP_LIMITS.maxRate)throw new Error('The BRINE project contains invalid keyboard-arpeggiator settings.');
    if (!plain(raw.pattern)) throw new Error('The BRINE note phrase is missing.');
    scope.MusicLabPatternSchema.parse(raw.pattern);
    if (raw.pattern.lengthBeats>LIMITS.maxPatternBeats || raw.pattern.notes.length>LIMITS.notes || raw.pattern.voices.length!==1 || raw.pattern.voices[0].id!=='synth' || raw.pattern.notes.some(note=>note.voice!=='synth')) throw new Error('The BRINE phrase must use its synth voice.');
    return raw;
  }
  function size(value) { const json=typeof value==='string'?value:JSON.stringify(value); if(typeof json!=='string'||new TextEncoder().encode(json).length>LIMITS.projectBytes)throw new Error('BRINE projects must fit within 2 MiB.'); return json; }
  function parseProject(input) {
    const json=size(input);let value;try {value=typeof input==='string'?JSON.parse(json):copy(input);}catch {throw new Error('Choose a valid BRINE JSON project.');}
    if (plain(value) && value.format==='loom-instrument-state') {if(value.version!==1||value.app!=='brine')throw new Error('Choose a BRINE instrument state.');value=value.state;}
    if (plain(value) && ('format' in value || 'state' in value)) {if(value.format!=='brine-project'||value.formatVersion!==1||!plain(value.state))throw new Error('Choose a BRINE version 1 project.');value=value.state;}
    validateState(value);return normalize(value);
  }
  function serialize(state) { const normalized=normalize(state);validateState(normalized);return size({format:'brine-project',formatVersion:1,appVersion:VERSION,state:normalized}); }
  function format(key,value,patch=defaults) {
    const d=control(key,patch);if(!d)return String(value);if(d.type==='toggle')return value?'On':'Off';if(d.type==='select')return d.options.find(o=>o.value===value)?.label||String(value);
    if(key==='hpf')return (patch.model==='106'?['0 · Bass boost','1 · Flat','2 · Low cut','3 · High cut']:['0 · Flat','1 · Low cut','2 · Mid cut','3 · High cut'])[Math.round(value*3)];
    if(d.unit==='s')return value<1?Number((value*1000).toFixed(value<.01?2:1))+' ms':Number(value.toFixed(2))+' s';
    if(d.unit==='Hz')return value>=1000?Number((value/1000).toFixed(2))+' kHz':Number(value.toFixed(value<1?3:1))+' Hz';
    if(!d.unit && d.min>=0 && d.max<=1)return Math.round(value*100)+'%';
    return Number(value.toFixed(d.step<1?1:0))+(d.unit?' '+d.unit:'');
  }
  scope.BrineSchema=Object.freeze({VERSION,LIMITS,ARP_LIMITS,defaultArp,normalizeArp,CONTROLS,controls,specifications,defaults,copy,plain,number,noteName,normalizeSynth,normalizePattern,defaultPattern,defaultState,normalize,validateState,parseProject,serialize,format,control,position,valueAt});
})(typeof window==='undefined'?globalThis:window);
