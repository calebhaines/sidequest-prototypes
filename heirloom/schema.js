/* HEIRLOOM project and control vocabulary. DSP specifications are authoritative. */
(function (scope) {
  'use strict';
  const VERSION = '1.0.0', LIMITS = Object.freeze({ projectBytes: 2 * 1024 * 1024, notes: 4096, maxPatternBeats: 256 });
  const DSP = scope.createHeirloomDSP(), specifications = DSP.specifications;
  const copy = value => JSON.parse(JSON.stringify(value));
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && ['[object Object]'].includes(Object.prototype.toString.call(value));
  const number = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const cleanText = (value, fallback, max = 100) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
  const noteName = note => { const n = Math.round(number(note, 0, 127, 60)); return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n % 12] + (Math.floor(n / 12) - 1); };
  const groups = {
    aTune:'oscA', aFine:'calibration', aSaw:'oscA', aPulse:'oscA', aPulseWidth:'oscA', sync:'oscA',
    bTune:'oscB', bFine:'oscB', bSaw:'oscB', bPulse:'oscB', bTriangle:'oscB', bPulseWidth:'oscB', bLow:'oscB', bKeyboard:'oscB',
    aLevel:'mixer', bLevel:'mixer', noiseLevel:'mixer',
    filterModel:'filter', cutoff:'filter', resonance:'filter', filterEnvAmount:'filter', filterKeytrack:'filter',
    filterAttack:'filterEnv', filterDecay:'filterEnv', filterSustain:'filterEnv', filterRelease:'filterEnv',
    ampAttack:'ampEnv', ampDecay:'ampEnv', ampSustain:'ampEnv', ampRelease:'ampEnv',
    polyEnv:'polyMod', polyB:'polyMod', polyFreqA:'polyMod', polyPwA:'polyMod', polyFilter:'polyMod',
    lfoRate:'lfo', lfoTriangle:'lfo', lfoSaw:'lfo', lfoSquare:'lfo',
    wheelMix:'wheel', wheelFreqA:'wheel', wheelFreqB:'wheel', wheelPwA:'wheel', wheelPwB:'wheel', wheelFilter:'wheel', initialAmount:'wheel', modWheel:'performance',
    unison:'performance', unisonVoices:'calibration', unisonDetune:'calibration', glide:'performance', release:'performance',
    bendRange:'calibration', velocityAmount:'calibration', vintage:'calibration', volume:'performance', masterTune:'performance', lfoRange:'calibration', polyGlide:'calibration'
  };
  const labels = {
    aTune:'Frequency', aFine:'Osc A calibration', aSaw:'Saw', aPulse:'Pulse', aPulseWidth:'Pulse width', sync:'Sync A to B',
    bTune:'Frequency', bFine:'Fine tune', bSaw:'Saw', bPulse:'Pulse', bTriangle:'Triangle', bPulseWidth:'Pulse width', bLow:'Low frequency', bKeyboard:'Keyboard',
    aLevel:'Osc A', bLevel:'Osc B', noiseLevel:'White noise', filterModel:'Filter circuit', cutoff:'Cutoff', resonance:'Resonance', filterEnvAmount:'Envelope amount', filterKeytrack:'Keyboard tracking',
    filterAttack:'Attack', filterDecay:'Decay', filterSustain:'Sustain', filterRelease:'Release', ampAttack:'Attack', ampDecay:'Decay', ampSustain:'Sustain', ampRelease:'Release',
    polyEnv:'Filter envelope', polyB:'Osc B', polyFreqA:'A frequency', polyPwA:'A pulse width', polyFilter:'Filter',
    lfoRate:'Frequency', lfoTriangle:'Triangle', lfoSaw:'Saw', lfoSquare:'Square', wheelMix:'LFO / pink noise',
    wheelFreqA:'A frequency', wheelFreqB:'B frequency', wheelPwA:'A pulse width', wheelPwB:'B pulse width', wheelFilter:'Filter', initialAmount:'Initial amount', modWheel:'Mod wheel', lfoRange:'LFO range', polyGlide:'Poly glide (modern)',
    unison:'Unison', unisonVoices:'Unison voices', unisonDetune:'Unison detune', glide:'Glide', release:'Release enable', bendRange:'Bend range', velocityAmount:'Velocity → amp', vintage:'Vintage', volume:'Master volume', masterTune:'Master tune'
  };
  const units = { aTune:'st', bTune:'st', aFine:'cents', bFine:'cents', masterTune:'cents', unisonDetune:'cents', cutoff:'Hz', lfoRate:'Hz', filterEnvAmount:'oct', filterAttack:'s', filterDecay:'s', filterRelease:'s', ampAttack:'s', ampDecay:'s', ampRelease:'s', glide:'s', bendRange:'st' };
  const contours = new Set(['filterAttack','filterDecay','filterRelease','ampAttack','ampDecay','ampRelease']);
  const logarithmic = new Set(['cutoff','lfoRate','filterAttack','filterDecay','filterRelease','ampAttack','ampDecay','ampRelease']);
  const defaults = Object.freeze(copy(DSP.defaults));
  const CONTROLS = Object.freeze(Object.entries(specifications).map(([key, rule]) => {
    const numeric = typeof rule[0] === 'number', toggle = typeof rule[0] === 'boolean';
    const item = { key, label: labels[key] || key, section: groups[key] || 'calibration', type: numeric ? 'range' : toggle ? 'toggle' : 'select', default: defaults[key], unit: units[key] || '', log: logarithmic.has(key), curve: contours.has(key) ? 'contour' : logarithmic.has(key) ? 'log' : 'linear' };
    if (numeric) { item.min = rule[0]; item.max = rule[1]; item.step = ['aTune','bTune','unisonVoices','bendRange'].includes(key) ? 1 : key === 'cutoff' ? 1 : key.endsWith('Fine') || key === 'masterTune' || key === 'unisonDetune' ? .1 : .001; }
    else item.options = rule.map(value => ({ value, label: key === 'filterModel' ? value === 'ssm2040' ? 'Rev 1 / 2 · SSM' : 'Rev 3 · CEM' : String(value) }));
    if (key === 'lfoRange') item.options = [{value:'classic',label:'Classic · 0.04–20 Hz'},{value:'wide',label:'Wide · 0.022–500 Hz'}];
    if (key === 'filterKeytrack') { item.type = 'select'; item.options = [{value:0,label:'Off'},{value:.5,label:'Half'},{value:1,label:'Full'}]; }
    return Object.freeze(item);
  }));
  const controls = Object.freeze(Object.fromEntries(CONTROLS.map(item => [item.key, item])));
  function control(key, patch = defaults) {
    const d=controls[key];
    if(key==='lfoRate' && patch.lfoRange!=='wide')return {...d,min:.04,max:20};
    if(key==='aTune' || key==='bTune' && patch.bKeyboard && !patch.bLow)return {...d,displayOffset:-24};
    if(key==='bTune')return {...d,unit:'position',displayOffset:0};
    return d;
  }
  // The original manual specifies 1 ms..30 s, with knob 5 approximately 0.5 s.
  const contourA=2*Math.log(30000)-4*Math.log(500), contourB=Math.log(30000)-contourA;
  function position(key,value,patch=defaults) {
    const d=control(key,patch);if(!d || d.type!=='range')return 0;
    value=number(value,d.min,d.max,d.default);
    if(d.curve==='contour')return Math.max(0,Math.min(1,(-contourB+Math.sqrt(contourB*contourB+4*contourA*Math.log(value/.001)))/(2*contourA)));
    return d.log?Math.log(value/d.min)/Math.log(d.max/d.min):(value-d.min)/(d.max-d.min);
  }
  function valueAt(key,positionValue,patch=defaults) {
    const d=control(key,patch);if(!d || d.type!=='range')return d?.default;
    const x=number(positionValue,0,1,0);
    if(d.curve==='contour')return .001*Math.exp(contourA*x*x+contourB*x);
    return d.log?d.min*Math.pow(d.max/d.min,x):d.min+(d.max-d.min)*x;
  }
  function normalizeSynth(value = {}) { return DSP.normalize(plain(value) ? value : {}); }
  function normalizePattern(input, tempo = 108) {
    if (!plain(input)) throw new Error('Choose a valid HEIRLOOM note phrase.');
    const P = scope.MusicLabPatternSchema;
    if (!P) throw new Error('Kitchen note validation has not loaded.');
    const packet = P.normalize(input);
    if (packet.notes.length > LIMITS.notes || packet.lengthBeats > LIMITS.maxPatternBeats) throw new Error('The phrase exceeds HEIRLOOM’s note or length limit.');
    return P.normalize({ ...packet, name: cleanText(packet.name, 'Heirloom phrase', 160), sourceApp:'heirloom', kind:'notes', tempo,
      voices:[{id:'synth',name:'HEIRLOOM',pitch:60}], notes:packet.notes.map(note => ({...note,voice:'synth'})) });
  }
  function defaultPattern(tempo = 108) {
    const chords = [[48,55,60,64,67],[53,60,64,69],[45,52,60,64],[43,55,62,67]];
    return {format:'musiclab-pattern',version:1,name:'First harvest',sourceApp:'heirloom',kind:'notes',tempo,swing:0,lengthBeats:16,meter:[4,4],seed:1347571509,
      voices:[{id:'synth',name:'HEIRLOOM',pitch:60}],tags:['heirloom','five-voice','chords'],
      notes:chords.flatMap((chord,index)=>chord.map((pitch,n)=>({id:'harvest-'+index+'-'+n,voice:'synth',pitch,beat:index*4,duration:index===3?3.75:3,velocity:.8,probability:1}))) };
  }
  function defaultState() { return {version:1,name:'First harvest',tempo:108,synth:copy(defaults),pattern:defaultPattern(),view:{keyboardOctave:3,snap:.25,patternOpen:false}}; }
  function normalize(input) {
    const d=defaultState(),raw=plain(input)?input:{},tempo=number(raw.tempo,30,240,d.tempo),view=plain(raw.view)?raw.view:{};
    return {version:1,name:cleanText(raw.name,d.name),tempo,synth:normalizeSynth(raw.synth),pattern:normalizePattern(raw.pattern||d.pattern,tempo),
      view:{keyboardOctave:Math.round(number(view.keyboardOctave,0,7,3)),snap:number(view.snap,.0625,4,.25),patternOpen:view.patternOpen===true}};
  }
  function validateState(raw) {
    if (!plain(raw) || raw.version!==1 || typeof raw.name!=='string' || raw.name.length>100 || /[\u0000-\u001f\u007f]/.test(raw.name) || typeof raw.tempo!=='number' || !Number.isFinite(raw.tempo) || raw.tempo<30 || raw.tempo>240 || !plain(raw.synth) || !plain(raw.view)) throw new Error('The HEIRLOOM project contains invalid settings.');
    for (const [key,rule] of Object.entries(specifications)) {
      const value=raw.synth[key];
      if (typeof rule[0]==='number' ? typeof value!=='number' || !Number.isFinite(value) || value<rule[0] || value>rule[1] : !rule.includes(value)) throw new Error('Invalid HEIRLOOM sound setting: '+key+'.');
    }
    if (!Number.isInteger(raw.view.keyboardOctave) || raw.view.keyboardOctave<0 || raw.view.keyboardOctave>7 || typeof raw.view.patternOpen!=='boolean' || typeof raw.view.snap!=='number' || !Number.isFinite(raw.view.snap) || raw.view.snap<.0625 || raw.view.snap>4) throw new Error('The HEIRLOOM project contains invalid editor settings.');
    if (!plain(raw.pattern)) throw new Error('The HEIRLOOM note phrase is missing.');
    scope.MusicLabPatternSchema.parse(raw.pattern);
    if (raw.pattern.lengthBeats>LIMITS.maxPatternBeats || raw.pattern.notes.length>LIMITS.notes || raw.pattern.voices.length!==1 || raw.pattern.voices[0].id!=='synth' || raw.pattern.notes.some(note=>note.voice!=='synth')) throw new Error('The HEIRLOOM phrase must use its synth voice.');
    return raw;
  }
  function size(value) { const json=typeof value==='string'?value:JSON.stringify(value); if(typeof json!=='string'||new TextEncoder().encode(json).length>LIMITS.projectBytes)throw new Error('HEIRLOOM projects must fit within 2 MiB.'); return json; }
  function parseProject(input) {
    const json=size(input);let value;try {value=typeof input==='string'?JSON.parse(json):copy(input);}catch {throw new Error('Choose a valid HEIRLOOM JSON project.');}
    if (plain(value) && value.format==='loom-instrument-state') {if(value.version!==1||value.app!=='heirloom')throw new Error('Choose a HEIRLOOM instrument state.');value=value.state;}
    if (plain(value) && ('format' in value || 'state' in value)) {if(value.format!=='heirloom-project'||value.formatVersion!==1||!plain(value.state))throw new Error('Choose a HEIRLOOM version 1 project.');value=value.state;}
    validateState(value);return normalize(value);
  }
  function serialize(state) { const normalized=normalize(state);validateState(normalized);return size({format:'heirloom-project',formatVersion:1,appVersion:VERSION,state:normalized}); }
  function format(key,value,patch=defaults) {
    const d=control(key,patch);if(!d)return String(value);if(d.type==='toggle')return value?'On':'Off';if(d.type==='select')return d.options.find(o=>o.value===value)?.label||String(value);
    if(d.displayOffset)value+=d.displayOffset;
    if(d.unit==='s')return value<1?Math.round(value*1000)+' ms':Number(value.toFixed(2))+' s';
    if(d.unit==='Hz')return value>=1000?Number((value/1000).toFixed(2))+' kHz':Number(value.toFixed(value<1?3:1))+' Hz';
    if(!d.unit && d.min>=0 && d.max<=1)return Math.round(value*100)+'%';
    return Number(value.toFixed(d.step<1?1:0))+(d.unit?' '+d.unit:'');
  }
  scope.HeirloomSchema=Object.freeze({VERSION,LIMITS,CONTROLS,controls,specifications,defaults,copy,plain,number,noteName,normalizeSynth,normalizePattern,defaultPattern,defaultState,normalize,validateState,parseProject,serialize,format,control,position,valueAt});
})(typeof window==='undefined'?globalThis:window);
