/* ROTISSERIE — one stereo tape engine for live playback, standalone fallback, and WAV rendering. */
(function () {
  'use strict';
  function createSpoolDSP() {
    const PI=Math.PI, TAU=PI*2;
    const finite=(n,d=0)=>Number.isFinite(+n)?+n:d;
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,finite(n,a)));
    const midi=n=>440*Math.pow(2,(n-69)/12);
    const wrap=(n,length)=>((n%length)+length)%length;
    const soft=x=>Math.tanh(x);
    function read(pcm,position,channel,start=0,length=pcm.length/2) {
      if(length<2)return pcm[start*2+channel]||0;
      const p=position<0||position>=length?wrap(position,length):position,i=Math.floor(p),f=p-i;
      const a=pcm[(start+(i?i-1:length-1))*2+channel]||0,b=pcm[(start+i)*2+channel]||0,
        c=pcm[(start+(i+1===length?0:i+1))*2+channel]||0,d=pcm[(start+(i+2>=length?i+2-length:i+2))*2+channel]||0;
      return b+.5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a)));
    }
    function seamRead(pcm,position,channel,start,length,fade) {
      const p=wrap(position,length);
      if(fade<1 || (p>=fade&&p<length-fade))return read(pcm,p,channel,start,length);
      const signed=p<fade?p:p-length, t=(signed+fade)/(2*fade);
      const a=read(pcm,length-fade+t*fade,channel,start,length),b=read(pcm,t*fade,channel,start,length);
      const weight=t*t*(3-2*t);
      return a*(1-weight)+b*weight;
    }
    class Deck {
      constructor(sr,index) {
        this.sr=sr;this.index=index;this.asset=null;this.position=0;this.rms=0;
        this.gain=0;this.rate=1;this.pan=0;this.wowPhase=index*1.7;this.flutterPhase=index*2.4;
        this.low=[0,0];this.low2=[0,0];this.high=[0,0];this.dc=[0,0];this.previous=[0,0];
        this.wearLP=[0,0];this.dropout=1;this.dropoutTarget=1;this.dropCounter=0;
        this.target={level:.65,pan:0,rate:1,reverse:false,start:0,end:1,phase:0,beats:4,sync:true,seam:12,tone:16000,highpass:25,saturation:.12,wow:.12,flutter:.05,wear:.05,hiss:0,dropouts:0,mute:false,solo:false};
      }
      clear(){this.low.fill(0);this.low2.fill(0);this.high.fill(0);this.dc.fill(0);this.previous.fill(0);this.wearLP.fill(0);this.rms=0;}
      transition(){if(this.asset)this.crossfade={asset:this.asset,position:this.position,start:this.start??this.region().start,length:this.length??this.region().length,fade:this.fade||0,increment:this.increment||this.asset.sampleRate/this.sr*this.rate,remaining:Math.round(this.sr*.018),total:Math.round(this.sr*.018)};}
      setAsset(asset,preserve=false){this.transition();const position=this.position;this.asset=asset;this.position=preserve?position:0;this.clear();}
      region(){const total=this.asset?.pcm.length/2||1;const start=Math.min(total-1,Math.floor(clamp(this.target.start,0,.999)*total));const length=Math.max(1,Math.min(total-start,Math.floor(clamp(this.target.end,.002,1)*total)-start));return{start,length};}
      rewind(){const r=this.region();this.position=clamp(this.target.phase,0,1)*r.length;}
      prepare(tempo,playing,solo,count) {
        const t=this.target, r=this.region(),seconds=r.length/(this.asset?.sampleRate||this.sr);
        const desired=clamp(t.rate,.25,2)*(t.sync?seconds/(Math.max(1,t.beats)*60/tempo):1)*(t.reverse?-1:1);
        this.targetRate=clamp(desired,-12,12);this.targetGain=playing&&!t.mute&&(!solo||t.solo)?clamp(t.level,0,1.5):0;
        this.pan+=((t.pan||0)-this.pan)*(1-Math.exp(-count/(this.sr*.02)));
        this.panL=Math.cos((this.pan+1)*PI/4)*Math.SQRT2;this.panR=Math.sin((this.pan+1)*PI/4)*Math.SQRT2;
        this.start=r.start;this.length=r.length;this.fade=Math.min(r.length*.2,Math.max(0,t.seam)*.001*(this.asset?.sampleRate||this.sr));
        const cutoff=Math.min(clamp(t.tone,150,this.sr*.43),this.sr*.43/Math.max(1,Math.abs(desired)))*(1-clamp(t.wear,0,1)*.65);
        this.lp=1-Math.exp(-TAU*cutoff/this.sr);this.hp=1-Math.exp(-TAU*clamp(t.highpass,10,5000)/this.sr);
        this.drive=1+clamp(t.saturation,0,1)*5;this.driveNorm=1/Math.tanh(this.drive);
        this.gainSlew=1-Math.exp(-1/(this.sr*.012));this.rateSlew=1-Math.exp(-1/(this.sr*.055));
      }
      tick(random,playing) {
        this.gain+=(this.targetGain-this.gain)*this.gainSlew;this.rate+=(this.targetRate-this.rate)*this.rateSlew;
        if(!this.asset){this.previous[0]=this.previous[1]=0;return this.previous;}
        const t=this.target;
        this.wowPhase+=TAU*(.29+this.index*.073)/this.sr;this.flutterPhase+=TAU*(7.7+this.index*1.17)/this.sr;
        if(this.wowPhase>TAU)this.wowPhase-=TAU;if(this.flutterPhase>TAU)this.flutterPhase-=TAU;
        const wander=Math.sin(this.wowPhase)*t.wow*.018+Math.sin(this.flutterPhase)*t.flutter*.006;
        this.increment=this.asset.sampleRate/this.sr*this.rate*(1+wander);
        if(--this.dropCounter<=0){this.dropCounter=Math.max(1,Math.floor(this.sr*(.025+random*.15)));this.dropoutTarget=random<t.dropouts*.14?.1+random*.5:1;}
        this.dropout+=(this.dropoutTarget-this.dropout)*.004;
        const result=this.previous;
        for(let ch=0;ch<2;ch++) {
          let value=seamRead(this.asset.pcm,this.position,ch,this.start,this.length,this.fade);
          if(this.crossfade){const c=this.crossfade,old=seamRead(c.asset.pcm,c.position,ch,c.start,c.length,c.fade),weight=c.remaining/Math.max(1,c.total);value=value*(1-weight)+old*weight;}
          this.low[ch]+=this.lp*(value-this.low[ch]);this.low2[ch]+=this.lp*(this.low[ch]-this.low2[ch]);
          this.high[ch]+=this.hp*(this.low2[ch]-this.high[ch]);value=this.low2[ch]-this.high[ch];
          value=soft(value*this.drive)*this.driveNorm;
          value=value*this.dropout+(random*2-1)*t.hiss*.012;
          this.dc[ch]+=.0003*(value-this.dc[ch]);value-=this.dc[ch];
          result[ch]=value*this.gain*(ch?this.panR:this.panL);
        }
        if(playing)this.position=wrap(this.position+this.increment,this.length);if(this.crossfade){const c=this.crossfade;c.position=wrap(c.position+c.increment,c.length);if(--c.remaining<=0)this.crossfade=null;}
        const power=(result[0]*result[0]+result[1]*result[1])*.5;this.rms+=.001*(power-this.rms);
        return result;
      }
    }
    class Core {
      constructor(sampleRate,state,seed=0x53504f4f) {
        this.sr=clamp(sampleRate,8000,192000);this.frame=0;this.transportFrames=0;this.running=false;this.seed=seed>>>0||1;
        this.decks=Array.from({length:4},(_,i)=>new Deck(this.sr,i));this.voices=[];this.events=[];this.patternMode=false;this.noteSequence=0;this.deckGates=Array(4).fill(null);this.sourceCuts=new Map();this.capture=null;this.completed=[];
        this.micEnabled=false;this.peak=0;this.rms=0;this.rmsLeft=0;this.rmsRight=0;this.inputRms=0;this.limiter=1;this.volume=.72;this.braking=false;this.brakeRate=1;
        this.echo=[new Float32Array(Math.ceil(this.sr*4)+4),new Float32Array(Math.ceil(this.sr*4)+4)];this.echoWrite=0;this.echoLP=[0,0];this.echoDelay=this.sr*.375;
        this.room=[.0297,.0371,.0411,.0437,.0307,.0383,.0423,.0449].map(s=>({pcm:new Float32Array(Math.round(s*this.sr)),index:0,low:0}));
        this.waveform=new Float32Array(128);this.waveCount=0;this.waveWrite=0;this.lastInput=[0,0];this.setState(state||{});
      }
      random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
      setState(state) {
        this.state=state||{};this.tempo=this.followingClock??clamp(state.tempo||92,40,200);
        this.decks.forEach((d,i)=>{const raw=(state.decks||[])[i]||{};const t=Object.assign({},d.target,raw);delete t.asset;
          ['level','pan','rate','start','end','phase','beats','seam','tone','highpass','saturation','wow','flutter','wear','hiss','dropouts'].forEach(k=>{t[k]=finite(t[k],d.target[k]);});
          t.level=clamp(t.level,0,1.5);t.pan=clamp(t.pan,-1,1);t.start=clamp(t.start,0,.999);t.end=clamp(t.end,t.start+.002,1);t.start=Math.min(t.start,t.end-.002);t.rate=clamp(t.rate,.25,2);t.phase=clamp(t.phase,0,1);t.beats=clamp(t.beats,1,64);t.seam=clamp(t.seam,0,250);
          ['saturation','wow','flutter','wear','hiss','dropouts'].forEach(k=>t[k]=clamp(t[k],0,1));
          t.tone=clamp(t.tone,200,18000);t.highpass=clamp(t.highpass,10,5000);
          const old=d.target;if(d.asset&&(old.phase!==t.phase||old.start!==t.start||old.end!==t.end)){const previous=d.region(),rawPosition=previous.start+d.position;d.transition();d.target=t;const region=d.region();d.position=((rawPosition-region.start+(t.phase-old.phase)*region.length)%region.length+region.length)%region.length;}else d.target=t;
        });
        this.master=Object.assign({volume:.72,width:1,echo:.2,echoDivision:'1/8',feedback:.35,space:.2},state.master||{});
        this.input=Object.assign({voice:'sine',root:48,decay:600,tone:8000,level:.65,monitor:true},state.source||{});this.recordSettings=Object.assign({input:'keys',bars:0,quantize:false,feedback:.85},state.record||{});
      }
      setSample(index,pcm,sampleRate,preserve=false){if(index<0||index>3)return;this.decks[index].setAsset(pcm?.length?{pcm,sampleRate:clamp(sampleRate,8000,96000)}:null,preserve);if(!preserve)this.decks[index].rewind();}
      start(rewind=false){if(rewind)this.rewind();this.running=true;}
      stop(){this.running=false;this.followingClock=null;this.events=[];this.sourceCuts.clear();this.patternMode=false;this.deckGates.fill(null);this.voices.forEach(v=>v.releasing=true);}
      rewind(){this.transportFrames=0;this.decks.forEach(d=>d.rewind());}
      retrigger(index){this.decks[index]?.transition();this.decks[index]?.rewind();}
      seek(index,ratio){const d=this.decks[index];if(d){d.transition();d.position=clamp(ratio,0,1)*d.region().length;}}
      panic(){this.stop();this.voices=[];this.echo.forEach(x=>x.fill(0));this.echoLP=[0,0];this.room.forEach(x=>{x.pcm.fill(0);x.low=0;});this.decks.forEach(x=>{x.clear();x.crossfade=null;x.gain=0;});if(this.capture)this.cancelCapture();this.micEnabled=false;this.volume=0;this.braking=false;this.brakeRate=1;}
      queueDeck(index, options, frame) {
        if(frame>=(this.sourceCuts.get(options.source)??Infinity))return;
        const token=++this.noteSequence;this.patternMode=true;
        this.events.push({type:'deckOn',index,options,source:options.source,frame,token},{type:'deckOff',index,source:options.source,frame:frame+Math.max(1,Math.round(options.duration*this.sr)),token});
        this.events.sort((a,b)=>a.frame-b.frame);return token;
      }
      clearPatternNotes(source,frame=this.frame,future=false){
        if(source===undefined){this.events=[];this.sourceCuts.clear();this.deckGates.fill(null);this.patternMode=false;this.running=false;return;}
        const at=future?Math.min(this.sourceCuts.get(source)??Infinity,frame):frame;
        if(future)this.sourceCuts.set(source,at);else this.sourceCuts.delete(source);
        this.events=this.events.filter(event=>event.source!==source||future&&event.frame<at);
        this.events.push({type:'cancel',source,frame:at});this.events.sort((a,b)=>a.frame-b.frame);
      }
      clearClockEvents(){this.events=this.events.filter(event=>event.type!=='clock');}
      queueClock(beat,tempo,playing,frame){this.events.push({type:'clock',beat,tempo,playing,frame});this.events.sort((a,b)=>a.frame-b.frame);}
      clockSeek(beat,tempo,playing){
        this.tempo=clamp(tempo,20,400);this.followingClock=playing?this.tempo:null;this.transportFrames=Math.max(0,beat)*60/this.tempo*this.sr;this.running=playing;
        this.decks.forEach(d=>{d.transition();d.prepare(this.tempo,playing,this.decks.some(x=>x.target.solo),128);d.rate=d.targetRate;d.position=wrap(d.target.phase*d.region().length+Math.max(0,beat)*60/this.tempo*(d.asset?.sampleRate||this.sr)*d.targetRate,d.region().length);});
      }
      applyEvent(event){
        if(event.type==='cancel'){
          this.decks.forEach(deck=>{if(this.deckGates[deck.index]?.source===event.source){this.deckGates[deck.index]=null;deck.targetGain=this.running&&this.followingClock!=null?clamp(deck.target.level,0,1.5):0;}});return;
        }
        if(event.type==='clock'){this.clockSeek(event.beat,event.tempo,event.playing);return;}
        const deck=this.decks[event.index];if(!deck)return;
        if(event.type==='deckOn'){this.deckGates[event.index]={source:event.source||'native',token:event.token,velocity:event.options.velocity,pitch:event.options.pitch||0};deck.transition();deck.rewind();}
        else if(this.deckGates[event.index]?.token===event.token)this.deckGates[event.index]=null;
        const continuous=this.running&&this.followingClock!=null;
        deck.prepare(this.tempo,!!this.deckGates[event.index]||continuous,false,1);deck.targetGain*=this.deckGates[event.index]?.velocity??(continuous?1:0);deck.targetRate*=Math.pow(2,(this.deckGates[event.index]?.pitch||0)/12);if(event.type==='deckOn')deck.rate=deck.targetRate;
      }
      noteOn(note,velocity=1){note=clamp(note,24,108)|0;this.noteOff(note);if(this.voices.length>=20)this.voices.shift();this.voices.push({note,frequency:midi(note),phase:0,age:0,envelope:0,releasing:false,velocity:clamp(velocity,.01,1),type:this.input.voice||'sine',low:0});}
      noteOff(note){this.voices.forEach(v=>{if(v.note===note)v.releasing=true;});}
      keyboardTick(){let out=0;for(let i=this.voices.length-1;i>=0;i--){const v=this.voices[i],t=v.age/this.sr;v.phase+=TAU*v.frequency/this.sr;
          v.envelope+=(v.releasing?-v.envelope:1-v.envelope)*(v.releasing?(1-Math.exp(-1/(this.sr*.09))):.004);
          let signal=Math.sin(v.phase);if(v.type==='reed')signal+=Math.sin(v.phase*2)*.24+Math.sin(v.phase*3)*.12;else if(v.type==='bell')signal=(signal+Math.sin(v.phase*2.76)*.28+Math.sin(v.phase*4.12)*.1)*Math.exp(-t*.85);else if(v.type==='pluck')signal=(signal+Math.sin(v.phase*2)*.28)*Math.exp(-t*2.5);else if(v.type==='noise'){v.low+=(1-Math.exp(-TAU*clamp(this.input.tone,200,16000)/this.sr))*((this.random()*2-1)-v.low);signal=v.low;}else signal=signal+Math.sin(v.phase*2)*.12;signal*=Math.exp(-t/(Math.max(.08,this.input.decay/1000)*1.45));
          v.low+=(1-Math.exp(-TAU*clamp(this.input.tone,200,16000)/this.sr))*(signal-v.low);out+=v.low*v.envelope*v.velocity*.26*clamp(this.input.level,0,1);v.age++;if((v.releasing&&v.envelope<.00003)||t>20)this.voices.splice(i,1);
        }return Math.tanh(out);}
      startCapture(index,options={}) {
        if(this.capture)throw new Error('A deck recording is already in progress.');
        const deck=this.decks[index];if(!deck)throw new Error('Choose a valid deck.');
        const overdub=options.mode==='overdub'&&deck.asset;
        const seconds=options.bars?clamp(options.bars,.25,16)*240/this.tempo:(overdub?120:30);
        const frames=Math.max(32,Math.min(Math.round(this.sr*seconds),Math.round(this.sr*(overdub?120:30))));
        const pcm=overdub?new Float32Array(deck.asset.pcm):new Float32Array(frames*2);
        const barFrames=this.sr*240/this.tempo,armed=!!options.quantize&&this.running;
        const target=armed?(Math.floor(this.transportFrames/barFrames)+1)*barFrames:this.transportFrames;
        this.capture={index,mode:overdub?'overdub':'replace',options:Object.assign({},options),pcm,original:overdub?deck.asset.pcm:null,frames:0,maxFrames:frames,sampleRate:overdub?deck.asset.sampleRate:this.sr,previousInput:[0,0],head:deck.position,feedback:clamp(options.feedback??this.recordSettings.feedback,0,1),inputGain:1,status:armed?'armed':'recording',target,tempo:this.tempo,lastCell:null,accumL:0,accumR:0,accumCount:0};
      }
      captureTick(l,r,previousPosition) {
        const c=this.capture;if(!c)return;if(c.status==='armed'){if(this.transportFrames<c.target)return;c.status='recording';}
        if(c.mode==='replace'){c.pcm[c.frames*2]=clamp(l*c.inputGain,-1,1);c.pcm[c.frames*2+1]=clamp(r*c.inputGain,-1,1);}
        else if(this.running){const d=this.decks[c.index],region=d.region(),increment=d.increment,from=previousPosition,to=from+increment;
          c.accumL+=l;c.accumR+=r;c.accumCount++;
          const lo=increment>=0?Math.ceil(from):Math.floor(to)+1,hi=increment>=0?Math.ceil(to)-1:Math.floor(from);
          for(let offset=0;offset<=hi-lo;offset++){const p=increment>=0?lo+offset:hi-offset,fraction=Math.abs(increment)>1e-8?clamp((p-from)/increment,0,1):1,at=region.start+wrap(p,region.length);
            if(c.lastCell===at)continue;c.lastCell=at;
            const a=Math.abs(increment)<1?c.accumL/c.accumCount:c.previousInput[0]+(l-c.previousInput[0])*fraction,b=Math.abs(increment)<1?c.accumR/c.accumCount:c.previousInput[1]+(r-c.previousInput[1])*fraction;
            c.pcm[at*2]=clamp(c.pcm[at*2]*c.feedback+a*c.inputGain,-1,1);c.pcm[at*2+1]=clamp(c.pcm[at*2+1]*c.feedback+b*c.inputGain,-1,1);
          }
          if(hi>=lo){c.accumL=c.accumR=c.accumCount=0;}
          // The cloned reel is also the live read head: new passes hear the previous overdub.
          d.asset.pcm=c.pcm;
        }
        c.previousInput[0]=l;c.previousInput[1]=r;c.frames++;if(c.frames>=c.maxFrames)this.finishCapture(true);
      }
      finishCapture(limit=false){const c=this.capture;if(!c)return null;this.capture=null;if(c.frames<32){if(c.original)this.decks[c.index].asset.pcm=c.original;return null;}let pcm=c.mode==='replace'?c.pcm.slice(0,c.frames*2):c.pcm;
        if(c.mode==='replace'&&pcm.length){const fade=Math.min(Math.round(c.sampleRate*.004),Math.floor(pcm.length/4));for(let i=0;i<fade;i++){const g=i/Math.max(1,fade);pcm[i*2]*=g;pcm[i*2+1]*=g;pcm[pcm.length-2-i*2]*=g;pcm[pcm.length-1-i*2]*=g;}}
        const complete=!!c.options.bars&&c.frames>=c.maxFrames;const result={index:c.index,pcm,sampleRate:c.sampleRate,frames:c.frames,mode:c.mode,limit,complete,beats:c.options.bars?c.options.bars*4:null,sync:complete,tempo:c.tempo};
        const deck=this.decks[c.index];if(c.mode==='replace'){deck.setAsset({pcm,sampleRate:c.sampleRate});Object.assign(deck.target,{start:0,end:1,phase:0,rate:1,reverse:false,sync:complete,beats:complete?c.options.bars*4:4});deck.rewind();deck.prepare(this.tempo,this.running,this.decks.some(d=>d.target.solo),128);deck.rate=deck.targetRate;}
        this.completed.push(result);return result;
      }
      cancelCapture(){if(this.capture?.original)this.decks[this.capture.index].asset.pcm=this.capture.original;this.capture=null;}
      processBlock(left,right,inputLeft,inputRight,clockFrame=this.frame) {
        const n=left.length,solo=this.decks.some(d=>d.target.solo);this.brakeRate+=((this.braking?.035:1)-this.brakeRate)*(1-Math.exp(-n/(this.sr*(this.braking?.55:.17))));this.decks.forEach(d=>{const gate=this.deckGates[d.index],continuous=this.running&&this.followingClock!=null;d.prepare(this.tempo,this.patternMode?!!gate||continuous:this.running,solo,n);if(this.patternMode){d.targetGain*=gate?.velocity??(continuous?1:0);d.targetRate*=Math.pow(2,(gate?.pitch||0)/12);}d.targetRate*=this.brakeRate;});
        const m=this.master,volume=clamp(m.volume,0,1),width=clamp(m.width,0,2),echoMix=clamp(m.echo,0,1),space=clamp(m.space,0,1);
        const divisions={'1/16':.25,'1/8':.5,'3/16':.75,'1/4':1,'3/8':1.5,'1/2':2,'3/4':3,'1/1':4};
        const time=60/this.tempo*(divisions[m.echoDivision]||.5);
        const targetDelay=clamp(time*this.sr,1,this.echo[0].length-2),feedback=clamp(m.feedback,0,.88),roomFeedback=.81;
        for(let i=0;i<n;i++){
          while(this.events.length&&this.events[0].frame<=clockFrame+i)this.applyEvent(this.events.shift());
          const key=this.keyboardTick(),micL=this.micEnabled?(inputLeft?.[i]||0):0,micR=this.micEnabled?(inputRight?.[i]??micL):0;
          const source=this.capture?.options.input||this.recordSettings.input;let il=(source==='mic'?micL:source==='both'?micL+key:key),ir=(source==='mic'?micR:source==='both'?micR+key:key);
          const positions=this.capture?.mode==='overdub'?this.decks[this.capture.index].position:0;
          let l=0,r=0,captureL=key,captureR=key;for(const d of this.decks){const out=d.tick(this.random(),this.patternMode?!!this.deckGates[d.index]||this.running&&this.followingClock!=null:this.running);l+=out[0];r+=out[1];if(d.index!==this.capture?.index){captureL+=out[0];captureR+=out[1];}}if(source==='resample'){il=captureL;ir=captureR;}
          this.captureTick(il,ir,positions);
          if(this.input.monitor){l+=key+(this.micEnabled&&source!=='keys'?micL*.7:0);r+=key+(this.micEnabled&&source!=='keys'?micR*.7:0);}
          const mid=(l+r)*.5,side=(l-r)*.5*width;l=mid+side;r=mid-side;
          this.echoDelay+=(targetDelay-this.echoDelay)*.0005;
          const ep=wrap(this.echoWrite-this.echoDelay,this.echo[0].length),ei=Math.floor(ep),ef=ep-ei;
          const el=this.echo[0][ei]*(1-ef)+this.echo[0][(ei+1)%this.echo[0].length]*ef,er=this.echo[1][ei]*(1-ef)+this.echo[1][(ei+1)%this.echo[1].length]*ef;
          this.echoLP[0]+=.18*(el-this.echoLP[0]);this.echoLP[1]+=.18*(er-this.echoLP[1]);
          this.echo[0][this.echoWrite]=soft(l*.7+this.echoLP[1]*feedback);this.echo[1][this.echoWrite]=soft(r*.7+this.echoLP[0]*feedback);this.echoWrite=(this.echoWrite+1)%this.echo[0].length;
          let roomL=0,roomR=0;for(let j=0;j<8;j++){const a=this.room[j],delayed=a.pcm[a.index];a.low+=.25*(delayed-a.low);a.pcm[a.index]=soft((j<4?l:r)*.17+a.low*roomFeedback);a.index=(a.index+1)%a.pcm.length;if(j<4)roomL+=delayed*.3;else roomR+=delayed*.3;}
          l+=el*echoMix+roomL*space;r+=er*echoMix+roomR*space;
          this.volume+=(volume-this.volume)*.001;l*=this.volume;r*=this.volume;
          const peak=Math.max(Math.abs(l),Math.abs(r)),desired=peak>.94?.94/peak:1;this.limiter+=(desired-this.limiter)*(desired<this.limiter?.15:.00008);
          l=Math.tanh(l*this.limiter);r=Math.tanh(r*this.limiter);if(!Number.isFinite(l)||!Number.isFinite(r)){l=r=0;this.panic();}
          left[i]=l;right[i]=r;this.peak=Math.max(peak,this.peak*.999);this.rmsLeft+=.001*(l*l-this.rmsLeft);this.rmsRight+=.001*(r*r-this.rmsRight);this.rms=(this.rmsLeft+this.rmsRight)*.5;this.inputRms+=.001*((il*il+ir*ir)*.5-this.inputRms);
          if(++this.waveCount>=Math.max(1,Math.floor(this.sr/1024))){this.waveCount=0;this.waveform[this.waveWrite]=(l+r)*.5;this.waveWrite=(this.waveWrite+1)%128;}
          if(this.running)this.transportFrames++;this.frame++;
        }
      }
      meters(){const beats=this.transportFrames/this.sr*this.tempo/60,levels=this.decks.map(d=>Math.sqrt(Math.max(0,d.rms)));return{decks:levels,nodes:levels,positions:this.decks.map(d=>wrap(d.position,d.region().length)/d.region().length),peak:this.peak,rms:Math.sqrt(Math.max(0,this.rms)),rmsLeft:Math.sqrt(Math.max(0,this.rmsLeft)),rmsRight:Math.sqrt(Math.max(0,this.rmsRight)),input:Math.sqrt(Math.max(0,this.inputRms)),step:this.running?Math.floor(beats*4)%16:-1,beat:beats,recordSeconds:this.capture?.frames/this.sr||0,recordStatus:this.capture?.status||'idle',recording:this.capture?{index:this.capture.index,mode:this.capture.mode,status:this.capture.status,seconds:this.capture.frames/this.sr,limit:this.capture.maxFrames/this.sr}:null,waveform:Array.from(this.waveform),playing:this.running};}
    }
    Core.read=read;Core.seamRead=seamRead;return Core;
  }
  const DSP=createSpoolDSP();window.SpoolDSP=DSP;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(+n)?+n:a));
  function generateSeed(asset,sampleRate=48000) {
    sampleRate=Math.round(clamp(sampleRate,8000,48000));const tempo=clamp(asset.tempo||92,40,180),bars=Math.round(clamp(asset.bars||1,1,4)),duration=Math.min(30,bars*240/tempo),frames=Math.max(32,Math.round(sampleRate*duration));
    const pcm=new Float32Array(frames*2),beat=60/tempo,pitch=Math.round(clamp(asset.pitch||48,24,84));let randomState=asset.seed>>>0||0x53504f4f;
    const random=()=>{let x=randomState;x^=x<<13;x^=x>>>17;x^=x<<5;randomState=x>>>0;return randomState/4294967296;};
    // Musical decisions use their own stream, so a phrase stays the same at
    // every sample rate and does not depend on how many noise samples ran.
    let phraseState=((asset.seed>>>0)^0x9e3779b9)>>>0||1;
    const phraseRandom=()=>{let x=phraseState;x^=x<<13;x^=x>>>17;x^=x<<5;phraseState=x>>>0;return phraseState/4294967296;};
    const notes=[0,3,7,10,12,15,19],TAU=Math.PI*2;
    function voice(kind,at,note,seconds,velocity=1,pan=0) {
      const tonal=['bass','bells','pluck','reed','keys'].includes(kind),detune=tonal?Math.pow(2,(phraseRandom()-.5)*4/1200):1,color=tonal?.85+phraseRandom()*.3:1;
      const count=Math.min(frames,Math.round(seconds*sampleRate)),frequency=440*Math.pow(2,(note-69)/12)*detune,first=Math.round(at*sampleRate),left=Math.cos((pan+1)*Math.PI/4),right=Math.sin((pan+1)*Math.PI/4);let low=0;
      for(let i=0;i<count;i++){const t=i/sampleRate,p=TAU*frequency*t,white=random()*2-1;let value=0,envelope=Math.min(1,t/.004)*Math.exp(-5.5*t/seconds);
        if(kind==='kick'){value=Math.sin(TAU*(frequency*t+frequency*.03*(1-Math.exp(-t*40))));envelope=Math.min(1,t/.001)*Math.exp(-7*t/seconds);value+=white*.12*Math.exp(-t*100);}
        else if(kind==='snare'){low+=.27*(white-low);value=(white-low)*.75+Math.sin(p)*.23;envelope=Math.min(1,t/.001)*Math.exp(-7*t/seconds);}
        else if(kind==='hat'){low+=.05*(white-low);value=(white-low)*.4+Math.sin(p*5.37)*.12;envelope=Math.min(1,t/.0006)*Math.exp(-9*t/seconds);}
        else if(kind==='bass')value=(Math.sin(p)+(Math.sin(p*2)*.23+Math.sin(p*3)*.07)*color)*.7;
        else if(kind==='bells')value=(Math.sin(p)+(Math.sin(p*2.756)*.27+Math.sin(p*5.404)*.1)*color)*.55;
        else if(kind==='pluck')value=(Math.sin(p)+(Math.sin(p*2)*.28+Math.sin(p*3)*.14+Math.sin(p*4)*.06)*color)*.62;
        else if(kind==='reed')value=(Math.sin(p)+(Math.sin(p*2)*.25+Math.sin(p*3)*.17+Math.sin(p*4)*.07)*color)*.57;
        else if(kind==='texture'){low+=.015*(white-low);value=low*.45+Math.sin(p)*.13+Math.sin(p*1.004)*.13;envelope=Math.sin(Math.PI*Math.min(1,t/seconds))*.5;}
        else if(kind==='rhythm'){low+=.15*(white-low);value=(white-low)*.4+Math.sin(p)*.3;envelope=Math.exp(-9*t/seconds)*Math.min(1,t/.001);}
        else value=(Math.sin(p)+(Math.sin(p*2)*.12+Math.sin(p*3)*.035)*color)*.65;
        const index=((first+i)%frames)*2;pcm[index]+=value*envelope*velocity*left;pcm[index+1]+=value*envelope*velocity*right;
      }
    }
    const id=asset.id||'keys';
    for(let bar=0;bar<bars;bar++){
      const at=bar*4*beat,variation=bar%2;
      if(id==='drums'){
        [0,1.5,2,3.25].forEach((b,i)=>voice('kick',at+b*beat,pitch-12,.38,i===1?.63:.9,0));
        [1,3].forEach(b=>voice('snare',at+b*beat,pitch+12,.21,.65,-.12));
        for(let step=0;step<8;step++)voice('hat',at+(step*.5+(step%2?.055:0))*beat,pitch+42,step%2?.11:.065,step%2?.45:.65,step%2?.4:-.3);
      }else if(id==='bass'){
        const rhythms=[[0,.75,1.5,2.5,3.25],[0,.5,1.75,2.5,3.5],[0,.75,1.75,2.25,3.25]],contours=[[0,0,7,3,variation?10:7],[0,7,0,3,10],[0,0,3,7,3],[0,10,7,3,7]],rhythm=rhythms[Math.floor(phraseRandom()*rhythms.length)],contour=contours[Math.floor(phraseRandom()*contours.length)];
        rhythm.forEach((b,i)=>voice('bass',at+b*beat,pitch+contour[i],beat*(.55+phraseRandom()*.25),.82+phraseRandom()*.1));
      }else if(id==='keys'){
        const rhythms=[[0,1.75,3],[0,1.5,3],[0,2,3.25]],voicings=[[0,3,7,10],[0,3,7,12],[0,7,10,15],[0,3,10,19]],rhythm=rhythms[Math.floor(phraseRandom()*rhythms.length)];
        rhythm.forEach((b,chord)=>{const chordNotes=voicings[Math.floor(phraseRandom()*voicings.length)],strum=.022+phraseRandom()*.026,decay=beat*(1.4+phraseRandom()*.5);chordNotes.forEach((n,i)=>voice('keys',at+(b+i*strum)*beat,pitch+n+(chord===1?5:chord===2?7:0),decay,.5+phraseRandom()*.08,(i-1.5)*.35));});
      }else if(id==='texture'){
        [0,7,12].forEach((n,i)=>voice('texture',at+i*.12,pitch+n,beat*4,.7,(i-1)*.65));
      }else if(id==='rhythm'){
        [0,.5,.75,1.5,2.25,2.75,3.5].forEach((b,i)=>voice('rhythm',at+b*beat,pitch+[0,7,12,3][i%4],beat*.22,.6,i%2?.5:-.5));
      }else{
        const steps=id==='bells'?[0,1.25,2.75]:id==='reed'?[0,.75,1.5,2.5,3.25]:[0,.5,1.25,2,2.75,3.5];
        const offset=Math.floor(phraseRandom()*notes.length),direction=phraseRandom()<.3?-1:1;
        steps.forEach((b,i)=>voice(id,at+(b+(i?phraseRandom()*.035:0))*beat,pitch+notes[((offset+i*direction+variation*2)%notes.length+notes.length)%notes.length],beat*(id==='bells'?2.2:id==='reed'?.8:1.25),.58+(i%2)*.15+phraseRandom()*.08,Math.sin(i*1.7)*.5));
      }
    }
    let peak=0;for(let i=0;i<pcm.length;i++)peak=Math.max(peak,Math.abs(pcm[i]));const gain=peak>.82?.82/peak:1;for(let i=0;i<pcm.length;i++)pcm[i]*=gain;
    return{pcm,sampleRate};
  }
  DSP.generateSeed=generateSeed;
  function decodePCM(asset) {
    if(!asset)return null;if(asset.kind==='seed')return generateSeed(asset);
    const raw=atob(asset.pcm||'');if(raw.length%2)throw new Error('Invalid PCM data.');const channels=asset.channels===1?1:2,frames=raw.length/(channels*2);
    if(!Number.isInteger(frames)||frames<1||frames>clamp(asset.sampleRate,8000,48000)*30+1||frames!==asset.frames)throw new Error('Invalid clip length.');
    const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const view=new DataView(bytes.buffer),pcm=new Float32Array(frames*2);
    for(let i=0;i<frames;i++){pcm[i*2]=view.getInt16(i*channels*2,true)/32768;pcm[i*2+1]=channels===1?pcm[i*2]:view.getInt16(i*channels*2+2,true)/32768;}
    return{pcm,sampleRate:clamp(asset.sampleRate,8000,48000)};
  }
  function encodePCM(pcm,sampleRate,name='Recorded loop') {
    const bytes=new Uint8Array(pcm.length*2),view=new DataView(bytes.buffer);for(let i=0;i<pcm.length;i++){const value=clamp(pcm[i],-1,1);view.setInt16(i*2,Math.round(value*(value<0?32768:32767)),true);}
    let raw='';for(let start=0;start<bytes.length;start+=16384)raw+=String.fromCharCode.apply(null,bytes.subarray(start,start+16384));
    return{kind:'pcm',name,sampleRate,channels:2,pcm:btoa(raw),frames:pcm.length/2,duration:pcm.length/2/sampleRate};
  }
  function wavBlob(chunks,frames,sampleRate) {
    frames=Math.max(0,Math.floor(frames));const data=new ArrayBuffer(44+frames*4),view=new DataView(data);const ascii=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
    ascii(0,'RIFF');view.setUint32(4,36+frames*4,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,frames*4,true);
    let at=44,remaining=frames*2;for(const chunk of chunks){for(let i=0;i<Math.min(chunk.length,remaining);i++){const value=clamp(chunk[i],-1,1);view.setInt16(at,Math.round(value*(value<0?32768:32767)),true);at+=2;}remaining-=Math.min(chunk.length,remaining);if(!remaining)break;}return new Blob([data],{type:'audio/wav'});
  }
  function stateForDSP(state){const copy=Object.assign({},state);delete copy.assets;return copy;}
  function processorSource(){return `'use strict';const DSP=(${createSpoolDSP.toString()})();
class SpoolProcessor extends AudioWorkletProcessor {
 constructor(options){super();this.core=new DSP(sampleRate,options.processorOptions.state);this.captureToken=0;this.mixRecording=false;this.mixToken=0;this.mixData=new Float32Array(16384);this.mixPosition=0;this.mixFrames=0;this.meterCounter=0;this.lastRecordStatus='idle';
 this.port.onmessage=event=>{const m=event.data;
  if(m.type==='state')this.core.setState(m.state);
  else if(m.type==='sample')this.core.setSample(m.index,m.pcm,m.sampleRate,m.preserve);
  else if(m.type==='start')this.core.start(m.rewind);
  else if(m.type==='stop')this.core.stop();
  else if(m.type==='rewind')this.core.rewind();
  else if(m.type==='retrigger')this.core.retrigger(m.index);
  else if(m.type==='seek')this.core.seek(m.index,m.ratio);
  else if(m.type==='panic')this.core.panic();
  else if(m.type==='brake')this.core.braking=!!m.active;
  else if(m.type==='scheduledDeck')this.core.queueDeck(m.index,m.options,m.frame);
  else if(m.type==='clearNotes')this.core.clearPatternNotes(m.source,m.frame,m.future);
  else if(m.type==='clearClocks')this.core.clearClockEvents();
  else if(m.type==='clock')this.core.queueClock(m.beat,m.tempo,m.playing,m.frame);
  else if(m.type==='noteOn')this.core.noteOn(m.note,m.velocity);
  else if(m.type==='noteOff')this.core.noteOff(m.note);
  else if(m.type==='mic')this.core.micEnabled=!!m.enabled;
  else if(m.type==='captureStart'){this.captureToken=m.token;this.core.startCapture(m.index,m.options);}
  else if(m.type==='captureStop'){const result=this.core.finishCapture(false);if(!result)this.port.postMessage({type:'captureIdle',token:this.captureToken});this.flushCaptures();}
  else if(m.type==='captureCancel'){this.core.cancelCapture();this.core.completed=[];this.captureToken=m.token;}
  else if(m.type==='mixStart'){this.mixToken=m.token;this.mixRecording=true;this.mixPosition=0;this.mixFrames=0;}
  else if(m.type==='mixStop'){if(m.token===this.mixToken){this.flushMix();this.mixRecording=false;}this.port.postMessage({type:'mixStopped',token:m.token});}else if(m.type==='mixCancel'){this.mixRecording=false;this.mixPosition=0;this.mixFrames=0;}
 };}
 flushCaptures(){while(this.core.completed.length){const result=this.core.completed.shift(),pcm=new Float32Array(result.pcm);result.pcm=pcm;this.port.postMessage({type:'deckRecorded',token:this.captureToken,result},[pcm.buffer]);}}
 flushMix(){if(this.mixPosition){const pcm=this.mixData.slice(0,this.mixPosition);this.port.postMessage({type:'mixChunk',token:this.mixToken,pcm},[pcm.buffer]);this.mixPosition=0;}}
 process(inputs,outputs){const output=outputs[0];if(!output||output.length<2)return true;const l=output[0],r=output[1];this.core.processBlock(l,r,inputs[0]?.[0],inputs[0]?.[1],currentFrame);this.flushCaptures();
  if(this.mixRecording){for(let i=0;i<l.length;i++){this.mixData[this.mixPosition++]=l[i];this.mixData[this.mixPosition++]=r[i];this.mixFrames++;if(this.mixPosition===this.mixData.length)this.flushMix();if(this.mixFrames>=sampleRate*180){this.flushMix();this.mixRecording=false;this.port.postMessage({type:'mixStopped',token:this.mixToken,limit:true});break;}}}
  if((this.meterCounter+=l.length)>=sampleRate/30){this.meterCounter=0;this.port.postMessage({type:'meters',meters:this.core.meters()});}return true;
 }
}registerProcessor('spool-tape',SpoolProcessor);`;}
  class SpoolAudio {
    constructor(state){
      this.state=state;this.context=null;this.node=null;this.mode=null;this.isPlaying=false;this.isRecording=false;this.deckRecording=null;this.micEnabled=false;
      this.onStatus=null;this.onDeckRecorded=null;this.onRecordingLimit=null;this.onRecordState=null;this.onStep=null;
      this._disposed=false;this._assets=Array(4).fill(null);this._assetKeys=Array(4).fill(null);this._waveforms=Array.from({length:4},()=>[]);this._mixChunks=[];this._mixFrames=0;
      this._captureToken=0;this._startToken=0;this._panicToken=0;this._micToken=0;this._keyTokens=new Map();this._keySequence=0;this._mixToken=0;
      this._meter={peak:0,rms:0,input:0,nodes:[0,0,0,0],decks:[0,0,0,0],positions:[0,0,0,0],waveform:[],recordSeconds:0,recordStatus:'idle',step:-1};
      this._loadAssets(state.assets||[]);
    }
    async init(){
      if(this._disposed)throw new Error('The audio engine has been closed.');if(this._initPromise)return this._initPromise;
      this._initPromise=(async()=>{
        const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('This browser does not support Web Audio.');
        try{this.context=new Context({latencyHint:'interactive',sampleRate:48000});}catch(_){this.context=new Context({latencyHint:'interactive'});}let url;
        if(this.context.audioWorklet&&window.AudioWorkletNode){try{url=URL.createObjectURL(new Blob([processorSource()],{type:'text/javascript'}));await this.context.audioWorklet.addModule(url);if(this._disposed)throw new Error('The audio engine has been closed.');this.node=new AudioWorkletNode(this.context,'spool-tape',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{state:stateForDSP(this.state)}});this.node.port.onmessage=event=>this._message(event.data);this.mode='worklet';}catch(error){this.node=null;}finally{if(url)URL.revokeObjectURL(url);}}
        if(this._disposed)throw new Error('The audio engine has been closed.');
        if(!this.node){this._core=new DSP(this.context.sampleRate,stateForDSP(this.state));this.node=this.context.createScriptProcessor(1024,2,2);this.mode='fallback';
          this.node.onaudioprocess=event=>{const left=event.outputBuffer.getChannelData(0),right=event.outputBuffer.getChannelData(1);this._core.processBlock(left,right,event.inputBuffer.getChannelData(0),event.inputBuffer.numberOfChannels>1?event.inputBuffer.getChannelData(1):null,Math.round(event.playbackTime*this.context.sampleRate));this._updateMeters(this._core.meters());this._drainCaptures();if(this.isRecording){const count=Math.min(left.length,Math.max(0,this.context.sampleRate*180-this._mixFrames)),pcm=new Float32Array(count*2);for(let i=0;i<count;i++){pcm[i*2]=left[i];pcm[i*2+1]=right[i];}this._mixChunks.push(pcm);this._mixFrames+=count;if(this._mixFrames>=this.context.sampleRate*180){this.isRecording=false;this.onRecordingLimit?.();}}};
        }
        this._output=this.context.createGain();this._output.gain.value=1;this.node.connect(this._output);this._output.connect(this.context.destination);this._loadAssets(this.state.assets||[],true);return this;
      })().catch(error=>{this._initPromise=null;this.node?.disconnect();this.node=null;this.context?.close().catch(()=>{});this.context=null;throw error;});return this._initPromise;
    }
    _send(message){if(!this.node)return;if(this.mode==='worklet'){this.node.port.postMessage(message);return;}const c=this._core;
      if(message.type==='state')c.setState(message.state);else if(message.type==='sample')c.setSample(message.index,message.pcm,message.sampleRate,message.preserve);else if(message.type==='start')c.start(message.rewind);else if(message.type==='stop')c.stop();else if(message.type==='rewind')c.rewind();else if(message.type==='retrigger')c.retrigger(message.index);else if(message.type==='seek')c.seek(message.index,message.ratio);else if(message.type==='panic')c.panic();else if(message.type==='brake')c.braking=!!message.active;else if(message.type==='scheduledDeck')c.queueDeck(message.index,message.options,message.frame);else if(message.type==='clearNotes')c.clearPatternNotes(message.source,message.frame,message.future);else if(message.type==='clearClocks')c.clearClockEvents();else if(message.type==='clock')c.queueClock(message.beat,message.tempo,message.playing,message.frame);else if(message.type==='noteOn')c.noteOn(message.note,message.velocity);else if(message.type==='noteOff')c.noteOff(message.note);else if(message.type==='mic')c.micEnabled=!!message.enabled;
      else if(message.type==='captureStart')c.startCapture(message.index,message.options);else if(message.type==='captureStop'){const result=c.finishCapture(false);this._drainCaptures();if(!result)this._captureIdle(message.token??this._captureToken);}else if(message.type==='captureCancel'){c.cancelCapture();c.completed=[];}
    }
    _drainCaptures(){while(this._core?.completed.length)this._finishDeck(this._core.completed.shift(),this._captureToken);}
    _message(message){if(message.type==='meters')this._updateMeters(message.meters);else if(message.type==='deckRecorded')this._finishDeck(message.result,message.token);else if(message.type==='captureIdle')this._captureIdle(message.token);else if(message.type==='mixChunk'){if(message.token===this._mixToken){this._mixChunks.push(message.pcm);this._mixFrames+=message.pcm.length/2;}}else if(message.type==='mixStopped'){if(message.token!==this._mixToken)return;this.isRecording=false;this._mixResolve?.();this._mixResolve=null;if(message.limit)this.onRecordingLimit?.();}}
    _updateMeters(meters){this._meter=meters;if(this.deckRecording&&meters.recording){this.deckRecording.status=meters.recording.status;this.onRecordState?.(Object.assign({},this.deckRecording,{seconds:meters.recordSeconds}));}if(meters.step!==this._lastStep){this._lastStep=meters.step;this.onStep?.(meters.step,this.context?.currentTime||0);}}
    _keyForAsset(asset){return !asset?null:asset.kind==='seed'?JSON.stringify(asset):`${asset.sampleRate}:${asset.channels}:${asset.frames}:${asset.pcm}`;}
    _loadAssets(assets,force=false){for(let i=0;i<4;i++){const asset=assets[i],key=this._keyForAsset(asset);if(key===this._assetKeys[i]){if(force){const cached=this._assets[i];this._send({type:'sample',index:i,pcm:cached?new Float32Array(cached.pcm):null,sampleRate:cached?.sampleRate||48000});}continue;}this._assetKeys[i]=key;try{const decoded=decodePCM(asset);this._assets[i]=decoded;this._waveforms[i]=this._peaks(decoded?.pcm);this._send({type:'sample',index:i,pcm:decoded?new Float32Array(decoded.pcm):null,sampleRate:decoded?.sampleRate||48000});}catch(error){this._assets[i]=null;this._waveforms[i]=[];this._send({type:'sample',index:i,pcm:null,sampleRate:48000});this.onStatus?.(`Deck ${i+1} could not load its audio: ${error.message}`);}}}
    _peaks(pcm){if(!pcm?.length)return[];const count=192,frames=pcm.length/2,result=new Array(count).fill(0);for(let at=0;at<count;at++){const from=Math.floor(at*frames/count),to=Math.max(from+1,Math.floor((at+1)*frames/count));let peak=0;for(let i=from;i<to&&i<frames;i++)peak=Math.max(peak,Math.abs(pcm[i*2]),Math.abs(pcm[i*2+1]));result[at]=peak;}return result;}
    setState(state){const assets=state.assets||[];if(this.deckRecording&&assets.some((a,i)=>this._keyForAsset(a)!==this._assetKeys[i]))this.cancelDeckRecording();this.state=state;this._send({type:'state',state:stateForDSP(state)});this._loadAssets(assets);}
    async start(){const token=++this._startToken,panic=this._panicToken;await this.init();if(token!==this._startToken||panic!==this._panicToken||this._disposed)return false;await this.context.resume();if(token!==this._startToken||panic!==this._panicToken||this._disposed)return false;this.isPlaying=true;this._send({type:'start',rewind:false});return true;}
    stop(){++this._startToken;if(this.deckRecording?.status==='armed')this.cancelDeckRecording();this.isPlaying=false;this._send({type:'stop'});this._meter.step=-1;this._keyTokens.clear();}
    rewind(){this._send({type:'rewind'});this._meter.positions=[0,0,0,0];}
    scheduleNativeNote(index,when,options={}) {
      if(!this.node||!this.context)throw new Error('Prepare ROTISSERIE before scheduling notes.');
      if(!Number.isInteger(index)||index<0||index>3||!Number.isFinite(when)||!Number.isFinite(options.duration)||options.duration<=0)throw new Error('Invalid ROTISSERIE deck note.');
      this._send({type:'scheduledDeck',index,options,frame:Math.round(when*this.context.sampleRate)});
    }
    cancelNativeNotes({source,when}={}){
      if(!this.context)return;const at=when===undefined?this.context.currentTime:Math.max(this.context.currentTime,Number(when));
      if(!Number.isFinite(at))throw new Error('Provide a valid cancellation timestamp.');
      this._send({type:'clearNotes',source,frame:Math.round(at*this.context.sampleRate),future:when!==undefined&&at>this.context.currentTime});
    }
    followTransport({beat,tempo,when,playing,revision}){
      if(!this.context||!this.node)return;
      if(revision!==this._clockRevision||!playing){this._clockRevision=revision;this._send({type:'clearClocks'});}
      this.isPlaying=!!playing;
      this._send({type:'clock',beat,tempo,playing:!!playing,frame:Math.round(when*this.context.sampleRate)});
    }
    async renderNativeEvents(state,events,options={}) {
      const check=()=>{if(options.signal?.aborted)throw new DOMException('Pattern render cancelled.','AbortError');};check();
      const snapshot=SpoolSchema.normalize(state),seconds=options.durationSeconds,tail=options.tailSeconds??0;
      if(!Number.isFinite(seconds)||seconds<=0||seconds>120||!Number.isFinite(tail)||tail<0||tail>15||!Array.isArray(events)||events.length>8192)throw new Error('Invalid ROTISSERIE render bounds.');
      const sampleRate=48000,core=new DSP(sampleRate,stateForDSP(snapshot));core.tempo=options.tempo??snapshot.tempo;snapshot.assets.forEach((asset,index)=>{const decoded=decodePCM(asset);if(decoded)core.setSample(index,decoded.pcm,decoded.sampleRate);});
      for(const event of events){if(!Number.isInteger(event.voice)||event.voice<0||event.voice>3||!Number.isFinite(event.at)||event.at<0||event.at>=seconds||!Number.isFinite(event.velocity)||event.velocity<0||event.velocity>1)throw new Error('Invalid ROTISSERIE render note.');core.queueDeck(event.voice,{velocity:event.velocity,pitch:event.pitch||0,duration:event.duration},Math.round(event.at*sampleRate));}
      const frames=Math.ceil((seconds+tail)*sampleRate),chunks=[];let at=0,block=0;
      while(at<frames){const count=Math.min(4096,frames-at),left=new Float32Array(count),right=new Float32Array(count),pcm=new Float32Array(count*2);core.processBlock(left,right);
        for(let i=0;i<count;i++){const gain=Math.min(1,(frames-at-i-1)/480);pcm[i*2]=left[i]*gain;pcm[i*2+1]=right[i]*gain;}chunks.push(pcm);at+=count;if(++block%16===0){check();await new Promise(resolve=>setTimeout(resolve,0));}}
      check();return{blob:wavBlob(chunks,frames,sampleRate),sampleRate,duration:frames/sampleRate};
    }
    async retrigger(index){const panic=this._panicToken;await this.init();if(panic!==this._panicToken||this._disposed)return false;await this.context.resume();if(panic!==this._panicToken||this._disposed)return false;this._send({type:'retrigger',index:clamp(index,0,3)|0});return true;}
    seekDeck(index,ratio){this._send({type:'seek',index:clamp(index,0,3)|0,ratio:clamp(ratio,0,1)});}
    brake(active){this._send({type:'brake',active:!!active});}
    panic(){++this._panicToken;this.stop();this.cancelDeckRecording();++this._micToken;this._disconnectMic();++this._mixToken;this.isRecording=false;if(this.node&&this.mode==='worklet')this.node.port.postMessage({type:'mixCancel'});this._mixResolve?.();this._mixResolve=null;this._send({type:'panic'});this._meter={peak:0,rms:0,input:0,nodes:[0,0,0,0],decks:[0,0,0,0],positions:[0,0,0,0],waveform:[],recordSeconds:0,recordStatus:'idle',step:-1};}
    async noteOn(note,velocity=1){note=clamp(note,24,108)|0;const token=++this._keySequence;this._keyTokens.set(note,token);const panic=this._panicToken;await this.init();if(this._keyTokens.get(note)!==token||panic!==this._panicToken||this._disposed)return false;await this.context.resume();if(this._keyTokens.get(note)!==token||panic!==this._panicToken||this._disposed)return false;this._send({type:'noteOn',note,velocity});return true;}
    noteOff(note){note=clamp(note,24,108)|0;this._keyTokens.set(note,++this._keySequence);this._send({type:'noteOff',note});}
    getMeters(){const deckSeconds=this._meter.recordSeconds||0,mixSeconds=this._mixFrames/(this.context?.sampleRate||48000);return Object.assign({},this._meter,{decks:this._meter.decks.slice(),nodes:this._meter.nodes.slice(),positions:this._meter.positions.slice(),waveform:this._meter.waveform.slice(),deckRecordSeconds:deckSeconds,mixRecordSeconds:mixSeconds,recordSeconds:this.isRecording?mixSeconds:deckSeconds});}
    getWaveform(index){return(this._waveforms[index]||[]).slice();}
    getPlaybackRate(index){const deck=this.state.decks?.[index],asset=this._assets[index];if(!deck||!asset)return 0;const seconds=Math.max(.002,deck.end-deck.start)*asset.pcm.length/2/asset.sampleRate,rate=deck.rate*(deck.sync?seconds/(deck.beats*60/this.state.tempo):1)*(deck.reverse?-1:1);return clamp(rate,-12,12);}
    _disconnectMic(){this._micNode?.disconnect();this._micNode=null;this._stream?.getTracks().forEach(track=>track.stop());this._stream=null;this.micEnabled=false;this._send({type:'mic',enabled:false});}
    async setMic(enabled){const token=++this._micToken,panic=this._panicToken;if(!enabled){this._disconnectMic();return false;}await this.init();if(token!==this._micToken||panic!==this._panicToken||this._disposed)return false;if(this.micEnabled)return true;
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone input needs HTTPS or localhost in this browser. The built-in keys work without a microphone.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:2},video:false});if(token!==this._micToken||panic!==this._panicToken||this._disposed){stream.getTracks().forEach(track=>track.stop());return false;}
      this._stream=stream;this._micNode=this.context.createMediaStreamSource(stream);this._micNode.connect(this.node);this.micEnabled=true;this._send({type:'mic',enabled:true});try{await this.context.resume();}catch(error){if(this._stream===stream)this._disconnectMic();else stream.getTracks().forEach(track=>track.stop());throw error;}if(token!==this._micToken||panic!==this._panicToken||this._disposed){if(this._stream===stream)this._disconnectMic();else stream.getTracks().forEach(track=>track.stop());return false;}return true;
    }
    async decodeSample(file){await this.init();const decoded=await this.context.decodeAudioData(await file.arrayBuffer()),sampleRate=Math.min(48000,decoded.sampleRate),sourceFrames=Math.min(decoded.length,Math.round(decoded.sampleRate*30)),frames=Math.max(1,Math.floor(sourceFrames*sampleRate/decoded.sampleRate)),pcm=new Float32Array(frames*2);let peak=0;
      for(let i=0;i<frames;i++){const position=i*decoded.sampleRate/sampleRate,at=Math.floor(position),fraction=position-at;for(let ch=0;ch<2;ch++){const data=decoded.getChannelData(Math.min(ch,decoded.numberOfChannels-1)),value=data[at]+(data[Math.min(sourceFrames-1,at+1)]-data[at])*fraction;pcm[i*2+ch]=Number.isFinite(value)?value:0;peak=Math.max(peak,Math.abs(pcm[i*2+ch]));}}
      if(peak>1)for(let i=0;i<pcm.length;i++)pcm[i]/=peak;return encodePCM(pcm,sampleRate,file.name||'Imported loop');
    }
    async startDeckRecording(index,options={}){if(this.deckRecording)throw new Error('Finish the current deck recording first.');index=clamp(index,0,3)|0;const token=++this._captureToken,panic=this._panicToken,transportToken=this._startToken;this.deckRecording={index,mode:options.mode==='overdub'?'overdub':'replace',status:'armed'};this.onRecordState?.(Object.assign({},this.deckRecording,{seconds:0}));
      try{await this.init();if(token!==this._captureToken||panic!==this._panicToken||transportToken!==this._startToken||this._disposed){if(token===this._captureToken)this.cancelDeckRecording();return false;}await this.context.resume();if(token!==this._captureToken||panic!==this._panicToken||transportToken!==this._startToken||this._disposed){if(token===this._captureToken)this.cancelDeckRecording();return false;}
        const opts=Object.assign({},this.state.record||{},options);if((opts.input==='mic'||opts.input==='both')&&!this.micEnabled)throw new Error('Enable the microphone before recording microphone input.');if(opts.mode==='overdub'&&!this._assets[index])throw new Error('Record or import a loop before overdubbing.');
        const wasPlaying=this.isPlaying;if(!wasPlaying){this.rewind();this.isPlaying=true;this._send({type:'start',rewind:false});opts.quantize=false;}
        this.deckRecording={index,mode:opts.mode==='overdub'?'overdub':'replace',status:opts.quantize&&wasPlaying?'armed':'recording'};this._send({type:'captureStart',index,options:opts,token});this.onRecordState?.(Object.assign({},this.deckRecording,{seconds:0}));return true;
      }catch(error){if(token===this._captureToken){this.deckRecording=null;this.onRecordState?.({index,mode:options.mode||'replace',status:'idle',seconds:0});}throw error;}
    }
    async stopDeckRecording(){const token=this._captureToken;if(!this.deckRecording)return null;if(this._initPromise)await this._initPromise;if(token!==this._captureToken||!this.deckRecording)return null;await this.context.resume();if(token!==this._captureToken||!this.deckRecording)return null;return new Promise(resolve=>{this._captureResolve=resolve;this._send({type:'captureStop',token});});}
    cancelDeckRecording(){const old=this.deckRecording;++this._captureToken;this.deckRecording=null;this._send({type:'captureCancel',token:this._captureToken});this._captureResolve?.(null);this._captureResolve=null;if(old)this.onRecordState?.({index:old.index,mode:old.mode,status:'idle',seconds:0});}
    _captureIdle(token){if(token!==this._captureToken)return;const old=this.deckRecording;this.deckRecording=null;this._captureResolve?.(null);this._captureResolve=null;this.onRecordState?.({index:old?.index||0,mode:old?.mode||'replace',status:'idle',seconds:0});}
    _finishDeck(raw,token){if(token!==this._captureToken||this._disposed)return;this.deckRecording=null;let pcm=raw.pcm,sampleRate=raw.sampleRate;if(sampleRate>48000){const count=Math.floor(pcm.length/2*48000/sampleRate),down=new Float32Array(count*2);for(let i=0;i<count;i++){const pos=i*sampleRate/48000,at=Math.floor(pos),f=pos-at;for(let ch=0;ch<2;ch++)down[i*2+ch]=pcm[at*2+ch]*(1-f)+pcm[Math.min(pcm.length/2-1,at+1)*2+ch]*f;}pcm=down;sampleRate=48000;}
      const asset=encodePCM(pcm,sampleRate,`${this.state.decks[raw.index]?.name||'Deck '+(raw.index+1)} — ${raw.mode==='overdub'?'overdub':'take'}`),result=Object.assign({},raw,{asset});delete result.pcm;
      this._assets[raw.index]={pcm,sampleRate};this._waveforms[raw.index]=this._peaks(pcm);const next=Object.assign({},this.state,{assets:(this.state.assets||[]).slice(),decks:this.state.decks.map(d=>Object.assign({},d))});next.assets[raw.index]=asset;
      if(raw.mode==='replace')Object.assign(next.decks[raw.index],{start:0,end:1,phase:0,rate:1,reverse:false,sync:raw.complete,beats:raw.complete?raw.beats:4});this.state=next;this._assetKeys[raw.index]=this._keyForAsset(asset);this._send({type:'sample',index:raw.index,pcm:new Float32Array(pcm),sampleRate,preserve:raw.mode==='overdub'});this._send({type:'state',state:stateForDSP(next)});this.onRecordState?.({index:raw.index,mode:raw.mode,status:'idle',seconds:0});this.onDeckRecorded?.(result);this._captureResolve?.(result);this._captureResolve=null;
    }
    async startRecording(){if(this.isRecording)return false;const token=this._mixToken=(this._mixToken||0)+1;this.isRecording=true;this._mixChunks=[];this._mixFrames=0;
      this._mixStartPromise=(async()=>{await this.init();if(token!==this._mixToken||!this.isRecording||this._disposed)return false;await this.context.resume();if(token!==this._mixToken||!this.isRecording||this._disposed)return false;if(this.mode==='worklet')this.node.port.postMessage({type:'mixStart',token});return true;})();try{return await this._mixStartPromise;}catch(error){if(token===this._mixToken)this.isRecording=false;throw error;}
    }
    async stopRecording(){const token=this._mixToken,startPromise=this._mixStartPromise;if(startPromise)await startPromise;if(token!==this._mixToken||this._disposed)return wavBlob([],0,this.context?.sampleRate||48000);if(this.isRecording&&this.mode==='worklet'){await this.context.resume();if(token!==this._mixToken||this._disposed)return wavBlob([],0,this.context?.sampleRate||48000);await new Promise(resolve=>{this._mixResolve=resolve;this.node.port.postMessage({type:'mixStop',token});});}if(token!==this._mixToken||this._disposed)return wavBlob([],0,this.context?.sampleRate||48000);this.isRecording=false;++this._mixToken;const blob=wavBlob(this._mixChunks,this._mixFrames,this.context?.sampleRate||48000);this._mixChunks=[];this._mixFrames=0;return blob;}
    async renderWav(bars=4,tailSeconds=4,options={}){const state=JSON.parse(JSON.stringify(stateForDSP(this.state))),lengthBars=Math.round(clamp(Number(bars)||4,1,16)),playSeconds=lengthBars*240/clamp(state.tempo,40,180),seconds=playSeconds+clamp(Number(tailSeconds)||0,0,15);return this._render(state,seconds,playSeconds,options);}
    async renderDeckWav(index,options={}){index=clamp(index,0,3)|0;if(!this._assets[index])throw new Error('This deck has no loop to export.');const state=JSON.parse(JSON.stringify(stateForDSP(this.state))),d=state.decks[index],asset=this._assets[index],regionSeconds=Math.max(.002,d.end-d.start)*asset.pcm.length/2/asset.sampleRate,rate=clamp(d.sync?regionSeconds/(d.beats*60/state.tempo)*d.rate:d.rate,-12,12),seconds=Math.min(120,regionSeconds/Math.max(.02,Math.abs(rate)));state.decks.forEach((deck,i)=>{deck.mute=i!==index;deck.solo=false;});d.level=1;d.pan=0;state.master={volume:.9,width:1,echo:0,feedback:0,space:0};return this._render(state,seconds,seconds,options);}
    async _render(state,seconds,playSeconds,options={}){const checkCancelled=()=>{if(options.signal?.aborted)throw new DOMException('Audio export cancelled.','AbortError');};checkCancelled();const sampleRate=48000,core=new DSP(sampleRate,state);this._assets.forEach((asset,i)=>{if(asset)core.setSample(i,new Float32Array(asset.pcm),asset.sampleRate);});core.start(true);core.decks.forEach(d=>{d.prepare(core.tempo,true,core.decks.some(x=>x.target.solo),128);d.rate=d.targetRate;});const totalFrames=Math.round(seconds*sampleRate),stopAt=Math.round(playSeconds*sampleRate),chunks=[];let rendered=0;this.onStatus?.('Rendering stereo tape audio…');
      while(rendered<totalFrames){checkCancelled();const count=Math.min(4096,totalFrames-rendered),pcm=new Float32Array(count*2);for(let at=0;at<count;at+=128){if(rendered+at>=stopAt)core.stop();const size=Math.min(128,count-at),l=new Float32Array(size),r=new Float32Array(size);core.processBlock(l,r);for(let i=0;i<size;i++){const frame=rendered+at+i,fade=sampleRate*.012,gain=Math.max(0,Math.min(1,frame/fade,(totalFrames-frame-1)/fade));pcm[(at+i)*2]=l[i]*gain;pcm[(at+i)*2+1]=r[i]*gain;}}chunks.push(pcm);rendered+=count;await new Promise(resolve=>setTimeout(resolve,0));}checkCancelled();return wavBlob(chunks,totalFrames,sampleRate);}
    dispose(){this.panic();this._disposed=true;this.isRecording=false;++this._mixToken;this._mixResolve?.();this._mixResolve=null;this.node?.disconnect();this._output?.disconnect();this.context?.close().catch(()=>{});this._assets=[];this._mixChunks=[];}
  }
  SpoolAudio.decodePCM=decodePCM;SpoolAudio.encodePCM=encodePCM;SpoolAudio.wavBlob=wavBlob;window.SpoolAudio=SpoolAudio;
})();
