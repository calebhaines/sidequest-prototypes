/* CELLAR · one high-headroom bass platform, five circuit interpretations. */
(function(scope){
  'use strict';
  const range=(key,label,min,max,step,value,unit='')=>({key,label,type:'range',min,max,step,default:value,unit});
  const select=(key,label,value,options)=>({key,label,type:'select',default:value,options:options.map(([value,label])=>({value,label}))});
  const models=[
    {id:'loadline',letter:'A',name:'Open authority',method:'Implicit plate load-line',description:'Iterative plate-current and load-line calculations provide the reference interpretation of the preamp and push-pull output stage. The clean region has room for soft and firm playing before either stage reaches its nonlinear range.',listeningNotes:'Start with the clean comparison recipe. Compare the size of a soft low note with the same note played firmly.'},
    {id:'charge',letter:'B',name:'Elastic edge',method:'Grid charge and cathode memory',description:'A separate formulation retains coupling-charge and cathode state when the stages are pushed. Its recovery follows recent overload history while using the same tone controls and cabinet as the other studies.',listeningNotes:'Raise Gain deliberately, play a hard accent, then a quieter phrase. Listen for how the driven edge recovers.'},
    {id:'feedback',letter:'C',name:'Firm grip',method:'Coupled negative-feedback solve',description:'An implicit nonlinear feedback calculation surrounds the output stage. The feedback interaction is solved with the valve response rather than applied as an unrelated compressor or moving input gain.',listeningNotes:'Compare low-string attack and how a loud held note stays defined. Match listening level with Output.'},
    {id:'adaa',letter:'D',name:'Smooth push',method:'Antiderivative nonlinear sampling',description:'An antiderivative formulation evaluates the same family of curved valve laws across sample intervals. It offers a distinct treatment of driven detail within the common bass-amplifier platform.',listeningNotes:'Try a sustained upper-register note and a hard low accent at a pushed Gain. Compare their decay and harmonic edge.'},
    {id:'reactive',letter:'E',name:'Reactive weight',method:'Transformer conductance and load state',description:'A conductance-based interpretation includes transformer and speaker-load state in the amplifier response. It explores how the driven output stage reacts to stored energy and a changing load.',listeningNotes:'Compare a short muted low note with a ringing one. Speaker load and Transformer expose the modeled interaction.'}
  ];
  const switches=[['off','Off'],['on','On']];
  const params=[
    select('model','Emulation','loadline',models.map(m=>[m.id,m.letter+' · '+m.name])),
    range('input','Input trim',-24,18,.1,0,'dB'),range('gain','Gain',0,10,.1,3),range('master','Master',0,10,.1,5),
    range('bass','Bass',0,10,.1,5),range('mid','Midrange',0,10,.1,5),range('treble','Treble',0,10,.1,5),
    select('midFreq','Mid frequency','800',[['220','1 · 220 Hz'],['450','2 · 450 Hz'],['800','3 · 800 Hz'],['1600','4 · 1.6 kHz'],['3000','5 · 3 kHz']]),
    select('ultraLow','Ultra Low','off',switches),select('ultraHigh','Ultra High','off',switches),select('pad','Input pad','off',[['off','Off · normal input'],['on','On · −15 dB']]),
    range('output','Output trim',-30,12,.1,0,'dB'),range('headroom','Extra headroom',-6,24,.1,0,'dB'),
    range('supply','Supply voltage',.8,1.2,.01,1,'×'),range('bias','Output bias',-.5,.5,.01,0),range('sag','Supply movement',0,1,.01,.2),range('feedback','Negative feedback',0,1,.01,.6),range('transformer','Transformer response',0,1,.01,.5),
    range('speakerLoad','Speaker load',0,1,.01,.5),range('speakerDrive','Speaker breakup',0,1,.01,0),select('cabinet','Cabinet','810',[['810','Sealed 8 × 10'],['di','DI · external cabinet']]),
    range('mic','Mic position',0,1,.01,.4),range('distance','Mic distance',0,1,.01,.2),range('air','Air',0,1,.01,.2),
    select('stereo','Amp routing','mono',[['mono','Mono · one bass rig'],['stereo','Stereo · independent paths']]),select('trim','Comparison trim','matched',[['matched','Matched · fixed clean-level trim'],['raw','Raw model level']]),select('quality','Nonlinear quality','high',[['high','High · 4×'],['eco','Economy · 2×']])
  ];
  const defaults=Object.assign(Object.fromEntries(params.map(p=>[p.key,p.default])),{mix:1,bypass:false});
  const recipe=(id,name,description,patch={})=>({id,name,description,params:{...defaults,...patch}});
  const clean={input:0,gain:3,master:5,bass:5,mid:5,treble:5,midFreq:'800',ultraLow:'off',ultraHigh:'off',pad:'off',headroom:0,speakerDrive:0,trim:'matched',quality:'high'};
  scope.LoomSVTCatalog=[{
    id:'cellar',name:'CELLAR',subtitle:'Deep foundations. Room for the whole note.',inspiration:'Ampeg SVT-CL platform · 300 W / six 6550 output valves',color:'#87958c',accent:'#e0ccb0',visual:'svt',panel:'svt',mixLabel:'Blend',
    description:'A bass rig with ample clean headroom, five circuit studies, Gain and Master controls, five mid frequencies and an 8 × 10 cabinet. Switch A–E while keeping your settings, compare soft and firm playing, then unfold the circuit and microphone controls to shape the response.',
    params,defaults,models,references:[{name:'Ampeg SVT-CL owner manual',url:'https://ampeg.com/pdf/SVTCL_OM.pdf'},{name:'Ampeg SVT-CL official product',url:'https://ampeg.com/products/classic/svtcl/'}],cabinetInactive:['speakerDrive','mic','distance','air'],diLoadModels:models.map(m=>m.id),
    groups:[
      {id:'main',section:'main',label:'At the bass rig',help:'Gain sets the preamp drive; Master sets the level sent toward the output section. Output is a separate software listening trim after the rig. Select one of five mid frequencies, then cut or boost it with Midrange. Ultra Low and Ultra High are switched voicings. The pad gives a fixed −15 dB of input attenuation for a hot instrument. The SVT-CL manual specifies Bass ±12 dB at 40 Hz, Mid +10/−20 dB at the selected frequency and Treble +15/−20 dB at 4 kHz. Ultra Low combines a small 40 Hz lift with a 500 Hz cut; Ultra High adds an 8 kHz lift.',keys:['model','input','gain','master','bass','mid','midFreq','treble','ultraLow','ultraHigh','pad','output','mix']},
      {id:'input',section:'advanced',label:'Touch & comparison',help:'Calibrate Input to your DI or interface. The stock virtual calibration already provides a broad clean range; Extra headroom at zero retains that starting point. Raise it for additional overload margin, or lower it deliberately to reach breakup sooner. Matched applies a fixed per-model clean-level trim. It never rides the input envelope, normalizes each note or adds a compressor or gate. Stereo processes two independent wet paths; Mono makes one bass rig. High uses 4× nonlinear processing, Economy 2×.',keys:['headroom','trim','stereo','quality']},
      {id:'circuit',section:'advanced',label:'Inside the head',help:'Supply voltage, Output bias, Supply movement and Negative feedback explore the modeled operating point and driven recovery. Transformer response changes the output interaction. These controls describe a numerical circuit interpretation; they do not turn a browser interface into a measured hardware replica. Begin at the stock values when comparing A–E, then change one control at a time.',keys:['supply','bias','sag','feedback','transformer']},
      {id:'cabinet',section:'advanced',label:'Eight tens & a microphone',help:'All five studies share an original sealed 8 × 10 cabinet model. Mic position, distance and Air set its recording perspective. Speaker breakup starts at zero for clean attack. Speaker load remains an amplifier/load control in DI; DI removes the built-in cabinet and microphone path for an external cabinet processor. The cabinet is a software interpretation, not a measured impulse response from a named physical enclosure.',keys:['cabinet','speakerLoad','speakerDrive','mic','distance','air']}
    ],
    meters:[{key:'inputDb',label:'Input peak',unit:'dBFS'},{key:'outputDb',label:'Output peak',unit:'dBFS'},{key:'inputRmsDb',label:'Input RMS',unit:'dBFS'},{key:'outputRmsDb',label:'Output RMS',unit:'dBFS'},{key:'inputCrestDb',label:'Input crest',unit:'dB'},{key:'outputCrestDb',label:'Output crest',unit:'dB'},{key:'headroomDb',label:'Power-stage margin',unit:'dB'},{key:'sagDb',label:'Supply movement',unit:'dB'}],
    presets:[
      recipe('clean-comparison','Clean comparison','A common clean starting point for all five studies. Change only A–E and compare softly and firmly played notes.',clean),
      ...models.map(m=>recipe('clean-'+m.id,m.letter+' · '+m.name,'The same clean controls as the other four comparison recipes. Only the emulation changes.',{...clean,model:m.id})),
      recipe('deep-foundation','Deep foundation','A full low register with a small mid cut and clean pick room.',{bass:6.2,mid:4.3,treble:4.7,midFreq:'450',gain:3.2,headroom:6}),
      recipe('fingerboard','Fingerboard','A focused upper midrange for articulate fingerstyle, with restrained lows.',{bass:4.4,mid:6.2,midFreq:'800',treble:5.6,gain:3.5,master:4.5}),
      recipe('pick-at-the-pass','Pick at the pass','A defined picked line with a high-mid lift and modest amp drive.',{gain:4.1,master:4.8,bass:4.6,mid:6.4,midFreq:'1600',treble:5.8,output:-2}),
      recipe('hot-active','Hot active input','The fixed input pad and extra clean margin make room for a strong active-bass signal.',{pad:'on',gain:3.5,master:5.5,headroom:9,bass:5.3,mid:5.2}),
      recipe('edge-of-cellar','Edge of Cellar','Push the preamp deliberately, then lower Output for a useful listening level. Playing still sets the input dynamics.',{model:'charge',gain:7.1,master:5.8,headroom:-3,bass:5.2,mid:5.8,midFreq:'450',treble:4.5,output:-7}),
      recipe('reactive-push','Reactive push','A driven reactive study with more transformer and speaker-load interaction.',{model:'reactive',gain:6.5,master:7,transformer:.8,speakerLoad:.75,sag:.4,output:-6}),
      recipe('wide-clean','Wide clean reserve','Extra headroom with a moderate Gain setting for an uncompressed-feeling clean passage.',{gain:3,master:5.5,headroom:18,bass:5,mid:5,treble:5}),
      recipe('direct-head','Direct head','The amplifier with its built-in cabinet and microphone path removed. Follow it with an external cabinet if desired.',{cabinet:'di',gain:3.5,master:4.5,bass:4.5,mid:5.5,midFreq:'800',headroom:6})
    ]
  }];
})(typeof window==='undefined'?globalThis:window);
