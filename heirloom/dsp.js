/* HEIRLOOM · five-voice analog-inspired synthesis. No measured hardware claim. */
(function(scope){
  'use strict';
  function createHeirloomDSP(){
    'use strict';
    const TAU=2*Math.PI,OS=4,VOICE_COUNT=5;
    const specifications={
      aTune:[0,48,24],aFine:[-50,50,0],aSaw:[false,true],aPulse:[false,true],aPulseWidth:[.01,.99,.5],sync:[false,true],
      bTune:[0,48,24],bFine:[0,100,7],bSaw:[false,true],bPulse:[false,true],bTriangle:[false,true],bPulseWidth:[.01,.99,.5],bLow:[false,true],bKeyboard:[false,true],
      aLevel:[0,1,.65],bLevel:[0,1,.65],noiseLevel:[0,1,0],
      filterModel:['ssm2040','cem3320'],cutoff:[20,20000,1000],resonance:[0,1,.15],filterEnvAmount:[0,8,3.5],filterKeytrack:[0,1,.5],
      filterAttack:[.001,30,.008],filterDecay:[.001,30,.5],filterSustain:[0,1,.2],filterRelease:[.001,30,.25],
      ampAttack:[.001,30,.008],ampDecay:[.001,30,.5],ampSustain:[0,1,.65],ampRelease:[.001,30,.35],
      polyEnv:[0,1,0],polyB:[0,1,0],polyFreqA:[false,true],polyPwA:[false,true],polyFilter:[false,true],
      lfoRate:[.022,500,4],lfoRange:['classic','wide'],lfoTriangle:[false,true],lfoSaw:[false,true],lfoSquare:[false,true],
      initialAmount:[0,1,0],wheelMix:[0,1,0],modWheel:[0,1,0],wheelFreqA:[false,true],wheelFreqB:[false,true],wheelPwA:[false,true],wheelPwB:[false,true],wheelFilter:[false,true],
      unison:[false,true],unisonVoices:[1,5,5],unisonDetune:[0,50,0],glide:[0,10,0],polyGlide:[false,true],release:[false,true],bendRange:[0,12,2],masterTune:[-100,100,0],velocityAmount:[0,1,0],vintage:[0,1,.2],volume:[0,1,.6]
    };
    const defaults={};
    for(const key of Object.keys(specifications)){const rule=specifications[key];defaults[key]=typeof rule[0]==='number'?rule[2]:typeof rule[0]==='boolean'?false:rule[0];}
    Object.assign(defaults,{aSaw:true,bSaw:true,bKeyboard:true,filterModel:'cem3320',lfoTriangle:true,wheelFreqA:true,wheelFreqB:true,release:true});
    const clamp=(value,min,max,fallback=min)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
    const frac=value=>value-Math.floor(value);
    const bound=value=>Number.isFinite(value)?Math.min(16,Math.max(-16,value)):0;
    const keys=Object.keys(specifications);
    function normalize(raw){
      const source=raw&&typeof raw==='object'?(raw.synth&&typeof raw.synth==='object'?raw.synth:raw):{},result={};
      for(const key of keys){const rule=specifications[key],value=source[key];result[key]=typeof rule[0]==='number'?clamp(value,rule[0],rule[1],rule[2]):typeof rule[0]==='boolean'?typeof value==='boolean'?value:defaults[key]:rule.includes(value)?value:defaults[key];}
      result.unisonVoices=Math.round(result.unisonVoices);if(result.lfoRange!=='wide')result.lfoRate=clamp(result.lfoRate,.04,20,4);return result;
    }
    function hash(value){value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return(value^(value>>>16))>>>0;}
    const signed=value=>hash(value)/2147483648-1;
    const EXP_SIZE=2048,expTable=new Float64Array(EXP_SIZE+1),powers=new Float64Array(49);
    for(let i=0;i<=EXP_SIZE;i++)expTable[i]=Math.pow(2,i/EXP_SIZE);
    for(let i=0;i<powers.length;i++)powers[i]=Math.pow(2,i-24);
    function exp2(value){const x=clamp(value,-24,24,0),octave=Math.floor(x),position=(x-octave)*EXP_SIZE,index=Math.min(EXP_SIZE-1,position|0);return powers[octave+24]*(expTable[index]+(expTable[index+1]-expTable[index])*(position-index));}
    function soft(value){if(value>=3)return 1;if(value<=-3)return-1;const square=value*value;return value*(27+square)/(27+9*square);}
    function softSlope(value){if(value>=3||value<=-3)return 0;const square=value*value,denominator=27+9*square;return(729-162*square+9*square*square)/(denominator*denominator);}
    class Noise{
      constructor(sampleRate=48000,seed=0x48454952){this.sampleRate=clamp(sampleRate,8000,768000,48000);this.seed=seed>>>0||1;this.state=new Float64Array(7);this.a=new Float64Array(6);this.b=new Float64Array(6);const a=[.99886,.99332,.969,.8665,.55,-.7616],b=[.0555179,.0750759,.153852,.3104856,.5329522,-.016898];for(let i=0;i<6;i++){this.a[i]=Math.sign(a[i])*Math.pow(Math.abs(a[i]),44100/this.sampleRate);this.b[i]=b[i]*Math.sqrt((1-this.a[i]*this.a[i])/(1-a[i]*a[i]));}this.reset();}
      reset(){this.whiteSeed=hash(this.seed^0x57484954)||1;this.pinkSeed=hash(this.seed^0x50494e4b)||1;this.state.fill(0);}
      white(){let x=this.whiteSeed;x^=x<<13;x^=x>>>17;x^=x<<5;this.whiteSeed=x>>>0;return(this.whiteSeed/2147483648)-1;}
      pink(){let x=this.pinkSeed;x^=x<<13;x^=x>>>17;x^=x<<5;this.pinkSeed=x>>>0;const white=(this.pinkSeed/2147483648)-1;let value=white*.5362+this.state[6];for(let i=0;i<6;i++){this.state[i]=this.a[i]*this.state[i]+this.b[i]*white;value+=this.state[i];}this.state[6]=white*.115926;return value*.11;}
    }
    function createNoise(sampleRate,seed){return new Noise(sampleRate,seed);}
    class Envelope{
      constructor(sampleRate=48000,params={},linear=false){this.sampleRate=sampleRate;this.value=0;this.stage=0;this.releaseStart=0;this.set(params,linear);}
      set(params={},linear=this.linear){this.linear=linear===true;this.attack=clamp(params.attack,.001,30,.008);this.decay=clamp(params.decay,.001,30,.5);this.sustain=clamp(params.sustain,0,1,.65);this.release=clamp(params.release,.001,30,.35);this.attackAsymptote=this.linear?2.2:1.3;this.attackCoefficient=Math.exp(-Math.log(this.attackAsymptote/(this.attackAsymptote-1))/(this.attack*this.sampleRate));this.decayCoefficient=Math.exp(-Math.log(1000)/(this.decay*this.sampleRate));this.releaseCoefficient=Math.exp(-Math.log(1000)/(this.release*this.sampleRate));this.attackStep=1/(this.attack*this.sampleRate);this.decayStep=(1-this.sustain)/(this.decay*this.sampleRate);this.releaseStep=this.releaseStart/(this.release*this.sampleRate);}
      gate(down){if(down)this.stage=1;else if(this.stage){this.stage=4;this.releaseStart=this.value;this.releaseStep=this.releaseStart/(this.release*this.sampleRate);}}
      process(){
        if(this.stage===1){this.value=this.attackAsymptote+(this.value-this.attackAsymptote)*this.attackCoefficient;if(this.value>=1){this.value=1;this.stage=2;}}
        else if(this.stage===2){this.value=this.sustain+(this.value-this.sustain)*this.decayCoefficient;if(this.value<=this.sustain+1e-6){this.value=this.sustain;this.stage=3;}}
        else if(this.stage===3)this.value=this.sustain+(this.value-this.sustain)*.995;
        else if(this.stage===4){this.value=this.value*this.releaseCoefficient;if(this.value<1e-7){this.value=0;this.stage=0;}}
        return this.value;
      }
      reset(){this.value=0;this.stage=0;this.releaseStart=this.releaseStep=0;}
    }
    // Causal event BLEP/BLAMP. Both natural edges and sync resets receive
    // fractional-sample corrections; oscillator phases never reset on note-on.
    class Oscillator{
      constructor(phase=0){this.io=new Float64Array(6);this.saw=this.pulse=this.triangle=0;this.phase=frac(phase);this.sawCarry=this.pulseCarry=this.triangleCarry=0;this.modulation=0;this.lastWidth=.5;}
      reset(phase=0){this.phase=frac(phase);this.sawCarry=this.pulseCarry=this.triangleCarry=0;this.modulation=0;this.lastWidth=.5;}
      _step(amplitude,time,kind){const before=1-time,current=amplitude*.5*before*before,next=-amplitude*.5*time*time;if(kind===1){this.saw+=current;this.sawCarry+=next;}else{this.pulse+=current;this.pulseCarry+=next;}}
      _slope(amplitude,time){const before=1-time;this.triangle+=amplitude*before*before*before/6;this.triangleCarry+=amplitude*time*time*time/6;}
      _pulseSegment(phase,increment,start,end,width,widthDelta){
        const relative=increment-widthDelta;if(relative===0||end<=start)return;
        const at=start-(phase-width-widthDelta*start)/relative;
        if(at>start&&at<=end)this._step(relative>0?-2:2,at,2);
      }
      _segment(phase,increment,start,end,flags,width,widthDelta){
        if(end<=start||increment<=0)return;
        const wrap=start+(1-phase)/increment;
        if(wrap<=end){if(flags&1)this._step(-2,wrap,1);if(flags&2)this._step(2,wrap,2);if(flags&4)this._slope(8*increment,wrap);}
        if(flags&2){this._pulseSegment(phase,increment,start,Math.min(end,wrap),width,widthDelta);if(wrap<end)this._pulseSegment(0,increment,wrap,end,width,widthDelta);}
        if(flags&4){const distance=.5-phase+(.5<=phase?1:0),time=start+distance/increment;if(time<=end)this._slope(-8*increment,time);}
      }
      sample(increment,width,flags,syncTime=-1){const io=this.io;io[0]=clamp(increment,0,.4,0);io[1]=clamp(width,.01,.99,.5);io[2]=flags;io[3]=syncTime;this.tick();return io[4];}
      tick(){
        let increment=this.io[0],width=this.io[1];const flags=this.io[2]|0,syncTime=this.io[3];
        const phase=this.phase,priorWidth=this.lastWidth,widthDelta=width-priorWidth;this.lastWidth=width;
        this.saw=flags&1?phase*2-1+this.sawCarry:0;this.pulse=flags&2?(phase<priorWidth?1:-1)+this.pulseCarry:0;this.triangle=flags&4?1-4*Math.abs(phase-.5)+this.triangleCarry:0;
        this.sawCarry=this.pulseCarry=this.triangleCarry=0;
        if(syncTime>=0&&syncTime<=1){
          this._segment(phase,increment,0,syncTime,flags,priorWidth,widthDelta);const at=frac(phase+increment*syncTime);
          if(flags&1)this._step(-2*at,syncTime,1);if((flags&2)&&at>=priorWidth+widthDelta*syncTime)this._step(2,syncTime,2);
          this._segment(0,increment,syncTime,1,flags,priorWidth,widthDelta);this.phase=frac(increment*(1-syncTime));
        }else{this._segment(phase,increment,0,1,flags,priorWidth,widthDelta);this.phase=frac(phase+increment);}
        this.modulation=(flags&1?(this.saw+1)*.5:0)+(flags&2?(this.pulse+1)*.5:0)+(flags&4?this.triangle:0);
        this.io[4]=this.saw+this.pulse+this.triangle;this.io[5]=this.modulation;
      }
    }
    const TAN_SIZE=4096,tanTable=new Float64Array(TAN_SIZE+1);
    for(let i=0;i<=TAN_SIZE;i++)tanTable[i]=Math.tan(Math.PI*.45*i/TAN_SIZE);
    function warp(cutoff,rate){const at=cutoff/rate*TAN_SIZE/.45,index=Math.min(TAN_SIZE-1,at|0);return tanTable[index]+(tanTable[index+1]-tanTable[index])*(at-index);}
    class Filter{
      constructor(sampleRate=48000,model='cem3320'){this.sampleRate=clamp(sampleRate,8000,768000,48000);this.io=new Float64Array(4);this.input=0;this.state=new Float64Array(4);this.state[0]=1e-9;this.model=model;this.lastCutoff=NaN;this.set(1000,.15,model);}
      set(cutoff,resonance,model=this.model){this.io[1]=clamp(cutoff,5,this.sampleRate*.43,1000);this.io[2]=clamp(resonance,0,1,.15);this.requestedModel=model;this.configure();}
      configure(){
        const nextModel=this.requestedModel==='ssm2040'?'ssm2040':'cem3320',nextCutoff=this.io[1],nextResonance=this.io[2],profileChanged=nextModel!==this.model||this.headroom===undefined;
        if(profileChanged){this.model=nextModel;this.headroom=nextModel==='ssm2040'?1.05:1.45;this.inverseHeadroom=1/this.headroom;this.bias=nextModel==='cem3320'?.035:0;this.biasZero=soft(this.bias);this.drive=nextModel==='ssm2040'?1.12:1;}
        if(nextCutoff!==this.cutoff||profileChanged){this.cutoff=nextCutoff;this.g=warp(nextCutoff,this.sampleRate);this.G=this.g/(1+this.g);this.oneMinusG=1-this.G;this.gain4=this.G*this.G*this.G*this.G;this.cellGain=this.G*this.headroom;}
        if(nextResonance!==this.resonance||profileChanged){this.resonance=nextResonance;this.feedback=(nextModel==='ssm2040'?4.65:4.5)*nextResonance*nextResonance;}
        this.denominator=1+this.feedback*this.gain4;
      }
      reset(seed=0){this.state.fill(0);this.state[0]=seed;this.input=0;}
      process(input,cutoff=this.cutoff,resonance=this.resonance){this.io[0]=input;this.io[1]=clamp(cutoff,5,this.sampleRate*.43,1000);this.io[2]=clamp(resonance,0,1,.15);this.tick();return this.io[3];}
      tick(){
        if(this.io[1]!==this.cutoff||this.io[2]!==this.resonance){this.requestedModel=this.model;this.configure();}
        const input=this.io[0],z=this.state,G=this.G,C=this.oneMinusG,S0=C*z[0],S1=C*z[1],S2=C*z[2],S3=C*z[3],k=this.feedback,I=this.inverseHeadroom,H=this.cellGain,bias=this.bias,zero=this.biasZero,scale=this.gain4,driven=input*this.drive;
        let u=(driven-k*(G*G*G*S0+G*G*S1+G*S2+S3))/this.denominator,y0=0,y1=0,y2=0,y3=0,converged=false;
        // The same two Newton passes, with shared rational-cell intermediates.
        // f=x(27+x²)/(27+9x²); f'=((x²-9)/(x²+3))²/9.
        // Reusing the denominator avoids redundant divisions in f and f'.
        for(let iteration=0;iteration<2;iteration++){
          const x0=u*I+bias;let d0;
          if(x0>=3){y0=H*(1-zero)+S0;d0=0;}else if(x0<=-3){y0=H*(-1-zero)+S0;d0=0;}else{const q=x0*x0,inverse=1/(q+3);y0=H*(x0*(q+27)*inverse/9-zero)+S0;d0=(q-9)*inverse;}
          const x1=y0*I+bias;let d1;
          if(x1>=3){y1=H*(1-zero)+S1;d1=0;}else if(x1<=-3){y1=H*(-1-zero)+S1;d1=0;}else{const q=x1*x1,inverse=1/(q+3);y1=H*(x1*(q+27)*inverse/9-zero)+S1;d1=(q-9)*inverse;}
          const x2=y1*I+bias;let d2;
          if(x2>=3){y2=H*(1-zero)+S2;d2=0;}else if(x2<=-3){y2=H*(-1-zero)+S2;d2=0;}else{const q=x2*x2,inverse=1/(q+3);y2=H*(x2*(q+27)*inverse/9-zero)+S2;d2=(q-9)*inverse;}
          const x3=y2*I+bias;let d3;
          if(x3>=3){y3=H*(1-zero)+S3;d3=0;}else if(x3<=-3){y3=H*(-1-zero)+S3;d3=0;}else{const q=x3*x3,inverse=1/(q+3);y3=H*(x3*(q+27)*inverse/9-zero)+S3;d3=(q-9)*inverse;}
          const product=d0*d1*d2*d3,derivative=scale*product*product/6561;
          const next=bound(u-(u+k*y3-driven)/(1+k*derivative));if(iteration===1)converged=next===u;u=next;
        }
        if(!converged){y0=H*(soft(u*I+bias)-zero)+S0;y1=H*(soft(y0*I+bias)-zero)+S1;y2=H*(soft(y1*I+bias)-zero)+S2;y3=H*(soft(y2*I+bias)-zero)+S3;}
        z[0]=bound(2*y0-z[0]);z[1]=bound(2*y1-z[1]);z[2]=bound(2*y2-z[2]);z[3]=bound(2*y3-z[3]);this.input=u;
        this.io[3]=y3;
      }
    }
    class Core{
      constructor(sampleRate=48000,state={},options={}){
        this.sampleRate=clamp(sampleRate,8000,192000,48000);this.osr=this.sampleRate*OS;this.maximumCutoff=Math.min(24000,this.sampleRate*.45);this.stealFrames=Math.max(1,Math.round(this.osr*.003));this.seed=(options.seed??state.seed??0x48454952)>>>0||1;
        this.p=normalize(state);this.held=new Map();this.controls={bend:[],wheel:[],sustain:[]};this.globalBend=0;this.globalWheel=this.p.modWheel;this.globalSustain=false;
        this.frame=0;this.serial=0;this.stolen=0;this.peak=0;this.rms=0;this.lastOutput=0;this.dcPrevious=0;this.dcOutput=0;this.dcCoefficient=Math.exp(-TAU*5/this.sampleRate);this.smoothCoefficient=1-Math.exp(-1/(this.sampleRate*.004));
        this.noise=new Noise(this.osr,this.seed);this.lfo=new Oscillator(hash(this.seed^0x4c464f)/4294967296);this.lfoValue=0;this.whiteValue=0;this.pinkValue=0;
        this.smooth=new Float64Array(13);this.targets=this.smooth.slice();this.aaState=new Float64Array(8);this.aa=[];
        for(const q of [.5097955791,.6013448869,.8999762231,2.5629154477]){const w=TAU*this.sampleRate*.39/this.osr,c=Math.cos(w),a=Math.sin(w)/(2*q),a0=1+a;this.aa.push(new Float64Array([(1-c)*.5/a0,(1-c)/a0,(1-c)*.5/a0,-2*c/a0,(1-a)/a0]));}
        this.voices=Array.from({length:VOICE_COUNT},(_,index)=>({index,oscA:new Oscillator(),oscB:new Oscillator(),filter:new Filter(this.osr,this.p.filterModel),amp:new Envelope(this.osr),env:new Envelope(this.osr),active:false,gate:false,pitch:60,currentKey:60,targetKey:60,keyHz:261.6255653,used:0,owner:null,wheel:0,bend:0,velocity:1,lastOutput:0,pending:false,hasNote:false,correction:0,correctionLeft:0,driftA:0,driftB:0,driftRatioA:1,driftRatioB:1,calA:signed(this.seed+index*97+11),calB:signed(this.seed+index*97+23),calFilter:signed(this.seed+index*97+41),calEnv:signed(this.seed+index*97+67),driftSeed:hash(this.seed+index*97+83)||1}));
        this.setState(state);this.reset();
      }
      setState(state={}){
        const before=this.p,next=normalize(state);this.p=next;
        if(before&&before.modWheel!==next.modWheel)this.globalWheel=next.modWheel;
        this.aFlags=(next.aSaw?1:0)|(next.aPulse?2:0);this.bFlags=(next.bSaw?1:0)|(next.bPulse?2:0)|(next.bTriangle?4:0);this.lfoFlags=(next.lfoSaw?1:0)|(next.lfoSquare?2:0)|(next.lfoTriangle?4:0);
        this.aFactor=exp2((next.aTune-24)/12+(next.aFine+next.masterTune)/1200);this.bFactor=exp2((next.bTune-24)/12+(next.bFine+next.masterTune)/1200);
        this.bFixed=next.bLow?.4*exp2(Math.log2(75)*next.bTune/48):16.351597831287414*exp2(next.bTune*9/48);
        this.bFixed*=exp2((next.bFine+next.masterTune)/1200);this.lfoIncrement=next.lfoRate/this.osr;
        this.glideCoefficient=next.glide>0&&(next.unison||next.polyGlide)?1-Math.exp(-3/(next.glide*this.osr)):1;
        this.targets.set([Math.log2(next.cutoff),next.resonance,next.aLevel,next.bLevel,next.noiseLevel,next.aPulseWidth,next.bPulseWidth,next.polyEnv,next.polyB,next.filterEnvAmount,next.initialAmount,next.wheelMix,next.volume]);
        if(!before)this.smooth.set(this.targets);
        for(const voice of this.voices){
          const time=1+voice.calEnv*next.vintage*.1;
          voice.amp.set({attack:next.ampAttack*time,decay:next.ampDecay*time,sustain:next.ampSustain,release:(next.release?next.ampRelease:.004)*time},false);
          voice.env.set({attack:next.filterAttack*time,decay:next.filterDecay*time,sustain:next.filterSustain,release:(next.release?next.filterRelease:.004)*time},next.filterModel==='ssm2040');
          voice.filter.set(voice.filter.cutoff,voice.filter.resonance,next.filterModel);voice.filterFactor=exp2(voice.calFilter*next.vintage*.09);this._refreshVoice(voice);
        }
        if(before&&(before.unison!==next.unison||before.unisonVoices!==next.unisonVoices)){for(const voice of this.voices){voice.owner=null;voice.gate=false;voice.amp.gate(false);voice.env.gate(false);}if(next.unison)this._unison(false);else for(const entry of this.held.values())this._assign(this._allocate(entry),entry,false);}
      }
      setPatch(patch={}){this.setState({...this.p,...(patch.synth||patch)});}
      _matching(entry,target){return(target.source===undefined||entry.source===target.source)&&(target.channel===undefined||entry.channel===target.channel);}
      _control(kind,owner,fallback){let value=fallback,priority=-1;for(const control of this.controls[kind])if(this._matching(owner,control)){const rank=(control.source!==undefined?2:0)+(control.channel!==undefined?1:0);if(rank>=priority){value=control.value;priority=rank;}}return value;}
      _refreshVoice(voice){
        const owner=voice.owner||{source:'',channel:0};voice.bend=this._control('bend',owner,this.globalBend);voice.wheel=this._control('wheel',owner,this.globalWheel);
        voice.bendRatio=exp2(voice.bend*this.p.bendRange/12);const spread=this.p.unison&&this.p.unisonVoices>1?(voice.index/(this.p.unisonVoices-1)*2-1)*this.p.unisonDetune:0;
        voice.aCalibration=exp2((voice.calA*this.p.vintage*7+spread)/1200);voice.bCalibration=exp2((voice.calB*this.p.vintage*9+spread)/1200);
        voice.velocityGain=1-this.p.velocityAmount+this.p.velocityAmount*voice.velocity;this._cachePitch(voice);
      }
      _cachePitch(voice){const p=this.p;voice.baseA=voice.keyHz*this.aFactor*voice.aCalibration*voice.driftRatioA*voice.bendRatio;voice.baseB=(p.bLow?this.bFixed*(p.bKeyboard?exp2((voice.currentKey-60)/12):1):p.bKeyboard?voice.keyHz*this.bFactor:this.bFixed)*voice.bCalibration*voice.driftRatioB*voice.bendRatio;voice.tracking=p.filterKeytrack*(voice.currentKey-60)/12;}
      _pedal(entry){if(this.globalSustain)return true;return this._control('sustain',entry,false)===true;}
      _allocate(entry){
        for(const voice of this.voices)if(voice.pitch===entry.pitch&&voice.owner&&voice.owner.source===entry.source&&voice.owner.channel===entry.channel)return voice;
        let best=null;for(const voice of this.voices)if(!voice.gate&&(!best||voice.used<best.used))best=voice;
        if(best)return best;best=this.voices[0];for(const voice of this.voices)if(voice.used<best.used)best=voice;return best;
      }
      _assign(voice,entry,legato){
        const wasActive=voice.active,old=voice.owner;
        if(wasActive&&old&&old.key!==entry.key&&!(old.pitch===entry.pitch&&old.source===entry.source&&old.channel===entry.channel)&&!this.p.unison){if(voice.gate)this.stolen++;voice.pending=true;}
        voice.owner=entry;voice.pitch=entry.pitch;voice.velocity=entry.velocity;voice.used=++this.serial;voice.targetKey=entry.pitch;
        if(!voice.hasNote||this.glideCoefficient===1){voice.currentKey=entry.pitch;voice.keyHz=440*exp2((entry.pitch-69)/12);}voice.hasNote=true;
        if(!legato||!voice.amp.stage){voice.amp.gate(true);voice.env.gate(true);}voice.active=true;voice.gate=true;this._refreshVoice(voice);
      }
      _unison(legato=true){
        let selected=null;for(const entry of this.held.values())if(!selected||entry.pitch<selected.pitch||entry.pitch===selected.pitch&&entry.order<selected.order)selected=entry;
        for(const voice of this.voices){if(selected&&voice.index<this.p.unisonVoices){if(voice.owner!==selected||!voice.gate)this._assign(voice,selected,legato&&voice.gate);}else if(voice.gate){voice.gate=false;voice.amp.gate(false);voice.env.gate(false);}}
      }
      noteOn(event={}){
        const pitch=Math.round(clamp(event.pitch??event.note,0,127,60)),velocity=clamp(event.velocity,0,1,1);if(velocity===0){this.noteOff(event);return;}
        const source=String(event.source??'keyboard'),channel=Math.round(clamp(event.channel,0,15,0)),id=String(event.id??pitch),key=source+'\u0000'+channel+'\u0000'+id;
        const hadNotes=this.held.size>0;for(const entry of this.held.values())if(entry.key===key||entry.pitch===pitch&&entry.source===source&&entry.channel===channel)this._release(entry);
        if(this.held.size>=256){const oldest=this.held.values().next().value;this._release(oldest);}
        const entry={id,key,pitch,velocity,source,channel,keyDown:true,order:++this.serial};this.held.set(key,entry);
        if(this.p.unison)this._unison(hadNotes);else this._assign(this._allocate(entry),entry,false);
      }
      _release(entry,immediate=false){
        this.held.delete(entry.key);
        if(this.p.unison)return;
        for(const voice of this.voices)if(voice.owner===entry){voice.gate=false;if(immediate){voice.amp.reset();voice.env.reset();voice.active=false;voice.lastOutput=0;voice.filter.reset(1e-8);}else{voice.amp.gate(false);voice.env.gate(false);}}
      }
      noteOff(event={}){
        for(const entry of this.held.values())if(this._matching(entry,event)&&(event.id!==undefined?entry.id===String(event.id):event.pitch===undefined||entry.pitch===Math.round(event.pitch))){entry.keyDown=false;if(!this._pedal(entry))this._release(entry);}
        if(this.p.unison)this._unison(true);
      }
      _setControl(kind,event,value){
        if(event.source===undefined&&event.channel===undefined){if(kind==='bend')this.globalBend=value;else if(kind==='wheel')this.globalWheel=value;else this.globalSustain=value;}
        else{const list=this.controls[kind];let control=list.find(item=>item.source===event.source&&item.channel===event.channel);if(!control){if(list.length>=256)list.shift();control={source:event.source,channel:event.channel,value};list.push(control);}else control.value=value;}
        if(kind==='sustain'){for(const entry of this.held.values())if(!entry.keyDown&&!this._pedal(entry))this._release(entry);if(this.p.unison)this._unison(true);}
        else for(const voice of this.voices)this._refreshVoice(voice);
      }
      sustain(event={}){this._setControl('sustain',event,event.down===true);}
      pitchBend(event={}){this._setControl('bend',event,clamp(event.value,-1,1,0));}
      modWheel(event={}){this._setControl('wheel',event,clamp(event.value,0,1,0));}
      cancelNotes(target={}){for(const entry of this.held.values())if(this._matching(entry,target))this._release(entry,target.immediate===true);if(target.immediate===true)for(const voice of this.voices)if(voice.owner&&this._matching(voice.owner,target)){voice.amp.reset();voice.env.reset();voice.active=voice.gate=false;voice.lastOutput=0;voice.filter.reset(1e-8);}if(this.p.unison)this._unison(true);if(!this.voices.some(voice=>voice.active)){this.aaState.fill(0);this.dcPrevious=this.dcOutput=0;}}
      allNotesOff(){this.cancelNotes({});}
      panic(){this.held.clear();for(const list of Object.values(this.controls))list.length=0;this.globalBend=0;this.globalWheel=this.p.modWheel;this.globalSustain=false;for(const voice of this.voices){voice.amp.reset();voice.env.reset();voice.filter.reset(1e-8);voice.active=voice.gate=voice.pending=false;voice.owner=null;voice.lastOutput=voice.correction=0;voice.correctionLeft=0;this._refreshVoice(voice);}this.aaState.fill(0);this.dcPrevious=this.dcOutput=this.lastOutput=this.peak=this.rms=0;}
      reset(){
        this.frame=0;this.serial=0;this.stolen=0;this.noise.reset();this.lfo.reset(hash(this.seed^0x4c464f)/4294967296);this.lfoValue=this.whiteValue=this.pinkValue=0;this.smooth.set(this.targets);this.panic();
        for(const voice of this.voices){voice.oscA.reset(hash(this.seed+voice.index*97+1)/4294967296);voice.oscB.reset(hash(this.seed+voice.index*97+2)/4294967296);voice.oscA.lastWidth=this.p.aPulseWidth;voice.oscB.lastWidth=this.p.bPulseWidth;voice.pitch=voice.currentKey=voice.targetKey=60;voice.keyHz=440*exp2((60-69)/12);voice.used=0;voice.hasNote=false;voice.velocity=1;voice.driftA=voice.driftB=0;voice.driftRatioA=voice.driftRatioB=1;voice.driftSeed=hash(this.seed+voice.index*97+83)||1;this._refreshVoice(voice);}
      }
      _drift(){for(const voice of this.voices){let x=voice.driftSeed;x^=x<<13;x^=x>>>17;x^=x<<5;voice.driftA+=.004*((x>>>0)/2147483648-1-voice.driftA);x^=x<<13;x^=x>>>17;x^=x<<5;voice.driftB+=.0033*((x>>>0)/2147483648-1-voice.driftB);voice.driftSeed=x>>>0;voice.driftRatioA=exp2(voice.driftA*this.p.vintage*2/1200);voice.driftRatioB=exp2(voice.driftB*this.p.vintage*2/1200);this._cachePitch(voice);}}
      _decimate(input){let value=input;for(let section=0;section<4;section++){const c=this.aa[section],at=section*2,y=c[0]*value+this.aaState[at];this.aaState[at]=c[1]*value-c[3]*y+this.aaState[at+1];this.aaState[at+1]=c[2]*value-c[4]*y;value=y;}return value;}
      process(left,right){
        if(!left||!right||left.length!==right.length)throw new Error('HEIRLOOM requires equal stereo blocks.');
        const p=this.p,s=this.smooth,targets=this.targets;let peak=0,power=0;
        for(let frame=0;frame<left.length;frame++,this.frame++){
          if((this.frame&63)===0){this._drift();if((this.frame&255)===0){for(let i=0;i<this.aaState.length;i++)if(Math.abs(this.aaState[i])<1e-24)this.aaState[i]=0;for(let i=0;i<s.length;i++)if(targets[i]===0&&Math.abs(s[i])<1e-24)s[i]=0;for(let v=0;v<VOICE_COUNT;v++)for(let i=0;i<4;i++)if(Math.abs(this.voices[v].filter.state[i])<1e-24)this.voices[v].filter.state[i]=0;}}for(let i=0;i<s.length;i++)s[i]+=this.smoothCoefficient*(targets[i]-s[i]);
          for(let voiceIndex=0;voiceIndex<VOICE_COUNT;voiceIndex++){const voice=this.voices[voiceIndex];if(!voice.active){const a=voice.baseA,b=voice.baseB;const phaseB=voice.oscB.phase+b/this.sampleRate;voice.oscB.phase=frac(phaseB);voice.oscA.phase=p.sync&&phaseB>=1?frac(a/this.sampleRate*(phaseB-1)/(b/this.sampleRate)):frac(voice.oscA.phase+a/this.sampleRate);voice.oscA.lastWidth=s[5];voice.oscB.lastWidth=s[6];}}
          let output=0;
          for(let sub=0;sub<OS;sub++){
            this.whiteValue=this.noise.white();this.pinkValue=this.noise.pink();const lfoIO=this.lfo.io;lfoIO[0]=this.lfoIncrement;lfoIO[1]=.5;lfoIO[2]=this.lfoFlags;lfoIO[3]=-1;this.lfo.tick();this.lfoValue=(p.lfoTriangle?this.lfo.triangle:0)+(p.lfoSaw?(this.lfo.saw+1)*.5:0)+(p.lfoSquare?(this.lfo.pulse+1)*.5:0);
            const wheelSource=this.lfoValue*(1-s[11])+this.pinkValue*s[11],white=this.whiteValue*s[4];let sum=0;
            for(let voiceIndex=0;voiceIndex<VOICE_COUNT;voiceIndex++){
              const voice=this.voices[voiceIndex];if(!voice.active)continue;
              if(voice.currentKey!==voice.targetKey){voice.currentKey+=this.glideCoefficient*(voice.targetKey-voice.currentKey);if(Math.abs(voice.targetKey-voice.currentKey)<1e-8)voice.currentKey=voice.targetKey;voice.keyHz=440*exp2((voice.currentKey-69)/12);this._cachePitch(voice);}
              const envelope=voice.env.process(),amp=voice.amp.process(),wheel=wheelSource*clamp(s[10]+voice.wheel,0,1,0),bBase=voice.baseB;
              const bendB=p.wheelFreqB?wheel:0,incrementB=clamp(bBase*(bendB===0?1:exp2(bendB))/this.osr,0,.4,0),syncTime=p.sync&&voice.oscB.phase+incrementB>=1?(1-voice.oscB.phase)/incrementB:-1;
              const bIO=voice.oscB.io;bIO[0]=incrementB;bIO[1]=clamp(s[6]+(p.wheelPwB?wheel*.45:0),.01,.99,.5);bIO[2]=this.bFlags;bIO[3]=-1;voice.oscB.tick();
              const b=bIO[4],poly=s[7]*envelope*4+s[8]*bIO[5]*4;
              const aBase=voice.baseA,bendA=(p.polyFreqA?poly:0)+(p.wheelFreqA?wheel:0),incrementA=clamp(aBase*(bendA===0?1:exp2(bendA))/this.osr,0,.4,0);
              const aIO=voice.oscA.io;aIO[0]=incrementA;aIO[1]=clamp(s[5]+(p.polyPwA?poly*.11:0)+(p.wheelPwA?wheel*.45:0),.01,.99,.5);aIO[2]=this.aFlags;aIO[3]=syncTime;voice.oscA.tick();const a=aIO[4];
              const tracking=voice.tracking,cutoff=clamp(exp2(s[0]+tracking+envelope*s[9]+(p.polyFilter?poly:0)+(p.wheelFilter?wheel*2:0))*voice.filterFactor,5,this.maximumCutoff,1000);
              const filterIO=voice.filter.io;filterIO[0]=(a*s[2]+b*s[3]+white)*.48;filterIO[1]=cutoff;filterIO[2]=s[1];voice.filter.tick();const filtered=filterIO[3],vca=amp;
              let value=filtered*vca*voice.velocityGain;
              if(voice.pending){voice.pending=false;voice.correction=voice.lastOutput-value;voice.correctionLeft=this.stealFrames;}
              if(voice.correctionLeft>0){value+=voice.correction*voice.correctionLeft/this.stealFrames;voice.correctionLeft--;}
              voice.lastOutput=value;sum+=value;
              if(!voice.amp.stage){voice.active=false;voice.lastOutput=0;voice.oscA.sawCarry=voice.oscA.pulseCarry=voice.oscA.triangleCarry=0;voice.oscB.sawCarry=voice.oscB.pulseCarry=voice.oscB.triangleCarry=0;}
            }
            output=this._decimate(sum*.19*s[12]);
          }
          const dc=output-this.dcPrevious+this.dcCoefficient*this.dcOutput;this.dcPrevious=output;this.dcOutput=Math.abs(dc)<1e-25?0:dc;output=bound(this.dcOutput);left[frame]=right[frame]=output;this.lastOutput=output;peak=Math.max(peak,Math.abs(output));power+=output*output;
        }
        this.peak=peak;this.rms=Math.sqrt(power/Math.max(1,left.length));
      }
      getMeters(){return {voices:this.voices.reduce((count,voice)=>count+(voice.active?1:0),0),voiceStates:this.voices.map(voice=>({index:voice.index,active:voice.active,pitch:voice.pitch,level:voice.amp.value,gate:voice.gate,phaseA:voice.oscA.phase,phaseB:voice.oscB.phase,filterEnv:voice.env.value,ampEnv:voice.amp.value})),peak:this.peak,rms:this.rms,stolen:this.stolen,lfo:this.lfoValue,whiteNoise:this.whiteValue,pinkNoise:this.pinkValue,frame:this.frame,oversampling:OS};}
      getTailTime(){return Math.min(76,Math.max(this.p.ampRelease,this.p.filterRelease)*2.5+.1);}
    }

    return {Core,defaults:Object.freeze({...defaults}),specifications,normalize,Envelope,Filter,Oscillator,createNoise,oversampling:OS,voiceCount:VOICE_COUNT};
  }
  scope.createHeirloomDSP=createHeirloomDSP;
})(typeof window==='undefined'?globalThis:window);
