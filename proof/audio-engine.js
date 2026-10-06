/* LEAVEN — deterministic synthesis, shared by the worklet, file fallback and WAV printer. */
(function (global) {
  'use strict';
  function createProofDSP() {
    'use strict';
    const TAU = Math.PI * 2, MAX_VOICES = 24, MAX_QUEUE = 16384;
    const divisions = {'1/32':.125,'1/16':.25,'1/16T':1/6,'1/8':.5,'1/8T':1/3,'1/4':1,'1/4T':2/3};
    const tableNames = ['glass','hollow','choir','reed','spectrum','bell'];
    const limits = [1,2,4,8,16,32,64], tableSize = 1024;
    const clamp = (v,a,b,d=a) => Number.isFinite(v) ? Math.min(b,Math.max(a,v)) : d;
    const frac = v => v - Math.floor(v);
    const clone = v => JSON.parse(JSON.stringify(v || {}));
    const hash = n => { n = Math.imul(n ^ (n >>> 16), 0x7feb352d); n = Math.imul(n ^ (n >>> 15),0x846ca68b); return (n ^ (n >>> 16)) >>> 0; };
    const soft = x => { x=clamp(x,-3,3,0); const q=x*x; return x*(27+q)/(27+9*q); };
    const arp = typeof createProofArp === 'function' ? createProofArp() : null;
    let bank = null;
    function spectrum(kind,h) {
      if(kind===0)return (h===1?1:(h%2?.56:.32)/Math.pow(h,1.12))*(.6+.4*Math.cos(h*.62));
      if(kind===1)return h%2 ? (h===1?1:.75/Math.pow(h,1.2)) : 0;
      if(kind===2)return (h===1?.65:0)+(.7*Math.exp(-Math.pow((h-5)/2.2,2))+.43*Math.exp(-Math.pow((h-10)/2.5,2))+.2*Math.exp(-Math.pow((h-17)/3.1,2)))/Math.sqrt(h);
      if(kind===3)return Math.exp(-h*.032)/Math.pow(h,.86)*(h%2?1:.46);
      if(kind===4)return (1+.24*Math.cos(h*1.9))*Math.exp(-h*.014)/h;
      return h===1?1:h===2?.17:h===3?.09:h===5?.48:h===7?.22:h===11?.11:h===13?.05:0;
    }
    function buildBank() {
      if(bank)return bank;
      bank=tableNames.map((_,kind)=>limits.map(limit=>{
        const data=new Float32Array(tableSize+1);let weight=0;
        for(let h=1;h<=limit;h++){const amount=spectrum(kind,h);weight+=Math.abs(amount);if(!amount)continue;for(let j=0;j<tableSize;j++)data[j]+=Math.sin(TAU*h*j/tableSize)*amount;}
        // A stable normalization across mips keeps high notes from jumping in level.
        const gain=kind===2?.85:kind===5?.7:.7;
        for(let j=0;j<tableSize;j++)data[j]*=gain;data[tableSize]=data[0];return data;
      }));return bank;
    }
    function blep(t,dt) {
      if(t<dt){const p=t/dt;return p+p-p*p-1;}
      if(t>1-dt){const p=(t-1)/dt;return p*p+p+p+1;}return 0;
    }
    function blamp(t,dt) {
      if(t<dt){const x=1-t/dt;return x*x*x/3;}
      if(t>1-dt){const x=1+(t-1)/dt;return x*x*x/3;}return 0;
    }
    function wave(p,dt,type,pw) {
      if(type==='sine')return Math.sin(TAU*p);
      if(type==='triangle')return 1-4*Math.abs(p-.5)+4*dt*(blamp(p,dt)-blamp(frac(p-.5),dt));
      if(type==='pulse'||type==='square'){return (p<pw?1:-1)+blep(p,dt)-blep(frac(p-pw),dt);}
      return p*2-1-blep(p,dt);
    }
    function table(p,harmonic,kind) {
      let mip=0;while(mip<limits.length-1&&limits[mip+1]<=harmonic)mip++;
      const data=bank[kind][mip],pos=p*tableSize,i=pos|0;return data[i]+(data[i+1]-data[i])*(pos-i);
    }
    function newEnv(){return {value:0,stage:0};}
    function advanceEnv(e,p,sr) {
      if(e.stage===0){e.value+=p.ai;if(e.value>=1){e.value=1;e.stage=1;}}
      else if(e.stage===1){e.value=p.s+(e.value-p.s)*p.dc;if(Math.abs(e.value-p.s)<.0001){e.value=p.s;e.stage=2;}}
      else if(e.stage===2)e.value+=.002*(p.s-e.value);
      else if(e.stage===3){e.value*=p.rc;if(e.value<.00001){e.value=0;e.stage=4;}}
      return e.value;
    }
    function envelope(raw,sr) {
      raw=raw||{};const a=clamp(raw.attack,.0005,10,.006),d=clamp(raw.decay,.001,12,.32),r=clamp(raw.release,.002,15,.28);
      return {ai:1/(a*sr),dc:Math.exp(-6.9/(d*sr)),s:clamp(raw.sustain,0,1,.45),rc:Math.exp(-6.9/(r*sr))};
    }
    function config(state,sr) {
      const s=state.synth||{},f=s.filter||{},l=s.lfo||{},fx=state.fx||{};
      let delayBeats=divisions[fx.delayDivision];if(!delayBeats){const m=/^(\d+)\/(\d+)(T?)$/.exec(fx.delayDivision||'3/16');delayBeats=m?Number(m[1])*4/Number(m[2])*(m[3]?2/3:1):.75;}
      const syncBeats=({'1/16T':1/6,'1/8T':1/3,'1/4T':2/3,'1/16':.25,'1/8':.5,'1/4':1,'1/2':2,'1/1':4,'1bar':4,'2/1':8,'2bar':8,'4/1':16,'4bar':16})[l.sync];
      return {model:['dco','vco','sync','fm','vector'].includes(s.model)?s.model:'dco',wave:s.wave||'saw',table:Math.max(0,tableNames.indexOf(s.table)),algorithm:s.fmAlgorithm||'cascade',filterType:f.type||'lp24',lfoShape:l.shape||'sine',lfoTarget:l.target||'cutoff',retrigger:!!l.retrigger,
        mix:clamp(s.mix,0,1,.5),sub:clamp(s.sub,0,1,.18),detune:clamp(s.detune,0,1,.12),pw:clamp(s.pulseWidth,.05,.95,.45),sync:clamp(s.sync,1,16,1),crossmod:clamp(s.crossmod,0,1,0),vector:clamp(s.vector,0,1,.35),fmRatio:clamp(s.fmRatio,.125,16,2),fmIndex:clamp(s.fmIndex,0,20,2.5),fmFeedback:clamp(s.fmFeedback,0,1,.15),glide:clamp(s.glide,0,5,0),octave:clamp(s.octave,-3,3,0),velocity:clamp(s.velocity,0,1,.6),drive:clamp(s.drive,0,1,.16),cutoff:clamp(f.cutoff,20,sr*.44,1800),resonance:clamp(f.resonance,0,1,.15),envAmount:clamp(f.envAmount,-5,5,2),keytrack:clamp(f.keytrack,0,1,.4),lfoRate:syncBeats?clamp(state.tempo,20,400,104)/(60*syncBeats):clamp(l.rate,.01,40,.45),lfoDepth:clamp(l.depth,0,1,.15),chorus:clamp(fx.chorus,0,1,.4),chorusRate:clamp(fx.chorusRate,.01,5,.3),delay:clamp(fx.delay,0,1,.18),delayFrames:clamp(delayBeats*60/clamp(state.tempo,20,400,104)*sr,16,sr*4,sr*.43),feedback:clamp(fx.feedback,0,.9,.28),space:clamp(fx.space,0,1,.15),width:clamp(fx.width,0,1.5,.85),volume:clamp(fx.volume,0,1,.72),amp:envelope(s.amp,sr),filterEnv:envelope(s.filterEnv,sr)};
    }
    function lfoValue(phase,shape,seed) {
      if(shape==='triangle')return 1-4*Math.abs(phase-.5);
      if(shape==='square')return phase<.5?1:-1;
      if(shape==='saw'||shape==='ramp')return phase*2-1;
      if(shape==='sampleHold'||shape==='samplehold'||shape==='sample-hold'||shape==='random'||shape==='hold')return (hash(seed)/2147483648)-1;
      return Math.sin(TAU*phase);
    }
    class Core {
      constructor(sr,state) {
        this.sr=clamp(sr,8000,192000,48000);this.frame=0;this.playing=false;this.clockPlaying=false;this.originFrame=0;this.originBeat=0;this.tempo=104;this.nextTick=0;this.importCursor=0;this.importCycle=0;
        this.voices=[];this.stealTails=[];this.jobs=[];this.controls=[];this.fences=new Map();this.serial=0;this.lastFrequency=0;this.lfoPhase=0;this.lfoCycle=0;this.chorusPhase=0;this.fxIndex=0;this.delayIndex=0;
        this.chorusL=new Float32Array(Math.ceil(this.sr*.055));this.chorusR=new Float32Array(this.chorusL.length);this.delayL=new Float32Array(Math.ceil(this.sr*4)+2);this.delayR=new Float32Array(this.delayL.length);this.delayToneL=0;this.delayToneR=0;
        this.room=[.0297,.0371,.0411,.0437,.0309,.0353,.0397,.0451].map((seconds,i)=>({data:new Float32Array(Math.round(this.sr*seconds)+(i%2)),at:0,tone:0}));
        this.dcInL=0;this.dcInR=0;this.dcOutL=0;this.dcOutR=0;this.dcCoeff=Math.exp(-TAU*12/this.sr);this.rms=0;this.peak=0;this.waveform=new Float32Array(128);this.waveAt=0;this.step=-1;this.chord=-1;
        this.setState(state||{});this.params=Object.assign({},this.target);this._derivedParams();buildBank();
      }
      setState(state) {
        const previousBeat=this.playing?this.beatAt(this.frame):this.originBeat;
        this.state=clone(state);this.tempo=clamp(this.state.tempo,20,400,104);this.target=config(this.state,this.sr);
        if(this.playing){this.originBeat=previousBeat;this.originFrame=this.frame;this.jobs=this.jobs.filter(e=>e.source!=='proof-arp');this._setCursor(previousBeat);}
        if(!this.params)this.params=Object.assign({},this.target);
      }
      beatAt(frame){return this.originBeat+(frame-this.originFrame)*this.tempo/(60*this.sr);}
      _frameAt(beat){return Math.round(this.originFrame+(beat-this.originBeat)*60/this.tempo*this.sr);}
      _setCursor(beat) {
        const pattern=this.state.musicLabPattern?.pattern;
        if(pattern&&Array.isArray(pattern.notes)&&pattern.lengthBeats>0){
          this.importLength=pattern.lengthBeats;this.importCycle=Math.floor(Math.max(0,beat)/this.importLength);this.importCursor=0;this._importCycleNotes();
          while(this.importCursor<this.importNotes.length&&this.importNotes[this.importCursor].startBeat<beat-1e-8)this.importCursor++;
        }else{this.importNotes=null;this.nextTick=Math.max(0,Math.floor((beat+1e-8)/(divisions[this.state.arp?.division]||.25)));}
      }
      _importCycleNotes() {
        const startBeat=this.importCycle*this.importLength;
        this.importNotes=arp?arp.events(this.state,{startBeat,lengthBeats:this.importLength}):this.state.musicLabPattern.pattern.notes.map(e=>({note:e.pitch,velocity:e.velocity,startBeat:startBeat+e.beat,durationBeats:e.duration}));
      }
      _insert(queue,event,cap) {
        if(queue.length>=cap)throw new Error('LEAVEN’s scheduled event queue is full.');
        let lo=0,hi=queue.length;while(lo<hi){const mid=(lo+hi)>>>1;if(queue[mid].frame<event.frame||(queue[mid].frame===event.frame&&(queue[mid].note??0)<=(event.note??0)))lo=mid+1;else hi=mid;}queue.splice(lo,0,event);
      }
      start({beat=0,frame=this.frame}={}) {
        const job={type:'start',beat:clamp(beat,0,1000000,0),frame:Math.max(this.frame,Math.round(clamp(frame,0,Number.MAX_SAFE_INTEGER,this.frame)))};
        if(job.frame>this.frame)this._insert(this.controls,job,256);else this._start(job);
      }
      _start(job) {
        this.stopNotes({source:'proof-arp',frame:this.frame});this.fences.delete('proof-arp');this.originBeat=job.beat;this.originFrame=job.frame;this.playing=true;this._setCursor(job.beat);
      }
      stop() {
        this.originBeat=this.beatAt(this.frame);this.originFrame=this.frame;this.playing=false;this.clockPlaying=false;this.controls=this.controls.filter(j=>j.type!=='start'&&j.type!=='transport');this.stopNotes({source:'proof-arp',frame:this.frame});this.step=-1;
      }
      panic() {
        this.playing=false;this.clockPlaying=false;this.voices.length=0;this.stealTails.length=0;this.jobs.length=0;this.controls.length=0;this.fences.clear();this.step=-1;this.chord=-1;this.lastFrequency=0;
        this.chorusL.fill(0);this.chorusR.fill(0);this.delayL.fill(0);this.delayR.fill(0);for(const r of this.room){r.data.fill(0);r.tone=0;}this.delayToneL=this.delayToneR=this.dcInL=this.dcInR=this.dcOutL=this.dcOutR=this.rms=this.peak=0;this.waveform.fill(0);
      }
      scheduleNote({note=60,velocity=.85,frame=this.frame,duration=.4,source='proof-live',step=-1,chord=-1}={}) {
        if(!Number.isFinite(note)||note<0||note>127||!Number.isFinite(velocity)||velocity<0||velocity>1||!Number.isFinite(frame)||frame<0||!Number.isFinite(duration)||duration<=0||duration>768)throw new Error('Invalid LEAVEN note or timestamp.');
        if(typeof source!=='string'||!source||source.length>200)throw new Error('Provide a valid LEAVEN note source.');
        const at=Math.max(this.frame,Math.round(frame)),fence=this.fences.get(source),all=this.fences.get('*');
        if((fence&&this.frame<fence.frame&&at>=fence.frame)||(all&&this.frame<all.frame&&at>=all.frame))return false;
        if(!velocity)return true;this._insert(this.jobs,{note,velocity,frame:at,duration:Math.max(1,Math.round(duration*this.sr)),source,step,chord},MAX_QUEUE);return true;
      }
      stopNotes({source,frame=this.frame}={}) {
        if(source!==undefined&&(typeof source!=='string'||!source||source.length>200))throw new Error('Provide a valid LEAVEN cancellation source.');
        if(!Number.isFinite(frame)||frame<0)throw new Error('Provide a valid LEAVEN cancellation timestamp.');
        const at=Math.max(this.frame,Math.round(frame));this.jobs=this.jobs.filter(e=>(source&&e.source!==source)||e.frame<at);
        if(at>this.frame){if(this.fences.size>=256&&!this.fences.has(source||'*'))throw new Error('Too many pending LEAVEN cancellation sources.');this.fences.set(source||'*',{frame:at});this._insert(this.controls,{type:'cancel',source,frame:at},256);}
        else for(const v of this.voices)if(!source||v.source===source)this._release(v);
      }
      setTransport(clock={}) {
        const frame=Number.isFinite(clock.frame)?clock.frame:Number.isFinite(clock.when)?Math.round(clock.when*this.sr):this.frame;
        if(!Number.isFinite(clock.beat??clock.absoluteBeat)||!Number.isFinite(clock.tempo))throw new Error('Provide a finite LEAVEN transport beat and tempo.');
        const job={type:'transport',frame:Math.max(this.frame,Math.round(frame)),beat:clamp(clock.absoluteBeat??clock.beat,0,1000000,0),tempo:clamp(clock.tempo,20,400,104),playing:!!clock.playing,revision:clock.revision};
        if(job.frame>this.frame){this.controls=this.controls.filter(j=>j.type!=='transport'||j.frame<job.frame);this._insert(this.controls,job,256);}else this._transport(job);
      }
      _transport(job) {
        const predicted=this.beatAt(job.frame),seek=this.clockRevision!==job.revision||Math.abs(predicted-job.beat)>.03||!this.playing;
        this.clockRevision=job.revision;this.tempo=job.tempo;this.clockPlaying=job.playing;
        if(!job.playing){this.stop();this.originBeat=job.beat;this.originFrame=job.frame;return;}
        if(this.playing&&seek){this._start(job);this.fences.delete('proof-arp');}else{this.originBeat=job.beat;this.originFrame=job.frame;}
        this.target=config(Object.assign({},this.state,{tempo:this.tempo}),this.sr);
      }
      _release(v){if(v.amp.stage<3)v.amp.stage=3;if(v.filterEnv.stage<3)v.filterEnv.stage=3;}
      _note(event) {
        const p=this.params,note=event.note+p.octave*12,frequency=clamp(440*Math.pow(2,(note-69)/12),5,this.sr*.43,440),id=++this.serial;
        if(this.voices.length>=MAX_VOICES){let steal=0,score=Infinity;for(let i=0;i<this.voices.length;i++){const v=this.voices[i],s=v.amp.value+(v.amp.stage>=3?-2:0);if(s<score){score=s;steal=i;}}const old=this.voices[steal];if(old.lastL||old.lastR){if(this.stealTails.length>=8)this.stealTails.shift();this.stealTails.push({left:old.lastL||0,right:old.lastR||0,remain:64});}this.voices.splice(steal,1);}
        const phase=p.model==='vco'?hash((this.state.seed||195936478)^Math.imul(event.note,9781))/4294967296:0;
        const v={note:event.note,source:event.source,id,born:this.frame,end:this.frame+event.duration,frequency:p.glide>.001&&this.lastFrequency?this.lastFrequency:frequency,targetFrequency:frequency,baseFrequency:440*Math.pow(2,(event.note-69)/12),phase,phase2:phase,subPhase:0,fmPhases:[0,0,0,0],fmLast:0,amp:newEnv(),filterEnv:newEnv(),ic1:0,ic2:0,jc1:0,jc2:0,a1:1,a2:0,a3:0,k:2,lfoPhase:0,lfoCycle:0,velocity:(1-p.velocity)+event.velocity*p.velocity,pan:(hash(event.note^21)/4294967296-.5)*.32};
        v.panL=Math.sqrt(.5*(1-v.pan));v.panR=Math.sqrt(.5*(1+v.pan));this.voices.push(v);this.lastFrequency=frequency;if(event.step>=0)this.step=event.step;if(event.chord>=0)this.chord=event.chord;
      }
      _sequence() {
        if(!this.playing||this.frame<this.originFrame)return;
        const beat=this.beatAt(this.frame),lookahead=divisions[this.state.arp?.division]||.25;
        if(this.importNotes){
          const importAhead=32*this.tempo/(60*this.sr);let count=0;
          while(count++<MAX_QUEUE){if(this.importCursor>=this.importNotes.length){if((this.importCycle+1)*this.importLength>beat+importAhead)break;this.importCursor=0;this.importCycle++;this._importCycleNotes();if(!this.importNotes.length)continue;}
            const e=this.importNotes[this.importCursor],at=e.startBeat;if(at>beat+importAhead)break;this.importCursor++;
            if(at>=this.originBeat-1e-8)this.scheduleNote({note:e.note,velocity:e.velocity,frame:this._frameAt(at),duration:e.durationBeats*60/this.tempo,source:'proof-arp'});
          }
        }else if(arp){let count=0;while(this.nextTick*lookahead<=beat+lookahead&&count++<16){const tick=this.nextTick++,events=arp.tickEvents(this.state,tick);for(const e of events){if(e.startBeat>=this.originBeat-1e-8)this.scheduleNote({note:e.note,velocity:e.velocity,frame:this._frameAt(e.startBeat),duration:e.durationBeats*60/this.tempo,source:'proof-arp',step:e.step,chord:e.chord});}}}
      }
      _derivedParams() {const p=this.params;p.detuneFactor=Math.pow(2,p.detune*(p.model==='vco'?32:18)/1200);p.glideCoeff=p.glide>.001?1-Math.exp(-1/(p.glide*this.sr)):1;p.octaveFactor=Math.pow(2,p.octave);p.driveGain=1+p.drive*3;p.driveNormalize=1/(1+p.drive*.9);}
      _osc(v,p,dt,lfo,env) {
        let pw=clamp(p.pw+(p.lfoTarget==='pulse'?lfo*p.lfoDepth*.4:0),.05,.95,.45),value=0;
        const dt2=Math.min(.44,dt*p.detuneFactor);
        if(p.model==='dco'){
          const a=wave(v.phase,dt,p.wave,pw),b=wave(v.phase2,dt2,p.wave==='pulse'?'saw':'pulse',pw);
          value=a*(1-p.mix*.48)+b*p.mix*.48+Math.sin(TAU*v.subPhase)*p.sub*.7;
          v.phase=frac(v.phase+dt);v.phase2=frac(v.phase2+dt2);
        }else if(p.model==='vco'){
          const second=wave(v.phase2,dt2,p.wave,pw),moddt=Math.min(.44,Math.max(.00001,dt*(1+second*p.crossmod*.72)));
          value=wave(v.phase,moddt,p.wave,pw)*(1-p.mix)+second*p.mix+wave(v.subPhase,dt*.5,'triangle',.5)*p.sub*.65;
          v.phase=frac(v.phase+moddt);v.phase2=frac(v.phase2+dt2);
        }else if(p.model==='sync'){
          const slaveDt=Math.min(.48,dt*p.sync),slave=wave(v.phase2,slaveDt,p.wave,pw);
          const reset=frac(p.sync),correction=reset*blep(v.phase,dt);
          value=(slave-correction)*(1-p.mix*.22)+wave(v.phase,dt,'saw',pw)*p.mix*.22+Math.sin(TAU*v.subPhase)*p.sub*.55;
          const next=v.phase+dt;v.phase=frac(next);v.phase2=next>=1?frac((next-1)*p.sync):frac(v.phase2+slaveDt);
        }else if(p.model==='fm'){
          const phases=v.fmPhases,ratio=p.fmRatio,index=Math.min(p.fmIndex*(.22+.78*env),Math.max(.02,.42/Math.max(dt,.00001)/Math.max(1,ratio)-1)),ratio4=Math.max(.125,ratio*.5);
          // Two substeps control the strongest FM sidebands at ordinary musical pitches.
          for(let k=0;k<2;k++){
            const feedback=p.fmFeedback*v.fmLast*4,a=Math.sin(TAU*phases[3]+feedback),b=Math.sin(TAU*phases[2]+a*index*.72),c=Math.sin(TAU*phases[1]+b*index*.85);
            let out;
            if(p.algorithm==='parallel')out=Math.sin(TAU*phases[0]+b*index)*(1-p.mix*.65)+Math.sin(TAU*phases[1]+a*index*.65)*p.mix*.65;
            else if(p.algorithm==='feedback')out=Math.sin(TAU*phases[0]+Math.sin(TAU*phases[1]+feedback)*index)+Math.sin(TAU*phases[2]+a*index*.4)*p.mix*.2;
            else out=Math.sin(TAU*phases[0]+c*index);
            value+=out*.5;v.fmLast=a;phases[0]=frac(phases[0]+dt*.5);phases[1]=frac(phases[1]+Math.min(.46,dt*ratio*.5));phases[2]=frac(phases[2]+Math.min(.46,dt*ratio));phases[3]=frac(phases[3]+Math.min(.46,dt*ratio4*.5));
          }
          value+=Math.sin(TAU*v.subPhase)*p.sub*.55;
        }else{
          const morph=clamp(p.vector+(p.lfoTarget==='vector'?lfo*p.lfoDepth*.6:0),0,1,.35)*2,segment=Math.min(1,morph|0),amount=morph-segment,kind=(p.table+segment)%6,next=(kind+1)%6,harmonic=Math.max(1,.44/dt);
          value=table(v.phase,harmonic,kind)*(1-amount)+table(v.phase,harmonic,next)*amount;
          value=value*(1-p.mix*.28)+table(v.phase2,Math.max(1,.44/dt2),p.table)*p.mix*.28+Math.sin(TAU*v.subPhase)*p.sub*.5;
          v.phase=frac(v.phase+dt);v.phase2=frac(v.phase2+dt2);
        }
        v.subPhase=frac(v.subPhase+dt*.5);return value*.72;
      }
      _filter(v,input,p,env,lfo) {
        if((this.frame&7)===0){
          const mod=p.envAmount*env+(v.note+p.octave*12-60)*p.keytrack/12+(p.lfoTarget==='cutoff'?lfo*p.lfoDepth*3:0),cutoff=clamp(p.cutoff*Math.pow(2,mod),20,this.sr*.42,1800),g=Math.tan(Math.PI*cutoff/this.sr);
          v.k=2-p.resonance*1.83;v.a1=1/(1+g*(g+v.k));v.a2=g*v.a1;v.a3=g*v.a2;
        }
        const z=input-v.ic2,bp=v.a1*v.ic1+v.a2*z,lp=v.ic2+v.a2*v.ic1+v.a3*z;v.ic1=2*bp-v.ic1;v.ic2=2*lp-v.ic2;
        if(p.filterType==='hp'||p.filterType==='hp12')return input-v.k*bp-lp;
        if(p.filterType==='bp'||p.filterType==='bp12')return bp*Math.sqrt(v.k);
        if(p.filterType==='lp12')return lp;
        const z2=lp-v.jc2,bp2=v.a1*v.jc1+v.a2*z2,lp2=v.jc2+v.a2*v.jc1+v.a3*z2;v.jc1=2*bp2-v.jc1;v.jc2=2*lp2-v.jc2;return lp2;
      }
      _read(buffer,delay,index){const pos=frac((index-delay)/buffer.length)*buffer.length,i=pos|0;return buffer[i]+(buffer[(i+1)%buffer.length]-buffer[i])*(pos-i);}
      processBlock(left,right) {
        if(!left||!right||left.length!==right.length)throw new Error('LEAVEN needs equally sized stereo output channels.');
        let squares=0,peak=0,t=this.target;const p=this.params,sr=this.sr,smoothing=1-Math.exp(-8/(sr*.012));
        const smoothKeys=['mix','sub','detune','pw','sync','crossmod','vector','fmRatio','fmIndex','fmFeedback','glide','octave','velocity','drive','cutoff','resonance','envAmount','keytrack','lfoRate','lfoDepth','chorus','chorusRate','delay','delayFrames','feedback','space','width','volume'];
        p.model=t.model;p.wave=t.wave;p.table=t.table;p.algorithm=t.algorithm;p.filterType=t.filterType;p.lfoShape=t.lfoShape;p.lfoTarget=t.lfoTarget;p.retrigger=t.retrigger;p.amp=t.amp;p.filterEnv=t.filterEnv;
        for(let i=0;i<left.length;i++,this.frame++){
          while(this.controls.length&&this.controls[0].frame<=this.frame){const job=this.controls.shift();if(job.type==='start')this._start(job);else if(job.type==='transport')this._transport(job);else{for(const v of this.voices)if(!job.source||v.source===job.source)this._release(v);this.fences.delete(job.source||'*');}}
          t=this.target;if(this.playing&&((this.frame&31)===0||this.frame===this.originFrame))this._sequence();
          while(this.jobs.length&&this.jobs[0].frame<=this.frame)this._note(this.jobs.shift());
          if((this.frame&7)===0){for(const key of smoothKeys)p[key]+=(t[key]-p[key])*smoothing;this._derivedParams();}
          let dryL=0,dryR=0;const globalLfo=lfoValue(this.lfoPhase,p.lfoShape,(this.state.seed||1)^this.lfoCycle);
          for(let j=this.voices.length-1;j>=0;j--){const v=this.voices[j];if(this.frame>=v.end)this._release(v);const amp=advanceEnv(v.amp,p.amp,sr),env=advanceEnv(v.filterEnv,p.filterEnv,sr);
            if(v.amp.stage===4||(v.amp.stage===2&&amp<.00001)){this.voices.splice(j,1);continue;}
            const lfo=p.retrigger?lfoValue(v.lfoPhase,p.lfoShape,(this.state.seed||1)^v.lfoCycle):globalLfo;
            const desired=Math.min(sr*.43,Math.max(5,v.baseFrequency*p.octaveFactor));
            v.targetFrequency=desired;v.frequency+=(desired-v.frequency)*p.glideCoeff;
            const dt=clamp(v.frequency*(p.lfoTarget==='pitch'?Math.pow(2,lfo*p.lfoDepth*2/12):1)/sr,.00001,.43,.01);
            let signal=this._osc(v,p,dt,lfo,env);signal=soft(signal*p.driveGain)*p.driveNormalize;signal=this._filter(v,signal,p,env,lfo);
            const tremolo=p.lfoTarget==='amp'?1-p.lfoDepth*.48*(1+lfo):1;signal*=amp*v.velocity*tremolo;
            if(p.lfoTarget==='pan'){const pan=clamp(v.pan+lfo*p.lfoDepth*.8,-.95,.95,0);v.lastL=signal*Math.sqrt(.5*(1-pan));v.lastR=signal*Math.sqrt(.5*(1+pan));}else{v.lastL=signal*v.panL;v.lastR=signal*v.panR;}dryL+=v.lastL;dryR+=v.lastR;
            const next=v.lfoPhase+p.lfoRate/sr;if(next>=1)v.lfoCycle++;v.lfoPhase=frac(next);
          }
          for(let j=this.stealTails.length-1;j>=0;j--){const tail=this.stealTails[j],gain=tail.remain/64;dryL+=tail.left*gain;dryR+=tail.right*gain;if(--tail.remain<=0)this.stealTails.splice(j,1);}
          const nextLfo=this.lfoPhase+p.lfoRate/sr;if(nextLfo>=1)this.lfoCycle++;this.lfoPhase=frac(nextLfo);
          // Ensemble: differently phased fractional delay taps remain warm at zero feedback.
          this.chorusL[this.fxIndex]=dryL;this.chorusR[this.fxIndex]=dryR;
          const chorusTime=sr*(.015+.0038*Math.sin(TAU*this.chorusPhase)),chorusTimeR=sr*(.018+.0038*Math.sin(TAU*this.chorusPhase+1.9));
          let outL=dryL*(1-p.chorus*.25)+this._read(this.chorusR,chorusTime,this.fxIndex)*p.chorus*.48,outR=dryR*(1-p.chorus*.25)+this._read(this.chorusL,chorusTimeR,this.fxIndex)*p.chorus*.48;
          this.fxIndex=(this.fxIndex+1)%this.chorusL.length;this.chorusPhase=frac(this.chorusPhase+p.chorusRate/sr);
          const dl=this._read(this.delayL,p.delayFrames,this.delayIndex),dr=this._read(this.delayR,p.delayFrames*1.006,this.delayIndex);this.delayToneL+=(dl-this.delayToneL)*.19;this.delayToneR+=(dr-this.delayToneR)*.19;
          this.delayL[this.delayIndex]=soft(outL*p.delay+this.delayToneR*p.feedback);this.delayR[this.delayIndex]=soft(outR*p.delay+this.delayToneL*p.feedback);this.delayIndex=(this.delayIndex+1)%this.delayL.length;outL+=dl*.72;outR+=dr*.72;
          let roomL=0,roomR=0;
          for(let j=0;j<8;j++){const r=this.room[j],value=r.data[r.at];r.tone+=(value-r.tone)*.22;r.data[r.at]=soft((j<4?outL:outR)*p.space*.22+r.tone*.74);r.at=(r.at+1)%r.data.length;if(j<4)roomL+=value;else roomR+=value;}
          outL+=roomL*.38;outR+=roomR*.38;
          const mid=(outL+outR)*.5,side=(outL-outR)*.5*p.width;outL=(mid+side)*p.volume*.57;outR=(mid-side)*p.volume*.57;
          const dcL=outL-this.dcInL+this.dcOutL*this.dcCoeff,dcR=outR-this.dcInR+this.dcOutR*this.dcCoeff;this.dcInL=outL;this.dcInR=outR;this.dcOutL=Number.isFinite(dcL)?dcL:0;this.dcOutR=Number.isFinite(dcR)?dcR:0;
          const finalL=soft(this.dcOutL)*.98,finalR=soft(this.dcOutR)*.98;left[i]=finalL;right[i]=finalR;squares+=finalL*finalL+finalR*finalR;peak=Math.max(peak,Math.abs(finalL),Math.abs(finalR));
          if((this.frame&7)===0){this.waveform[this.waveAt]=(finalL+finalR)*.5;this.waveAt=(this.waveAt+1)&127;}
        }
        this.rms=left.length?Math.sqrt(squares/(left.length*2)):0;this.peak=peak;
      }
      getMeters() {
        const waveform=new Float32Array(128);for(let i=0;i<128;i++)waveform[i]=this.waveform[(this.waveAt+i)&127];
        const beat=(this.playing||this.clockPlaying)?this.beatAt(this.frame):this.originBeat;
        return {rms:this.rms,peak:this.peak,voices:this.voices.length,beat,step:this.playing?this.step:-1,chord:this.chord,waveform};
      }
    }
    return {Core,MAX_VOICES,MAX_QUEUE};
  }
  global.createProofDSP=createProofDSP;
  const DSP=createProofDSP();global.ProofDSP=DSP;
  const emptyMeters=()=>({rms:0,peak:0,voices:0,beat:0,step:-1,chord:-1,waveform:new Float32Array(128)});
  function normalized(state){return global.ProofSchema?global.ProofSchema.normalize(state):JSON.parse(JSON.stringify(state||{}));}
  function finite(value,label,min,max){if(!Number.isFinite(value)||value<min||value>max)throw new Error(label+' is outside the supported range.');return value;}
  function cancelled(signal){if(signal?.aborted)throw new DOMException('Audio export cancelled.','AbortError');}
  function wavBlob(chunks,frames,sr) {
    const bytes=new ArrayBuffer(44+frames*4),v=new DataView(bytes);let at=0;const tag=s=>{for(let i=0;i<s.length;i++)v.setUint8(at++,s.charCodeAt(i));};
    tag('RIFF');v.setUint32(at,36+frames*4,true);at+=4;tag('WAVE');tag('fmt ');v.setUint32(at,16,true);at+=4;v.setUint16(at,1,true);at+=2;v.setUint16(at,2,true);at+=2;v.setUint32(at,sr,true);at+=4;v.setUint32(at,sr*4,true);at+=4;v.setUint16(at,4,true);at+=2;v.setUint16(at,16,true);at+=2;tag('data');v.setUint32(at,frames*4,true);at+=4;
    for(const pcm of chunks)for(let i=0;i<pcm.length;i++){const x=Math.max(-1,Math.min(1,pcm[i]));v.setInt16(at,Math.round(x*(x<0?32768:32767)),true);at+=2;}return new Blob([bytes],{type:'audio/wav'});
  }
  function processorSource() {
    return `${global.createProofArp.toString()}\n${createProofDSP.toString()}\nconst DSP=createProofDSP();class ProofProcessor extends AudioWorkletProcessor { constructor(options){super();this.core=new DSP.Core(sampleRate,options.processorOptions.state);this.core.frame=currentFrame;this.blocks=0;this.port.onmessage=e=>{const m=e.data;try{if(m.type==='state')this.core.setState(m.state);else if(m.type==='start')this.core.start(m.options);else if(m.type==='stop')this.core.stop();else if(m.type==='panic')this.core.panic();else if(m.type==='note')this.core.scheduleNote(m.options);else if(m.type==='cancel')this.core.stopNotes(m.options);else if(m.type==='transport')this.core.setTransport(m.clock);}catch(error){this.port.postMessage({type:'error',message:error.message});}};} process(inputs,outputs){const out=outputs[0];if(!out||!out[0])return true;this.core.processBlock(out[0],out[1]||out[0]);if(++this.blocks%12===0)this.port.postMessage({type:'meters',meters:this.core.getMeters()});return true;}}registerProcessor('proof-polyphonic',ProofProcessor);`;
  }
  class ProofAudio {
    constructor(state) {
      this.state=normalized(state);this.context=null;this.node=null;this.core=null;this.mode='idle';this.isPlaying=false;this.meters=emptyMeters();this._initPromise=null;this._generation=0;this._disposed=false;this._keyTokens=new Map();this._keySequence=0;this._ownsContext=true;
    }
    async init() {
      if(this._disposed)throw new Error('This LEAVEN engine has been closed.');
      if(this.node&&this.context?.state!=='closed')return this;
      if(this.context?.state==='closed'){this.node?.disconnect();this.node=null;this.core=null;this.context=null;this._initPromise=null;this._ownsContext=true;this.mode='idle';this.isPlaying=false;this.meters=emptyMeters();}
      if(this._initPromise)return this._initPromise;
      this._initPromise=(async()=>{
        const Context=global.AudioContext||global.webkitAudioContext;if(!Context)throw new Error('This browser does not support Web Audio.');
        // GALLEY supplies a child facade; closing it never closes the studio’s context.
        if(global.MusicLabHost?.createAudioContext){this.context=global.MusicLabHost.createAudioContext();this._ownsContext=true;}
        else if(global.MusicLabHost?.context){this.context=global.MusicLabHost.context;this._ownsContext=false;}
        else this.context=new Context({latencyHint:'interactive'});
        const ctx=this.context;let url;
        if(ctx.audioWorklet&&global.AudioWorkletNode&&typeof global.createProofArp==='function'){
          try{url=URL.createObjectURL(new Blob([processorSource()],{type:'text/javascript'}));await ctx.audioWorklet.addModule(url);if(this._disposed)throw new Error('This LEAVEN engine has been closed.');this.node=new global.AudioWorkletNode(ctx,'proof-polyphonic',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{state:this.state}});this.mode='worklet';this.node.port.onmessage=e=>{if(e.data.type==='meters')this.meters=e.data.meters;else if(e.data.type==='error')this.onStatus?.(e.data.message);};}
          catch(error){if(this._disposed)throw error;this.node=null;this.onStatus?.('Using the compatible audio engine.');}
          finally{if(url)URL.revokeObjectURL(url);}
        }
        if(!this.node){if(!ctx.createScriptProcessor)throw new Error('This browser cannot run LEAVEN’s audio engine.');this.core=new DSP.Core(ctx.sampleRate,this.state);this.core.frame=Math.round(ctx.currentTime*ctx.sampleRate);this.node=ctx.createScriptProcessor(1024,0,2);this.mode='fallback';this.node.onaudioprocess=e=>{if(this._disposed)return;const at=Math.round((Number.isFinite(e.playbackTime)?e.playbackTime:ctx.currentTime)*ctx.sampleRate);if(at>this.core.frame)this.core.frame=at;this.core.processBlock(e.outputBuffer.getChannelData(0),e.outputBuffer.getChannelData(1));this.meters=this.core.getMeters();};}
        if(this._disposed)throw new Error('This LEAVEN engine has been closed.');this.node.connect(ctx.destination);return this;
      })().catch(error=>{this._initPromise=null;this.node?.disconnect();this.node=null;if(this._ownsContext)this.context?.close().catch(()=>{});this.context=null;this.core=null;throw error;});return this._initPromise;
    }
    _send(type,data={}) {
      if(!this.node)return;if(this.mode==='worklet'){this.node.port.postMessage({type,...data});return;}
      const c=this.core;if(type==='state')c.setState(data.state);else if(type==='start')c.start(data.options);else if(type==='stop')c.stop();else if(type==='panic')c.panic();else if(type==='note')c.scheduleNote(data.options);else if(type==='cancel')c.stopNotes(data.options);else if(type==='transport')c.setTransport(data.clock);
    }
    setState(state){this.state=normalized(state);this._send('state',{state:this.state});return this.state;}
    async start({when,beat=0}={}) {
      finite(beat,'Start beat',0,1000000);if(when!==undefined)finite(when,'Start time',0,Number.MAX_SAFE_INTEGER);
      const generation=++this._generation;await this.init();if(generation!==this._generation||this._disposed)return false;await this.context.resume();if(generation!==this._generation||this._disposed)return false;
      this.isPlaying=true;this._send('start',{options:{beat,frame:Math.round(Math.max(this.context.currentTime,when??this.context.currentTime)*this.context.sampleRate)}});return true;
    }
    stop(){this._generation++;this.isPlaying=false;this._send('stop');this.meters=Object.assign({},this.meters,{step:-1});}
    panic(){this._generation++;this._keyTokens.clear();this.isPlaying=false;this._send('panic');this.meters=emptyMeters();}
    async trigger(note,velocity=.85,duration=.4) {
      finite(note,'Pitch',0,127);finite(velocity,'Velocity',0,1);finite(duration,'Gate',.000001,768);
      const token=++this._keySequence;this._keyTokens.set(note,token);const generation=this._generation;await this.init();if(this._keyTokens.get(note)!==token||generation!==this._generation||this._disposed)return false;await this.context.resume();if(this._keyTokens.get(note)!==token||generation!==this._generation||this._disposed)return false;
      return this.scheduleNote({note,velocity,durationSeconds:duration,source:'proof-key-'+note});
    }
    release(note){this._keyTokens.delete(note);this.stopNotes({source:'proof-key-'+note});}
    setHeldNotes(notes){if(!Array.isArray(notes)||notes.length>128||notes.some(n=>!Number.isInteger(n)||n<0||n>127))throw new Error('Provide valid held MIDI notes.');this.setState(Object.assign({},this.state,{heldNotes:[...new Set(notes)].sort((a,b)=>a-b)}));}
    scheduleNote({voiceId='synth',note=60,velocity=.85,when,durationSeconds=.4,source='proof-live'}={}) {
      if(!this.node||!this.context||this.context.state==='closed')throw new Error('Prepare LEAVEN before scheduling notes.');if(!['synth','0','auto'].includes(String(voiceId)))throw new Error('Choose LEAVEN’s synth voice.');finite(note,'Pitch',0,127);finite(velocity,'Velocity',0,1);finite(durationSeconds,'Gate',.000001,768);if(when!==undefined)finite(when,'Start time',0,Number.MAX_SAFE_INTEGER);if(typeof source!=='string'||!source||source.length>200)throw new Error('Provide a valid note source.');
      this._send('note',{options:{note,velocity,frame:Math.round(Math.max(this.context.currentTime,when??this.context.currentTime)*this.context.sampleRate),duration:durationSeconds,source}});return true;
    }
    stopNotes({source,when}={}) {
      if(source!==undefined&&(typeof source!=='string'||!source||source.length>200))throw new Error('Provide a valid cancellation source.');if(when!==undefined)finite(when,'Cancellation time',0,Number.MAX_SAFE_INTEGER);if(!this.context||!this.node)return;
      this._send('cancel',{options:{source,frame:Math.round(Math.max(this.context.currentTime,when??this.context.currentTime)*this.context.sampleRate)}});
    }
    followTransport(clock={}) {
      if(!this.context||!this.node)return;const beat=clock.absoluteBeat??clock.beat,when=clock.when??clock.contextTime??this.context.currentTime;finite(beat,'Transport beat',0,1000000);finite(clock.tempo,'Transport tempo',20,400);finite(when,'Transport time',0,Number.MAX_SAFE_INTEGER);
      if(!clock.playing)this.isPlaying=false;this._send('transport',{clock:{beat,absoluteBeat:beat,tempo:clock.tempo,playing:!!clock.playing,revision:clock.revision,frame:Math.round(Math.max(this.context.currentTime,when)*this.context.sampleRate)}});
    }
    getMeters(){const m=this.core?this.core.getMeters():this.meters;return {...m,waveform:new Float32Array(m.waveform||128)};}
    async renderWav({state=this.state,bars=4,tailSeconds=2,scope='pattern',signal}={}) {
      cancelled(signal);const snapshot=normalized(state);finite(bars,'Bars',1,16);if(!Number.isInteger(bars))throw new Error('Choose a whole number of bars.');if(!['pattern','note','chord'].includes(scope))throw new Error('Choose an audio export scope.');
      const tempo=snapshot.tempo,lengthBeats=scope==='pattern'?bars*4:Math.min(4,Math.max(1,tempo/60));let events;
      if(scope==='pattern')events=global.createProofArp().events(snapshot,{startBeat:0,lengthBeats});
      else{const notes=scope==='note'?[snapshot.root]:global.ProofSchema.chordNotes(snapshot,snapshot.chords[snapshot.selectedChord]);events=notes.map(note=>({note,velocity:.85,startBeat:0,durationBeats:lengthBeats,voiceId:'synth'}));}
      return this.renderNotes({state:snapshot,events,tempo,lengthBeats,tailSeconds,signal,name:snapshot.name+'-'+scope});
    }
    async renderNotes({state=this.state,events,tempo,lengthBeats,tailSeconds=2,signal,name,includePCM=false}={}) {
      cancelled(signal);const snapshot=normalized(state);tempo=tempo??snapshot.tempo;finite(tempo,'Render tempo',20,400);finite(lengthBeats,'Phrase length',.000001,1024);finite(tailSeconds,'Tail',0,30);
      if(!Array.isArray(events)||events.length>DSP.MAX_QUEUE)throw new Error('Provide a bounded list of notes to print.');const body=lengthBeats*60/tempo;if(body+tailSeconds>120)throw new Error('Audio exports can be at most 120 seconds including the tail.');
      snapshot.tempo=tempo;const sr=48000,core=new DSP.Core(sr,snapshot),frames=Math.max(1,Math.ceil((body+tailSeconds)*sr)),chunks=[],renderPCM=includePCM?new Float32Array(frames*2):null;
      for(const e of events){finite(e.note??e.pitch,'Rendered pitch',0,127);finite(e.velocity??.8,'Rendered velocity',0,1);finite(e.startBeat??e.beat,'Rendered note start',0,lengthBeats);finite(e.durationBeats??e.duration,'Rendered note duration',.000001,1024);if((e.startBeat??e.beat)>=lengthBeats)continue;
        core.scheduleNote({note:e.note??e.pitch,velocity:e.velocity??.8,frame:Math.round((e.startBeat??e.beat)*60/tempo*sr),duration:Math.min((e.durationBeats??e.duration)*60/tempo,768),source:'proof-render'});
      }
      core.stopNotes({source:'proof-render',frame:Math.round(body*sr)});
      let at=0,blocks=0;const fadeFrames=Math.min(Math.round(sr*.02),Math.max(1,Math.floor(frames/2)));
      while(at<frames){cancelled(signal);const count=Math.min(2048,frames-at),left=new Float32Array(count),right=new Float32Array(count),pcm=renderPCM?renderPCM.subarray(at*2,(at+count)*2):new Float32Array(count*2);core.processBlock(left,right);
        for(let i=0;i<count;i++){const fade=Math.min(1,(frames-at-i-1)/fadeFrames);pcm[i*2]=left[i]*Math.max(0,fade);pcm[i*2+1]=right[i]*Math.max(0,fade);}chunks.push(pcm);at+=count;if(++blocks%2===0)await new Promise(resolve=>setTimeout(resolve,0));}
      cancelled(signal);return {blob:wavBlob(chunks,frames,sr),sampleRate:sr,name:(name||snapshot.name||'LEAVEN').replace(/[^\w -]/g,'').trim()||'LEAVEN',tempo,sourceApp:'proof',...(renderPCM?{pcm:renderPCM}:{})};
    }
    dispose(){if(this._disposed)return;this.panic();this._disposed=true;this.node?.disconnect();if(this.node&&this.mode==='fallback')this.node.onaudioprocess=null;if(this.node&&this.mode==='worklet'){this.node.port.onmessage=null;this.node.port.close?.();}if(this._ownsContext)this.context?.close().catch(()=>{});this.node=null;this.core=null;}
  }
  ProofAudio.wavBlob=wavBlob;ProofAudio.processorSource=processorSource;global.ProofAudio=ProofAudio;
})(typeof window!=='undefined'?window:globalThis);
