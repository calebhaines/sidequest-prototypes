/* ROUX. The same band-limited oscillator / nonlinear waveguide core runs live and offline. */
(function(){
'use strict';
function createRouxDSP(){
 const TAU=Math.PI*2,MATERIALS={copper:{dispersion:.08,brightness:1,hardness:.64,harmonic:3,decay:1},iron:{dispersion:.025,brightness:1.2,hardness:.92,harmonic:2,decay:.88},ceramic:{dispersion:.34,brightness:1.48,hardness:1,harmonic:5,decay:.72},rubber:{dispersion:0,brightness:.46,hardness:.2,harmonic:1,decay:.44}},clamp=(n,a,b)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a)),midi=n=>440*Math.pow(2,(n-69)/12);
 function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
 class Envelope{
  constructor(sr,settings){this.sr=sr;this.settings=settings;this.age=0;this.value=0;this.releasing=false;this.origin=0;}
  trigger(settings,legato=false){this.settings=settings;if(!legato){this.age=0;this.origin=this.value;this.releasing=false;}else if(this.releasing){this.origin=this.value;this.age=0;this.releasing=false;}}
  release(){this.releasing=true;}
  tick(){const p=this.settings;if(this.releasing){this.value*=Math.exp(-8/(p.release*this.sr));}else{const t=this.age++/this.sr;if(t<p.attack)this.value=this.origin+(1-this.origin)*(t/p.attack);else this.value=p.sustain+(1-p.sustain)*Math.exp(-5*(t-p.attack)/p.decay);}return this.value;}
 }
 class Voice{
  constructor(sr,note,velocity,patch,random,source,frame,duration){this.sr=sr;this.age=0;this.phase=0;this.subPhase=0;this.frequency=midi(note);this.target=this.frequency;this.source=source;this.velocity=velocity;this.velocityTarget=velocity;this.gateUntil=frame+Math.max(1,Math.round(duration*sr));this.amp=new Envelope(sr,patch.amp);this.env=new Envelope(sr,patch.filterEnv);this.amp.trigger(patch.amp);this.env.trigger(patch.filterEnv);this.buffer=new Float32Array(Math.ceil(sr/12)+8);this.write=0;this.loopLow=0;this.dispIn=0;this.dispOut=0;this.dcIn=0;this.dcOut=0;this.ic1=0;this.ic2=0;this.ic3=0;this.ic4=0;this.cutoff=patch.cutoff;this.lastRaw=0;this.pitchAge=0;this.energy=0;this.setPatch(patch);const size=Math.max(8,Math.min(this.buffer.length-3,Math.round(sr/this.frequency))),noise=new Float32Array(size),hardness=MATERIALS[patch.material].hardness;let low=0,mean=0;for(let i=0;i<size;i++){low+=(.04+patch.bite*.8)*(.35+hardness*.65)*(random()*2-1-low);noise[i]=low;mean+=low;}mean/=size;let max=.0001;for(let i=0;i<size;i++)max=Math.max(max,Math.abs(noise[i]-mean));for(let i=0;i<size;i++)this.buffer[(this.buffer.length-size+i)%this.buffer.length]=(noise[i]-mean)/max*.55*patch.excitation;}
  setPatch(patch){this.patch=patch;this.amp.settings=patch.amp;this.env.settings=patch.filterEnv;this.glideCoefficient=patch.glide>0?1-Math.exp(-5/(patch.glide*this.sr)):1;this.pitchCoefficient=Math.exp(-6/(patch.pitchDecay*this.sr));this.dcCoefficient=Math.exp(-TAU*12/this.sr);}
  retarget(note,velocity,frame,duration){this.target=midi(note);this.velocityTarget=velocity;this.gateUntil=frame+Math.max(1,Math.round(duration*this.sr));this.amp.trigger(this.patch.amp,this.patch.legato);this.env.trigger(this.patch.filterEnv,this.patch.legato);if(!this.patch.legato){this.age=0;this.pitchAge=0;}}
  release(frame){this.gateUntil=Math.min(this.gateUntil,frame);}
  tick(frame,lfo){
   const p=this.patch;if(frame>=this.gateUntil){this.amp.release();this.env.release();}const amp=this.amp.tick(),env=this.env.tick();if(amp<1e-6&&this.amp.releasing)return 0;
   this.frequency+=(this.target-this.frequency)*this.glideCoefficient;this.velocity+=(this.velocityTarget-this.velocity)*.006;
   const modulation=p.lfo.depth*lfo,pitchMod=p.lfo.target==='pitch'?modulation*2:0,pitchSweep=p.pitchDepth*Math.pow(this.pitchCoefficient,this.pitchAge++),freq=clamp(this.frequency*Math.pow(2,(pitchMod+pitchSweep)/12),12,this.sr*.15),dt=freq/this.sr;
   this.phase=(this.phase+dt)%1;this.subPhase=(this.subPhase+dt)%1;const pulse=clamp(p.pulseWidth+(p.lfo.target==='pulse'?modulation*.35:0),.06,.94),sine=Math.sin(TAU*this.phase);let osc;
   if(p.waveform==='square'){osc=(this.phase<pulse?1:-1)+blep(this.phase,dt)-blep((this.phase-pulse+1)%1,dt);osc-=pulse*2-1;}
   else if(p.waveform==='triangle')osc=2/Math.PI*Math.asin(sine);
   else if(p.waveform==='fold')osc=Math.sin((1+p.fold*5)*sine);
   else osc=this.phase*2-1-blep(this.phase,dt);
   const material=MATERIALS[p.material],brightness=clamp((.08+.88*(1-p.damping))*material.brightness,.025,.97),groupDelay=(1-brightness)/brightness,bodyFreq=clamp(freq*Math.pow(2,p.bodyTune/12),12,this.sr*.2),delay=clamp(this.sr/bodyFreq-groupDelay,4,this.buffer.length-3);let read=this.write-delay;while(read<0)read+=this.buffer.length;const a=Math.floor(read),f=read-a,loop=this.buffer[a]*(1-f)+this.buffer[(a+1)%this.buffer.length]*f;
   this.loopLow+=brightness*(loop-this.loopLow);const disp=material.dispersion,spread=-disp*this.loopLow+this.dispIn+disp*this.dispOut;this.dispIn=this.loopLow;this.dispOut=spread;
   const feedback=Math.min(.99985,Math.pow(.001,1/(bodyFreq*p.bodyDecay*material.decay))),strike=Math.exp(-this.age/(this.sr*(.005+p.bite*.045)))*(Math.sin(TAU*this.phase*material.harmonic)+osc)*p.excitation*.055*(.3+material.hardness*.7),continuous=osc*p.excitation*.011*amp*(.5+material.hardness*.5);
   this.buffer[this.write]=Math.tanh(spread*feedback+strike+continuous);this.write=(this.write+1)%this.buffer.length;
   const bodyLevel=clamp(p.body+(p.lfo.target==='body'?modulation*.4:0),0,1),raw=osc*p.oscillator*.64+Math.sin(TAU*this.subPhase)*p.sub*.76+loop*bodyLevel*.85;
   const drive=1+clamp(p.drive+(p.lfo.target==='drive'?modulation*.3:0),0,1)*8+this.velocity*.45,folded=p.fold>0?raw*(1-p.fold*.65)+Math.sin(raw*(1+p.fold*4))*p.fold*.65:raw,input=Math.tanh(folded*drive)/Math.sqrt(drive);
   const wanted=clamp(p.cutoff*Math.pow(2,p.filterEnv.amount*env*(.48+this.velocity*.52)+(p.lfo.target==='cutoff'?modulation*3:0)),25,Math.min(18000,this.sr*.4));this.cutoff+=(wanted-this.cutoff)*.005;
   const g=Math.tan(Math.PI*this.cutoff/this.sr),k=2-1.94*p.resonance,a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2,v3=input-this.ic2,v1=a1*this.ic1+a2*v3,v2=this.ic2+a2*this.ic1+a3*v3;this.ic1=2*v1-this.ic1;this.ic2=2*v2-this.ic2;
   let filtered=p.filterType==='bandpass'?v1*.95:p.filterType==='highpass'?input-k*v1-v2:v2;
   // A second pole pair gives the low-pass its weight without an unstable feedback cascade.
   if(p.filterType==='lowpass'){const w3=filtered-this.ic4,w1=a1*this.ic3+a2*w3,w2=this.ic4+a2*this.ic3+a3*w3;this.ic3=2*w1-this.ic3;this.ic4=2*w2-this.ic4;filtered=w2;}
   const dc=filtered-this.dcIn+this.dcCoefficient*this.dcOut;this.dcIn=filtered;this.dcOut=dc;const out=dc*amp*this.velocity*.94;this.age++;this.energy+=(out*out-this.energy)*.004;return Number.isFinite(out)?out:0;
  }
 }
 class Core{
  constructor(sampleRate,state,score){this.sr=clamp(sampleRate,8000,192000);this.frame=0;this.transport=0;this.running=false;this.voice=null;this.tails=[];this.events=[];this.cancellations=[];this.seed=1;this.position=-1;this.rms=0;this.peak=0;this.frequency=0;this.waveform=new Float32Array(128);this.waveAt=0;this.echo=[new Float32Array(Math.ceil(this.sr*4)+4),new Float32Array(Math.ceil(this.sr*4)+4)];this.echoAt=0;this.echoLow=[0,0];this.volume=0;this.lfoPhase=0;this.lfoRandom=0;this.setState(state,score);this.rewind();}
  random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0||1;return this.seed/4294967296;}
  setState(state,score){const previousFrames=this.framesPerBeat;this.state=state;this.score=score||{notes:[],steps:[],lengthBeats:8};this.patch=state.synth;this.tempo=state.tempo;this.framesPerBeat=this.sr*60/this.tempo;if(previousFrames)this.transport*=this.framesPerBeat/previousFrames;this.voice?.setPatch(this.patch);this.tails.forEach(v=>v.setPatch(this.patch));if(this.running){const beat=this.transport/this.framesPerBeat;this.cycle=Math.floor(beat/this.score.lengthBeats);this.noteAt=0;while(this.noteAt<this.score.notes.length&&this.cycle*this.score.lengthBeats+this.score.notes[this.noteAt].beat<beat-1e-6)this.noteAt++;this.stepAt=0;while(this.stepAt<this.score.steps.length&&this.cycle*this.score.lengthBeats+this.score.steps[this.stepAt].beat<beat-1e-6)this.stepAt++;}}
  rewind(){this.transport=0;this.cycle=0;this.noteAt=0;this.stepAt=0;this.seed=this.state.seed>>>0||1;this.position=-1;this.lfoPhase=0;this.lfoRandom=0;this.events=this.events.filter(e=>e.source!=='native');}
  start(){this.rewind();this.running=true;}
  stop(){this.running=false;this.stopNotes('native');}
  panic(){this.running=false;this.voice=null;this.tails=[];this.events=[];this.cancellations=[];this.echo.forEach(b=>b.fill(0));this.echoLow.fill(0);this.rms=this.peak=0;this.waveform.fill(0);this.position=-1;}
  note(note,velocity,duration=.4,source='native'){
   const active=this.voice&&this.voice.source===source&&this.frame<this.voice.gateUntil&&!this.voice.amp.releasing;
   if(active){this.voice.retarget(note,velocity,this.frame,duration);return;}
   if(this.voice){this.voice.release(this.frame);this.voice.amp.settings={...this.voice.amp.settings,release:.012};this.voice.env.settings={...this.voice.env.settings,release:.012};this.tails.push(this.voice);if(this.tails.length>4)this.tails.shift();}
   this.voice=new Voice(this.sr,note,velocity,this.patch,()=>this.random(),source,this.frame,duration);
  }
  scheduleNote(note,velocity,frame,duration,source='loom'){
   frame=Math.max(this.frame,Math.round(frame));if(this.cancellations.some(c=>(!c.source||c.source===source)&&frame>=c.frame))return false;
   if(this.events.length>=8192)throw new Error('The bass note queue is full.');this.events.push({note,velocity,frame,duration,source,order:this.serial=(this.serial||0)+1});this.events.sort((a,b)=>a.frame-b.frame||a.order-b.order);return true;
  }
  stopNotes(source,frame=this.frame){frame=Math.max(this.frame,Math.round(Number.isFinite(frame)?frame:this.frame));
   if(frame>this.frame){this.events=this.events.filter(e=>(source&&e.source!==source)||e.frame<frame);if(this.cancellations.length>=256)throw new Error('The cancellation queue is full.');this.cancellations.push({source,frame});this.cancellations.sort((a,b)=>a.frame-b.frame);return;}
   this.cancellations=source?this.cancellations.filter(c=>c.source!==source):[];this.events=source?this.events.filter(e=>e.source!==source):[];if(this.voice&&(!source||this.voice.source===source))this.voice.release(this.frame);for(const v of this.tails)if(!source||v.source===source)v.release(this.frame);
  }
  sequence(){const total=this.score.lengthBeats;
   while(this.transport>=Math.round((this.cycle+1)*total*this.framesPerBeat)){this.cycle++;this.noteAt=0;this.stepAt=0;}
   while(this.stepAt<this.score.steps.length&&this.transport>=Math.round((this.cycle*total+this.score.steps[this.stepAt].beat)*this.framesPerBeat)){this.position=this.score.steps[this.stepAt++].index;}
   while(this.noteAt<this.score.notes.length&&this.transport>=Math.round((this.cycle*total+this.score.notes[this.noteAt].beat)*this.framesPerBeat)){const n=this.score.notes[this.noteAt++];this.note(n.pitch,n.velocity,n.duration*60/this.tempo,'native');}
  }
  processBlock(left,right){let sum=0,peak=0;const m=this.state.master,division={'1/16':.25,'1/8':.5,'1/4':1,'3/8':1.5,'1/2':2}[m.division]||.5,delay=Math.round(clamp(this.framesPerBeat*division,1,this.echo[0].length-2)),lfoBeats={'1/16':.25,'1/8':.5,'1/4':1,'1/2':2,'1/1':4}[this.patch.lfo.sync],rate=lfoBeats?this.tempo/60/lfoBeats:this.patch.lfo.rate;
   for(let j=0;j<left.length;j++){
    while(this.cancellations.length&&this.cancellations[0].frame<=this.frame){const c=this.cancellations.shift();this.events=this.events.filter(e=>(c.source&&e.source!==c.source)||e.frame<c.frame);if(this.voice&&(!c.source||this.voice.source===c.source))this.voice.release(this.frame);for(const v of this.tails)if(!c.source||v.source===c.source)v.release(this.frame);}
    if(this.running)this.sequence();while(this.events.length&&this.events[0].frame<=this.frame){const e=this.events.shift();this.note(e.note,e.velocity,e.duration,e.source);}
    this.lfoPhase+=rate/this.sr;if(this.lfoPhase>=1){this.lfoPhase%=1;this.lfoRandom=this.random()*2-1;}const shape=this.patch.lfo.shape,lfo=shape==='sine'?Math.sin(TAU*this.lfoPhase):shape==='square'?(this.lfoPhase<.5?1:-1):shape==='random'?this.lfoRandom:1-4*Math.abs(this.lfoPhase-.5);
    let dry=0;if(this.voice){dry+=this.voice.tick(this.frame,lfo);this.frequency=this.voice.frequency;if(this.voice.amp.releasing&&this.voice.amp.value<1e-6)this.voice=null;}for(let i=this.tails.length-1;i>=0;i--){const v=this.tails[i];dry+=v.tick(this.frame,lfo);if(v.amp.value<1e-6)this.tails.splice(i,1);}
    const ep=(this.echoAt-delay+this.echo[0].length)%this.echo[0].length,el=this.echo[0][ep],er=this.echo[1][ep],tone=.035+m.tone*.7;this.echoLow[0]+=tone*(el-this.echoLow[0]);this.echoLow[1]+=tone*(er-this.echoLow[1]);this.echo[0][this.echoAt]=Math.tanh(dry*.4+this.echoLow[1]*m.feedback);this.echo[1][this.echoAt]=Math.tanh(dry*.23+this.echoLow[0]*m.feedback);this.echoAt=(this.echoAt+1)%this.echo[0].length;
    const wetL=el*m.echo*.7,wetR=er*m.echo*.7,mid=dry+(wetL+wetR)*.5,side=(wetL-wetR)*.5*m.width;this.volume+=(m.volume-this.volume)*.002;const l=Math.tanh((mid+side)*this.volume*1.38),r=Math.tanh((mid-side)*this.volume*1.38);left[j]=Number.isFinite(l)?l:0;right[j]=Number.isFinite(r)?r:0;sum+=(l*l+r*r)*.5;peak=Math.max(peak,Math.abs(l),Math.abs(r));if(this.frame%Math.max(1,Math.floor(this.sr/320))===0)this.waveform[this.waveAt++%128]=(l+r)*.5;this.frame++;if(this.running)this.transport++;
   }
   this.rms=Math.sqrt(sum/left.length);this.peak=Math.max(peak,this.peak*.87);
  }
  getMeters(){return {position:this.position,beat:this.transport/this.framesPerBeat,rms:this.rms,peak:this.peak,frequency:this.frequency,voices:(this.voice?1:0)+this.tails.length,waveform:Array.from(this.waveform),lfo:this.lfoPhase};}
 }
 return {Core,Voice,Envelope};
}
const DSP=createRouxDSP();window.RouxDSP=DSP;
function wav(chunks,sampleRate){let frames=0;for(const c of chunks)frames+=c.length/2;const bytes=new ArrayBuffer(44+frames*4),v=new DataView(bytes),text=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};text(0,'RIFF');v.setUint32(4,36+frames*4,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,frames*4,true);let at=44;for(const c of chunks)for(const x of c){const a=Math.max(-1,Math.min(1,Number.isFinite(x)?x:0));v.setInt16(at,Math.round(a<0?a*32768:a*32767),true);at+=2;}return new Blob([bytes],{type:'audio/wav'});}
function nativeScore(state){
 if(!state.musicLabPattern)return window.RouxSchema.compileRecipe(state,{cycles:4});
 const p=state.musicLabPattern.pattern,notes=[];let seed=(p.seed??1)>>>0||1;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed=seed>>>0||1;return seed/4294967296;};
 const ordered=p.notes.map(n=>{const tick=n.beat*4,swung=Math.abs(tick-Math.round(tick))<1e-7&&Math.round(tick)%2===1,beat=Math.min(p.lengthBeats-1/1024,n.beat+(swung?p.swing/4:0));return {...n,beat,duration:Math.min(n.duration,p.lengthBeats-beat)};}).sort((a,b)=>a.beat-b.beat||a.id.localeCompare(b.id));
 for(const n of ordered){if(n.velocity<=0||random()>=n.probability)continue;notes.push({id:n.id,pitch:n.pitch,velocity:n.velocity,beat:n.beat,duration:n.duration,voice:'bass'});}
 return {notes:notes.filter(n=>n.duration>0),lengthBeats:p.lengthBeats,steps:notes.map((n,i)=>({index:i%16,beat:n.beat,pitch:n.pitch,mode:'note'}))};
}
function eventValue(v,name,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${name} is outside ROUX’s playable range.`);return v;}
class Audio{
 constructor(state){this.state=window.RouxSchema.normalize(state);this.context=null;this.node=null;this.core=null;this.isPlaying=false;this.initPromise=null;this.generation=0;this.onStatus=null;this.meters={position:-1,beat:0,rms:0,peak:0,frequency:0,waveform:[]};}
 async init(){if(this.initPromise)return this.initPromise;if(this.context){if(this.context.state==='suspended')await this.context.resume();return true;}this.initPromise=this.setup();try{return await this.initPromise;}catch(error){this.node?.disconnect();try{await this.context?.close();}catch{}this.context=null;this.node=null;this.core=null;throw error;}finally{this.initPromise=null;}}
 async setup(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('This browser does not support Web Audio.');const ctx=new AC({latencyHint:'interactive'});this.context=ctx;let worklet=false;
  try{if(ctx.audioWorklet&&window.AudioWorkletNode){const source=`${createRouxDSP.toString()}\nconst DSP=createRouxDSP();class RouxProcessor extends AudioWorkletProcessor{constructor(){super();this.core=null;this.blocks=0;this.port.onmessage=e=>{const m=e.data;if(m.type==='state'){if(this.core)this.core.setState(m.state,m.score);else{this.core=new DSP.Core(sampleRate,m.state,m.score);this.core.frame=currentFrame;}}else if(this.core){if(m.type==='start')this.core.start();if(m.type==='stop')this.core.stop();if(m.type==='panic')this.core.panic();if(m.type==='note')this.core.scheduleNote(m.note,m.velocity,m.frame,m.duration,m.source);if(m.type==='stopNotes')this.core.stopNotes(m.source,m.frame);}};}process(inputs,outputs){const o=outputs[0];if(!this.core||!o?.[0])return true;this.core.processBlock(o[0],o[1]||o[0]);if(++this.blocks%12===0)this.port.postMessage({type:'meters',meters:this.core.getMeters()});return true;}}registerProcessor('roux-bass',RouxProcessor);`;const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{await ctx.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}this.node=new AudioWorkletNode(ctx,'roux-bass',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});this.node.port.onmessage=e=>{if(e.data.type==='meters')this.meters=e.data.meters;};worklet=true;}}
  catch(error){this.onStatus?.('Using the compatible audio engine.');}
  if(!worklet){this.core=new DSP.Core(ctx.sampleRate,this.state,nativeScore(this.state));this.node=ctx.createScriptProcessor(1024,0,2);this.node.onaudioprocess=e=>{this.core.frame=Math.round(e.playbackTime*ctx.sampleRate);this.core.processBlock(e.outputBuffer.getChannelData(0),e.outputBuffer.getChannelData(1));this.meters=this.core.getMeters();};}
  this.node.connect(ctx.destination);this.command('state',{state:this.state,score:nativeScore(this.state)});await ctx.resume();return true;
 }
 command(type,data={}){if(this.core){if(type==='state')this.core.setState(data.state,data.score);if(type==='start')this.core.start();if(type==='stop')this.core.stop();if(type==='panic')this.core.panic();if(type==='note')this.core.scheduleNote(data.note,data.velocity,data.frame,data.duration,data.source);if(type==='stopNotes')this.core.stopNotes(data.source,data.frame);}else if(this.node)this.node.port.postMessage({type,...data});}
 setState(state){this.state=window.RouxSchema.normalize(state);this.command('state',{state:this.state,score:nativeScore(this.state)});}
 async start(){const g=this.generation;await this.init();if(g!==this.generation)return false;this.command('start');this.isPlaying=true;return true;}
 stop(){this.generation++;this.command('stop');this.isPlaying=false;}
 panic(){this.generation++;this.command('panic');this.isPlaying=false;this.meters={position:-1,beat:0,rms:0,peak:0,frequency:0,waveform:[]};}
 async liveNote(note=this.state.root,velocity=.8,duration=.4){const g=this.generation;await this.init();if(g!==this.generation)return false;return this.scheduleNote({note,velocity,when:this.context.currentTime,durationSeconds:duration,source:'audition'});}
 scheduleNote({voiceId='bass',note=36,velocity=.8,when,durationSeconds=.4,source='loom'}={}){if(!this.context||!this.node)throw new Error('Prepare ROUX before scheduling notes.');if(voiceId!=='bass'&&voiceId!=='0'&&voiceId!=='auto')throw new Error('Choose ROUX’s bass voice.');eventValue(note,'Pitch',12,108);eventValue(velocity,'Velocity',0,1);eventValue(durationSeconds,'Gate duration',Number.MIN_VALUE,15360);if(when!==undefined)eventValue(when,'Start time',0,Number.MAX_SAFE_INTEGER);if(typeof source!=='string'||!source.length||source.length>160)throw new Error('The scheduled bass note needs a valid source.');if(!velocity)return true;this.command('note',{note,velocity,frame:Math.round(Math.max(this.context.currentTime,when??this.context.currentTime)*this.context.sampleRate),duration:durationSeconds,source});return true;}
 stopNotes({source,when}={}){if(source!==undefined&&(typeof source!=='string'||!source.length))throw new Error('The bass cancellation source is invalid.');if(when!==undefined)eventValue(when,'Stop time',0,Number.MAX_SAFE_INTEGER);this.command('stopNotes',{source,frame:when===undefined?undefined:this.context?Math.round(Math.max(this.context.currentTime,when)*this.context.sampleRate):undefined});}
 getMeters(){return {...this.meters};}
 async renderNotes({events=[],tempo=120,lengthBeats=4,tailSeconds=2,signal,state=this.state}={}){const check=()=>{if(signal?.aborted)throw new DOMException('Bass render cancelled.','AbortError');};check();const snapshot=window.RouxSchema.normalize(state);eventValue(tempo,'Tempo',5,1920);eventValue(lengthBeats,'Pattern length',Number.MIN_VALUE,256);const tail=clampTail(tailSeconds),body=lengthBeats*60/tempo;if(body>120||body+tail>150)throw new Error('Render at most two minutes of bass plus its tail.');if(!Array.isArray(events)||events.length>4096)throw new Error('A bass render can contain at most 4096 notes.');snapshot.tempo=tempo;
  const sr=48000,core=new DSP.Core(sr,snapshot,{notes:[],steps:[],lengthBeats}),frames=Math.ceil((body+tail)*sr),chunks=[];
  for(const e of events){eventValue(e.note,'Pitch',12,108);eventValue(e.velocity,'Velocity',0,1);eventValue(e.startBeat,'Note start',0,lengthBeats);eventValue(e.durationBeats,'Note duration',Number.MIN_VALUE,256);if(e.startBeat+e.durationBeats>lengthBeats+1e-6)throw new Error('A bass note extends past its pattern.');if(e.velocity>0)core.scheduleNote(e.note,e.velocity,Math.round(e.startBeat*60/tempo*sr),e.durationBeats*60/tempo,e.source||'render');}
  for(let at=0,blocks=0;at<frames;blocks++){check();const size=Math.min(2048,frames-at),l=new Float32Array(size),r=new Float32Array(size),pcm=new Float32Array(size*2);core.processBlock(l,r);for(let i=0;i<size;i++){pcm[i*2]=l[i];pcm[i*2+1]=r[i];}chunks.push(pcm);at+=size;if(blocks%24===0)await new Promise(resolve=>setTimeout(resolve,0));}check();return {blob:wav(chunks,sr),sampleRate:sr,tempo,sourceApp:'roux'};
 }
 async renderWav(bars=4,tailSeconds=2,options={}){const snapshot=window.RouxSchema.normalize(this.state),score=nativeScore(snapshot),lengthBars=Math.max(1,Math.min(16,Math.round(Number(bars)||4))),lengthBeats=lengthBars*4,events=[];
  for(let cycle=0;cycle*score.lengthBeats<lengthBeats;cycle++)for(const n of score.notes){const startBeat=cycle*score.lengthBeats+n.beat;if(startBeat>=lengthBeats)continue;events.push({note:n.pitch,velocity:n.velocity,startBeat,durationBeats:Math.min(n.duration,lengthBeats-startBeat),voiceId:'bass'});}
  const result=await this.renderNotes({events,tempo:snapshot.tempo,lengthBeats,tailSeconds,signal:options.signal,state:snapshot});return result.blob;
 }
}
function clampTail(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>30)throw new Error('Choose a bass tail between zero and 30 seconds.');return value;}
window.RouxAudio=Audio;window.RouxNativeScore=nativeScore;
})();
