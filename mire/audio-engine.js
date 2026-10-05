/* REDUCE: one DSP engine for AudioWorklet, standalone fallback, and real PCM export. */
(function () {
  'use strict';
  function createMireDSP() {
    const PI = Math.PI, TAU = PI * 2;
    const finite = (x, fallback = 0) => Number.isFinite(+x) ? +x : fallback;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, finite(x, a)));
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    const soft = x => x / (1 + Math.abs(x));
    const divisions = {'1/16':.25, '1/8':.5, '3/16':.75, '1/4':1, '3/8':1.5, '1/2':2, '3/4':3, '1/1':4};
    function read(buffer, position) {
      const length = buffer.length;
      position = (position % length + length) % length;
      const i = Math.floor(position), fraction = position - i;
      return buffer[i] + (buffer[(i + 1) % length] - buffer[i]) * fraction;
    }
    function blep(t, dt) {
      if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
      if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
      return 0;
    }
    class Node {
      constructor(sr, index) {
        this.sr = sr; this.index = index;
        this.memory = new Float32Array(Math.ceil(sr * 6.5) + 8); this.write = 0;
        this.comb = new Float32Array(Math.ceil(sr / 24) + 8); this.combWrite = 0;
        this.allpasses = [.0113, .0197, .0311, .0043, .0029, .0017].map(t => ({data:new Float32Array(Math.max(8, Math.round(sr*t*8)+8)), index:0, base:sr*t, delay:sr*t}));
        this.modes = Array.from({length:6}, () => ({y1:0, y2:0, a:0, b:0, input:0, gain:0}));
        this.values = {time:240, pitch:48, tone:6000, decay:.65, resonance:.4, drift:0, pan:0, level:.7, model:'tape', mute:false};
        this.target = Object.assign({}, this.values); this.cloudLP=0; this.lp = 0; this.dc = 0; this.combLP = 0; this.rms = 0;
        this.phase = index * 1.729; this.cloudPhase = index * .23; this.lastModel = 'tape'; this.coefficient = .3;
        this.delaySlew=1-Math.exp(-1/(sr*.045)); this.freezeSlew=1-Math.exp(-1/(sr*.015)); this.freezeBlend=0; this.panL = .707; this.panR = .707; this.delay = sr*.24; this.lastOut = 0;
      }
      clear() {
        this.memory.fill(0); this.comb.fill(0); this.allpasses.forEach(a=>a.data.fill(0));
        this.modes.forEach(m=>{m.y1=0;m.y2=0;}); this.cloudLP=this.lp = this.dc = this.combLP = this.lastOut = this.rms = 0;
      }
      prepare(target, modulation, garden, tempo, count) {
        const v = this.values, k = 1 - Math.exp(-count / (this.sr * .055));
        const keys = ['time','pitch','tone','decay','resonance','drift','pan','level'];
        keys.forEach(key => { v[key] += (target[key] - v[key]) * k; });
        v.model = target.model; v.mute = target.mute;
        const time = target.sync ? 60000 / tempo * (divisions[target.division] || .5) : v.time;
        this.delayTarget = clamp(time * Math.pow(2, modulation.time || 0), 12, 6000) * this.sr / 1000;
        this.pitch = clamp(midi(v.pitch + (modulation.pitch || 0) * 12), 24, this.sr*.16);
        const cutoff = clamp(v.tone * Math.pow(2, (modulation.tone || 0)*3), 80, this.sr*.43);
        this.coefficient = 1 - Math.exp(-TAU * cutoff / this.sr);
        this.decay = clamp(v.decay + (modulation.decay || 0)*.3, .01, .985);
        const pan = clamp(v.pan + (modulation.pan || 0), -1, 1);
        this.panL = Math.cos((pan+1)*PI/4); this.panR = Math.sin((pan+1)*PI/4);
        this.freeze = !!garden.freeze; this.damping = garden.damping;
        this.combDelay = clamp(this.sr/this.pitch, 3, this.comb.length-3);
        this.combFeedback = .78 + v.resonance*.195;
        this.allpasses.forEach(ap=>{ap.delay=clamp(ap.base*midi(60)/this.pitch,3,ap.data.length-3);});
        const ratios = [1,1.018,2.72,5.14,8.36,12.36], weights = [1,.65,.7,.4,.22,.12];
        let weightSum = 0;
        this.modes.forEach((m,i) => {
          const frequency = this.pitch * ratios[i];
          if (frequency >= this.sr*.43) { m.gain=0; return; }
          const seconds = (.1 + v.resonance*2.8) / (1 + i*.24 + garden.damping*2);
          const radius = Math.exp(-6.907755 / (seconds*this.sr)), omega = TAU*frequency/this.sr;
          m.a = 2*radius*Math.cos(omega); m.b = radius*radius;
          m.input = 2*(1-radius)*Math.sin(omega); m.gain = weights[i]; weightSum += weights[i];
        });
        this.modes.forEach(m=>{m.gain/=weightSum||1;});
        if (this.lastModel !== v.model) {
          // Keep the circulating delay intact, but do not reinterpret another
          // resonator's internal state at a new set of pole frequencies.
          this.modes.forEach(m=>{m.y1=0;m.y2=0;}); this.comb.fill(0);
          this.allpasses.forEach(a=>a.data.fill(0)); this.lastModel=v.model;
        }
      }
      allpass(value, which, amount) {
        const ap=this.allpasses[which], delayed=read(ap.data,ap.index-ap.delay);
        const output=delayed-amount*value;
        ap.data[ap.index]=value+amount*output;
        ap.index=(ap.index+1)%ap.data.length;
        return output;
      }
      tick(input, drive) {
        const v=this.values, sr=this.sr;
        this.delay += (this.delayTarget-this.delay) * this.delaySlew;
        this.phase += TAU*(.07+this.index*.029)/sr;
        if (this.phase>TAU) this.phase-=TAU;
        const wander = Math.sin(this.phase)*v.drift*sr*.0035;
        let delayed = read(this.memory,this.write-this.delay-wander), output=delayed;
        this.freezeBlend += ((this.freeze?1:0)-this.freezeBlend) * this.freezeSlew;
        if (this.freezeBlend<.99999) {
          this.lp += this.coefficient*(delayed-this.lp);
          output = this.lp;
          if (v.model==='string') {
            const echoed=read(this.comb,this.combWrite-this.combDelay);
            this.combLP += (.15+this.coefficient*.8)*(echoed-this.combLP);
            this.comb[this.combWrite]=(1-this.combFeedback)*output+this.combFeedback*this.combLP;
            this.combWrite=(this.combWrite+1)%this.comb.length;
            output = output*(1-v.resonance*.8)+echoed*v.resonance*.8;
          } else if (v.model==='diffuser') {
            const spread=.25+v.resonance*.43;
            output=this.allpass(output,0,spread); output=this.allpass(output,1,-spread*.89); output=this.allpass(output,2,spread*.8);
          } else if (v.model==='bowl') {
            let modal=0;
            for(let modeIndex=0;modeIndex<this.modes.length;modeIndex++){
              const m=this.modes[modeIndex];if (!m.gain) continue;
              const y=m.input*output+m.a*m.y1-m.b*m.y2;
              m.y2=m.y1; m.y1=Math.abs(y)<1e-22?0:y; modal+=y*m.gain;
            }
            output=output*(1-v.resonance*.87)+modal*v.resonance*.87;
          } else if (v.model==='spring') {
            output=this.allpass(output,3,.55); output=this.allpass(output,4,-.61); output=this.allpass(output,5,.68);
            const echoed=read(this.comb,this.combWrite-this.combDelay*1.003);
            this.comb[this.combWrite]=output*.22+echoed*.76;
            this.combWrite=(this.combWrite+1)%this.comb.length;
            output=output*(1-v.resonance*.6)+echoed*v.resonance*.6;
          } else if (v.model==='cloud') {
            // Two complementary grains provide continuous, interpolated reads
            // at a pitch-shifted rate; their windows always sum to one.
            const size=sr*(.06+v.resonance*.18), ratio=this.pitch/midi(60);
            this.cloudPhase=(this.cloudPhase+(1-ratio)/size+1)%1;
            const p=this.cloudPhase, q=(p+.5)%1, weight=.5-.5*Math.cos(TAU*p);
            const a=read(this.memory,this.write-this.delay-size*p-wander), b=read(this.memory,this.write-this.delay-size*q-wander);
            this.cloudLP+=this.coefficient*(a*weight+b*(1-weight)-this.cloudLP);
            output=this.cloudLP*.85+this.lp*.15;
          } else {
            // Tape's rounded magnetic transfer responds to drive without
            // introducing a hidden positive gain around the feedback loop.
            const strength=.2+drive*1.8+v.resonance*.8;
            const mode=this.modes[0], ringing=mode.input*output+mode.a*mode.y1-mode.b*mode.y2;
            mode.y2=mode.y1;mode.y1=ringing;output=output*(1-v.resonance*.25)+ringing*v.resonance*.25;
            output=Math.tanh(output*strength)/strength;
          }
          output *= 1-this.damping*.16;
          this.dc += .0008*(output-this.dc); output-=this.dc;
          output=output*(1-this.freezeBlend)+delayed*this.freezeBlend;
        }
        if (!Number.isFinite(output)) { output=0; this.clear(); }
        // A high-state soft guard acts only near implausible internal levels.
        if (Math.abs(output)>1.25) output=Math.sign(output)*(1.25+.2*Math.tanh((Math.abs(output)-1.25)/.2));
        this.memory[this.write]=clamp(input,-2,2); this.write=(this.write+1)%this.memory.length;
        if (v.mute) output=0;
        this.lastOut=output; this.rms+=.001*(output*output-this.rms);
        return output;
      }
    }
    class Core {
      constructor(sampleRate,state,seed=0x4d495245) {
        this.sr=clamp(sampleRate,8000,192000); this.frame=0; this.seed=(seed>>>0)||1;
        this.nodes=Array.from({length:4},(_,i)=>new Node(this.sr,i)); this.samples=Array(4).fill(null);
        this.voices=[]; this.events=[]; this.cancellations=[]; this.previous=new Float64Array(4); this.injection=new Float64Array(4);
        this.phase=[0,.37]; this.randomOld=[0,0]; this.randomNext=[0,0]; this.lfo=[0,0];
        this.master={volume:.65,mix:.65,drive:.15,width:.8}; this.garden={circulation:.7,damping:.25,freeze:false};
        this.limiter=1; this.outDC=[0,0]; this.peak=0; this.rms=0; this.clipped=false; this.micDestination=0; this.micGain=0;
        this.inputSlew=1-Math.exp(-1/(this.sr*.008)); this.freezeRouteSlew=1-Math.exp(-1/(this.sr*.02)); this.inputGate=state?.garden?.freeze?0:1; this.freezeRouteBlend=0; this.circulation=.7; this.clearRemaining=0; this.clearStage=0; this.clearLength=Math.max(32,Math.round(this.sr*.008));
        this.waveform=new Float32Array(128); this.waveWrite=0; this.waveCount=0;
        this.setState(state||{}); this.nodes.forEach(n=>Object.assign(n.values,n.target));
      }
      random() { let x=this.seed; x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296; }
      setState(state) {
        this.state=state||{}; this.tempo=clamp(this.state.tempo||96,40,200);
        const baseNodes=['tape','string','diffuser','bowl'];
        this.nodes.forEach((n,i)=>{
          const raw=(this.state.nodes||[])[i]||{};
          n.target={model:['tape','string','diffuser','bowl','spring','cloud'].includes(raw.model)?raw.model:baseNodes[i],
            time:clamp(raw.time===undefined?240:raw.time,20,1500),sync:!!raw.sync,division:raw.division||'1/8',
            pitch:clamp(raw.pitch===undefined?48:raw.pitch,24,96),tone:clamp(raw.tone===undefined?6000:raw.tone,120,18000),
            decay:clamp(raw.decay===undefined?.65:raw.decay,.05,.98),resonance:clamp(raw.resonance===undefined?.4:raw.resonance,0,1),
            drift:clamp(raw.drift||0,0,1),pan:clamp(raw.pan||0,-1,1),level:clamp(raw.level===undefined?.7:raw.level,0,1.25),mute:!!raw.mute};
        });
        this.routes=Array.from({length:4},(_,i)=>{
          const row=Array.from({length:4},(_,j)=>clamp((this.state.routing||[])[i]?.[j]||0,0,1));
          const sum=row.reduce((a,b)=>a+b,0); return row.map(x=>x/Math.max(1,sum));
        });
        this.masterTarget=Object.assign({volume:.65,mix:.65,drive:.15,width:.8},this.state.master||{});
        Object.keys(this.masterTarget).forEach(k=>{this.masterTarget[k]=clamp(this.masterTarget[k],0,1);});
        this.gardenTarget=Object.assign({circulation:.7,damping:.25,freeze:false},this.state.garden||{});
        this.gardenTarget.circulation=clamp(this.gardenTarget.circulation,0,1); this.gardenTarget.damping=clamp(this.gardenTarget.damping,0,1);
        this.modulators=Array.from({length:2},(_,i)=>Object.assign({shape:'sine',rate:.15,depth:0,target:'none'},(this.state.modulators||[])[i]||{}));
      }
      setSample(index,pcm,sampleRate) {
        if(index<0||index>3)return;
        this.samples[index]=pcm&&pcm.length?{pcm,sampleRate:clamp(sampleRate,8000,192000)}:null;
      }
      trigger(event) {
        if(this.cancellations.some(c=>(!c.source||c.source===event.source)&&event.frame>=c.frame))return false;
        const item={source:typeof event.source==='string'?event.source:'native',index:clamp(event.index,0,3)|0,velocity:clamp(event.velocity===undefined?1:event.velocity,.05,1),frame:Math.max(this.frame,Math.round(finite(event.frame,this.frame))),note:Number.isFinite(event.note)?clamp(event.note,0,127):null,durationSeconds:Number.isFinite(event.durationSeconds)?clamp(event.durationSeconds,.001,15360):null,audition:!!event.audition,destination:clamp(event.destination||0,0,3)|0};
        const queue=this.events;
        if(!queue.length||queue[queue.length-1].frame<=item.frame)queue.push(item);
        else{let low=0,high=queue.length;while(low<high){const middle=(low+high)>>>1;if(queue[middle].frame<=item.frame)low=middle+1;else high=middle;}queue.splice(low,0,item);}
        if(this.events.length>8192)this.events.splice(8192);
      }
      stopSources(source,frame=this.frame) {frame=Math.max(this.frame,Math.round(Number.isFinite(frame)?frame:this.frame));if(frame>this.frame){this.events=this.events.filter(e=>(source&&e.source!==source)||e.frame<frame);if(this.cancellations.length>=256)throw new Error('The cancellation queue is full.');this.cancellations.push({source,frame});this.cancellations.sort((a,b)=>a.frame-b.frame);return;}this.cancellations=source?this.cancellations.filter(c=>c.source!==source):[];this.events=source?this.events.filter(e=>e.source!==source):[];this.voices.forEach(v=>{if(!source||v.source===source)v.release=Math.min(v.release||Infinity,this.sr*.012);}); }
      clear(immediate=false,preservePending=false) {
        if(!preservePending){this.events=[];this.voices=[];this.cancellations=[];}
        if(immediate) {this.nodes.forEach(n=>n.clear());this.previous.fill(0);this.outDC=[0,0];this.limiter=1;this.peak=0;this.rms=0;this.clipped=false;this.waveform.fill(0);this.clearRemaining=0;this.clearStage=0;return;}
        this.clearRemaining=this.clearLength;this.clearStage=1;
      }
      addVoice(event) {
        if(this.gardenTarget.freeze)return;
        const source=event.audition?{kind:'dust',pitch:this.nodes[event.destination].values.pitch,decay:90,tone:11000,texture:.75,level:.9,destination:event.destination,mute:false}:((this.state.sources||[])[event.index]||{});
        if(source.mute)return;
        const kind=['drop','pluck','dust','chime','reed','pulse','bow','sample'].includes(source.kind)?source.kind:'drop';
        const frequency=clamp(midi(event.note===null?clamp(source.pitch===undefined?60:source.pitch,24,96):event.note),20,this.sr*.2);
        const voice={kind,source:event.source,index:event.index,age:0,phase:0,low:0,dc:0,frequency,decay:clamp(source.decay===undefined?300:source.decay,15,10000)/1000,
          texture:clamp(source.texture||0,0,1),level:clamp(source.level===undefined?.65:source.level,0,1)*event.velocity,
          cutoff:clamp(source.tone===undefined?8000:source.tone,120,this.sr*.43),destination:clamp(source.destination||0,0,3)|0,
          gateFrames:event.durationSeconds===null?Infinity:Math.round(event.durationSeconds*this.sr),attack:({drop:.001,pluck:.001,dust:.003,chime:.002,reed:.007,pulse:.002,bow:.028,sample:.002})[kind],release:Infinity};
        voice.coefficient=1-Math.exp(-TAU*voice.cutoff/this.sr);
        if(kind==='pluck') {
          voice.buffer=new Float32Array(Math.max(4,Math.round(this.sr/frequency)));voice.write=0;let low=0;
          for(let i=0;i<voice.buffer.length;i++){const white=this.random()*2-1;low+=voice.coefficient*(white-low);voice.buffer[i]=low*.7;}
          voice.feedback=Math.exp(-6.907755/(frequency*voice.decay));voice.pluckLow=0;
        }
        if(kind==='sample') {voice.sample=this.samples[event.index];if(!voice.sample)return;voice.position=0;voice.increment=voice.sample.sampleRate/this.sr*Math.pow(2,((event.note===null?finite(source.pitch,60):event.note)-60)/12);}
        if(this.voices.length>=48)this.voices.shift();
        this.voices.push(voice);
      }
      sourceTick(v) {
        const t=v.age/this.sr, white=this.random()*2-1, phase=v.phase;
        let value=0, envelope=Math.min(1,t/v.attack)*Math.exp(-6.907755*Math.max(0,t-v.attack)/v.decay);
        if(v.kind==='drop') {
          const frequency=Math.min(this.sr*.42,v.frequency*(1+3.2*Math.exp(-t*45))); v.phase+=TAU*frequency/this.sr;
          value=Math.sin(v.phase)*(1-v.texture*.45)+white*v.texture*Math.exp(-t*80);
        } else if(v.kind==='pluck') {
          value=v.buffer[v.write];v.pluckLow+= (.12+.8*v.coefficient)*(value-v.pluckLow);
          v.buffer[v.write]=((1-v.texture*.5)*v.pluckLow+v.texture*.5*value)*v.feedback;v.write=(v.write+1)%v.buffer.length;
          envelope=Math.min(1,t/v.attack);
        } else if(v.kind==='dust') {
          const rate=(70+v.texture*v.texture*11000)*Math.sqrt(v.frequency/440);
          value=(this.random()<rate/this.sr?white*2.5:0)+white*.1*(1-v.texture);
        } else if(v.kind==='chime') {
          v.phase+=TAU*v.frequency/this.sr;
          const second=v.frequency*3.3<this.sr*.43?.5*Math.sin(v.phase*2.756+v.texture*Math.sin(v.phase*.5))*Math.exp(-t/v.decay*2):0;
          const third=v.frequency*5.404<this.sr*.43?.25*Math.sin(v.phase*5.404)*Math.exp(-t/v.decay*4):0;
          value=(Math.sin(v.phase)+second+third)*.65;
        } else if(v.kind==='reed'||v.kind==='pulse') {
          const delta=v.frequency/this.sr*(v.kind==='reed'?1+Math.sin(TAU*t*5.3)*.0025*v.texture:1);
          const p=phase/TAU, duty=v.kind==='reed'?.28+v.texture*.12:.08+v.texture*.84;
          const shifted=(p-duty+1)%1;
          value=(p<duty?1:-1)+blep(p,delta)-blep(shifted,delta);
          if(v.kind==='reed')value=Math.tanh(value*1.3)*.7+white*v.texture*.18;
          v.phase=((p+delta)%1)*TAU;
        } else if(v.kind==='bow') {
          v.phase=(phase+TAU*v.frequency/this.sr)%TAU;
          value=(2/PI*Math.asin(Math.sin(v.phase))*.65+Math.sin(v.phase*2)*.2+white*v.texture*.17)*(1+Math.sin(TAU*t*6.1)*v.texture*.12);
        } else if(v.kind==='sample') {
          const pcm=v.sample.pcm, index=Math.floor(v.position), blend=v.position-index;
          if(index>=pcm.length-1){v.done=true;return 0;}
          value=pcm[index]+(pcm[index+1]-pcm[index])*blend;v.position+=v.increment;
          if(v.texture>0){const drive=1+v.texture*4,colored=Math.tanh(value*drive)/Math.sqrt(drive);value=value*(1-v.texture)+colored*v.texture;}
          envelope=Math.min(1,t/.002,Math.max(0,(pcm.length-v.position)/(this.sr*.004*v.increment)));
          envelope*=Math.exp(-6.907755*t/Math.max(.015,v.decay));
        }
        v.low+=v.coefficient*(value-v.low);v.dc+=.0015*(v.low-v.dc);
        v.age++;if(v.age>=v.gateFrames&&v.release===Infinity)v.release=this.sr*.012;
        const release=Number.isFinite(v.release)?Math.max(0,v.release--)/(this.sr*.012):1;
        const done=v.kind==='pluck'?t>v.decay+v.attack:t>v.decay+v.attack+.012;
        v.done=done||v.release<=0;return (v.low-v.dc)*envelope*v.level*.424264*Math.min(1,release);
      }
      prepare(count) {
        const coefficient=1-Math.exp(-count/(this.sr*.045));
        Object.keys(this.master).forEach(k=>{this.master[k]+=(this.masterTarget[k]-this.master[k])*coefficient;});
        this.garden.circulation+=(this.gardenTarget.circulation-this.garden.circulation)*coefficient;
        this.garden.damping+=(this.gardenTarget.damping-this.garden.damping)*coefficient;
        this.garden.freeze=!!this.gardenTarget.freeze;
        const mods=Array.from({length:4},()=>({}));let circulation=0,drive=0;
        this.modulators.forEach((m,i)=>{
          const old=this.phase[i];this.phase[i]=(old+clamp(m.rate,.02,8)*count/this.sr)%1;
          if(this.phase[i]<old){this.randomOld[i]=this.randomNext[i];this.randomNext[i]=this.random()*2-1;}
          const p=this.phase[i];let value=m.shape==='triangle'?1-4*Math.abs(p-.5):m.shape==='random'?this.randomOld[i]+(this.randomNext[i]-this.randomOld[i])*(.5-.5*Math.cos(PI*p)):Math.sin(TAU*p);
          value*=clamp(m.depth,0,1);this.lfo[i]=value;
          const match=/^n([0-3])\.(time|tone|pitch|pan|decay)$/.exec(m.target);
          if(match)mods[+match[1]][match[2]]=(mods[+match[1]][match[2]]||0)+value;
          else if(m.target==='circulation')circulation+=value*.3;
          else if(m.target==='drive')drive+=value*.4;
        });
        const circulationTarget=this.garden.freeze?.99965:clamp(this.garden.circulation+circulation,0,1)*.985;
        this.circulation+=(circulationTarget-this.circulation)*coefficient;
        this.drive=clamp(this.master.drive+drive,0,1);this.driveStrength=1+this.drive*3;this.driveDivisor=Math.sqrt(this.driveStrength);
        this.nodes.forEach((n,i)=>n.prepare(n.target,mods[i],this.garden,this.tempo,count));
      }
      processBlock(left,right,input) {
        this.prepare(left.length);
        for(let s=0;s<left.length;s++) {
          while(this.cancellations.length&&this.cancellations[0].frame<=this.frame){const cancel=this.cancellations.shift();this.stopSources(cancel.source);}
          while(this.events.length&&this.events[0].frame<=this.frame)this.addVoice(this.events.shift());
          this.injection.fill(0);let dryL=0,dryR=0;
          this.inputGate+=((this.garden.freeze?0:1)-this.inputGate)*this.inputSlew;
          this.freezeRouteBlend+=((this.garden.freeze?1:0)-this.freezeRouteBlend)*this.freezeRouteSlew;
          for(let j=this.voices.length-1;j>=0;j--) {
            const v=this.voices[j],sample=this.sourceTick(v);
            const value=sample*this.inputGate;this.injection[v.destination]+=value;dryL+=value*this.nodes[v.destination].panL;dryR+=value*this.nodes[v.destination].panR;
            if(v.done)this.voices.splice(j,1);
          }
          const external=finite(input?.[s])*this.micGain*this.inputGate;
          this.injection[this.micDestination]+=clamp(external,-.2,.2);
          dryL+=external*this.nodes[this.micDestination].panL;dryR+=external*this.nodes[this.micDestination].panR;
          for(let from=0;from<4;from++) {
            const decay=this.garden.freeze?1:(.22+.775*this.nodes[from].decay);
            const signal=this.previous[from]*this.circulation*decay;
            for(let to=0;to<4;to++)this.injection[to]+=signal*(this.routes[from][to]*(1-this.freezeRouteBlend)+(from===to?this.freezeRouteBlend:0));
          }
          let wetL=0,wetR=0;
          for(let i=0;i<4;i++) {
            const node=this.nodes[i],value=node.tick(this.injection[i],this.drive);
            this.previous[i]=value;wetL+=value*node.values.level*node.panL*.75;wetR+=value*node.values.level*node.panR*.75;
          }
          const dry=Math.cos(this.master.mix*PI/2),wet=Math.sin(this.master.mix*PI/2);
          let l=dryL*dry+wetL*wet,r=dryR*dry+wetR*wet;
          const mid=(l+r)*.5,side=(l-r)*this.master.width;
          l=mid+side;r=mid-side;
          const strength=this.driveStrength;
          l=Math.tanh(l*strength)/this.driveDivisor;r=Math.tanh(r*strength)/this.driveDivisor;
          l*=this.master.volume*1.8;r*=this.master.volume*1.8;
          this.outDC[0]+=.00065*(l-this.outDC[0]);this.outDC[1]+=.00065*(r-this.outDC[1]);
          l-=this.outDC[0];r-=this.outDC[1];
          if(!Number.isFinite(l)||!Number.isFinite(r)){l=r=0;this.clear(true);}
          const peak=Math.max(Math.abs(l),Math.abs(r)),wanted=peak>.86?.86/peak:1;
          this.limiter=wanted<this.limiter?wanted:this.limiter+(wanted-this.limiter)*.00035;
          l*=this.limiter;r*=this.limiter;
          if(this.clearStage) {
            if(this.clearStage===1){const gain=this.clearRemaining/this.clearLength;l*=gain;r*=gain;if(--this.clearRemaining<=0){this.clear(true,true);this.clearStage=2;this.clearRemaining=this.clearLength;}}
            else{const gain=1-this.clearRemaining/this.clearLength;l*=gain;r*=gain;if(--this.clearRemaining<=0)this.clearStage=0;}
          }
          left[s]=clamp(l,-.9,.9);right[s]=clamp(r,-.9,.9);
          this.peak=Math.max(peak,this.peak*.9995);this.rms+=.0003*((l*l+r*r)*.5-this.rms);
          this.clipped=peak>1||this.clipped&&this.peak>.95;
          if(++this.waveCount>=Math.max(1,Math.round(this.sr/3000))){this.waveform[this.waveWrite]=(l+r)*.5;this.waveWrite=(this.waveWrite+1)%128;this.waveCount=0;}
          this.frame++;
        }
      }
      meters() {
        const waveform=Array.from({length:128},(_,i)=>this.waveform[(this.waveWrite+i)%128]);
        return {nodes:this.nodes.map(n=>clamp(Math.sqrt(Math.max(0,n.rms))*3,0,1)),peak:clamp(this.peak,0,1),rms:clamp(Math.sqrt(Math.max(0,this.rms)),0,1),clipped:this.clipped,waveform,lfo:this.lfo.slice()};
      }
    }
    return Core;
  }
  const DSP=createMireDSP();
  window.MireDSP=DSP;
  function stateForDSP(state) {
    const clean=Object.assign({},state); delete clean.samples;return clean;
  }
  function fromBase64(text) {
    const raw=atob(text||'');if(raw.length%4)throw new Error('Invalid sample data.');
    const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  }
  function toBase64(data) {
    const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);let raw='';
    for(let start=0;start<bytes.length;start+=16384)raw+=String.fromCharCode.apply(null,bytes.subarray(start,start+16384));
    return btoa(raw);
  }
  function wavBlob(chunks,frames,sampleRate) {
    const data=new ArrayBuffer(44+frames*4),view=new DataView(data);
    const ascii=(offset,string)=>{for(let i=0;i<string.length;i++)view.setUint8(offset+i,string.charCodeAt(i));};
    ascii(0,'RIFF');view.setUint32(4,36+frames*4,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
    view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,frames*4,true);
    let position=44,remaining=frames*2;
    for(const chunk of chunks){const length=Math.min(chunk.length,remaining);for(let i=0;i<length;i++){const value=Math.max(-1,Math.min(1,Number.isFinite(chunk[i])?chunk[i]:0));view.setInt16(position,Math.round(value*(value<0?32768:32767)),true);position+=2;}remaining-=length;if(!remaining)break;}
    return new Blob([data],{type:'audio/wav'});
  }
  function processorSource() {
    return `'use strict';const DSP=(${createMireDSP.toString()})();
class MireProcessor extends AudioWorkletProcessor {
 constructor(options){super();this.core=new DSP(sampleRate,options.processorOptions.state);this.core.frame=currentFrame;this.recording=false;this.recordData=new Float32Array(16384);this.recordPosition=0;this.recordFrames=0;this.meterCounter=0;
 this.port.onmessage=event=>{const m=event.data;
  if(m.type==='state')this.core.setState(m.state);
  else if(m.type==='trigger')this.core.trigger(m.event);
  else if(m.type==='stop')this.core.stopSources(m.source,m.frame);
  else if(m.type==='clear')this.core.clear();
  else if(m.type==='sample')this.core.setSample(m.index,m.pcm,m.sampleRate);
  else if(m.type==='mic'){this.core.micGain=m.enabled?.12:0;this.core.micDestination=m.destination|0;}
  else if(m.type==='recordStart'){this.recording=true;this.recordPosition=0;this.recordFrames=0;}
  else if(m.type==='recordStop'){this.flushRecord();this.recording=false;this.port.postMessage({type:'recordStopped'});}
 }; }
 flushRecord(){if(this.recordPosition){const pcm=this.recordData.slice(0,this.recordPosition);this.port.postMessage({type:'recordChunk',pcm},[pcm.buffer]);this.recordPosition=0;}}
 process(inputs,outputs){const output=outputs[0];if(!output||output.length<2)return true;const l=output[0],r=output[1];this.core.processBlock(l,r,inputs[0]?.[0]);
  if(this.recording){for(let i=0;i<l.length;i++){this.recordData[this.recordPosition++]=l[i];this.recordData[this.recordPosition++]=r[i];this.recordFrames++;if(this.recordPosition===this.recordData.length)this.flushRecord();if(this.recordFrames>=sampleRate*180){this.flushRecord();this.recording=false;this.port.postMessage({type:'recordStopped',limit:true});break;}}}
  if((this.meterCounter+=l.length)>=sampleRate/30){this.meterCounter=0;this.port.postMessage({type:'meters',meters:this.core.meters()});}return true;
 }
}registerProcessor('mire-garden',MireProcessor);`;
  }
  class MireAudio {
    constructor(state) {
      this.state=state;this.context=null;this.node=null;this.isPlaying=false;this.isRecording=false;this.micEnabled=false;
      this.onStep=null;this.onStatus=null;this.onRecordingLimit=null;this._samples=Array(4).fill(null);this._sampleKeys=Array(4).fill(null);this._sampleRates=Array(4).fill(null);
      this._meter={nodes:[0,0,0,0],peak:0,rms:0,clipped:false,waveform:[],step:-1};this._step=-1;this._displayStep=-1;this._stepTimers=new Set();this._recordChunks=[];this._recordFrames=0;this._disposed=false;
    }
    async init() {
      if(this._disposed)throw new Error('The audio engine has been closed.');
      if(this._initPromise)return this._initPromise;
      this._initPromise=(async()=>{
        const AudioContext=window.AudioContext||window.webkitAudioContext;
        if(!AudioContext)throw new Error('This browser does not support Web Audio.');
        try{this.context=new AudioContext({latencyHint:'interactive',sampleRate:48000});}catch(_){this.context=new AudioContext({latencyHint:'interactive'});}
        let url;
        if(this.context.audioWorklet&&window.AudioWorkletNode) {
          try {
            url=URL.createObjectURL(new Blob([processorSource()],{type:'text/javascript'}));
            await this.context.audioWorklet.addModule(url);
            this.node=new AudioWorkletNode(this.context,'mire-garden',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{state:stateForDSP(this.state)}});
            this.node.port.onmessage=event=>this._message(event.data);
            this.mode='worklet';
          } catch(error) {this.node=null;}
          finally {if(url)URL.revokeObjectURL(url);}
        }
        if(this._disposed)throw new Error('The audio engine has been closed.');
        if(!this.node) {
          this._core=new DSP(this.context.sampleRate,stateForDSP(this.state));
          this.node=this.context.createScriptProcessor(1024,1,2);this.mode='fallback';
          this.node.onaudioprocess=event=>{
            const l=event.outputBuffer.getChannelData(0),r=event.outputBuffer.getChannelData(1),input=event.inputBuffer.getChannelData(0);
            this._core.frame=Math.round(event.playbackTime*this.context.sampleRate);
            this._core.processBlock(l,r,input);this._meter=Object.assign(this._core.meters(),{step:this._displayStep});
            if(this.isRecording){const max=this.context.sampleRate*180-this._recordFrames,count=Math.min(max,l.length),pcm=new Float32Array(count*2);for(let i=0;i<count;i++){pcm[i*2]=l[i];pcm[i*2+1]=r[i];}this._recordChunks.push(pcm);this._recordFrames+=count;if(count<l.length||this._recordFrames>=this.context.sampleRate*180){this.isRecording=false;this.onRecordingLimit?.();}}
          };
        }
        this._output=this.context.createGain();this._output.gain.value=1;this.node.connect(this._output);this._output.connect(this.context.destination);
        this._loadSamples(this.state.samples||[]);return this;
      })().catch(error=>{this._initPromise=null;if(this.context){this.context.close().catch(()=>{});this.context=null;}throw error;});
      return this._initPromise;
    }
    _send(message) {
      if(!this.node)return;
      if(this.mode==='worklet'){this.node.port.postMessage(message);return;}
      const core=this._core;
      if(message.type==='state')core.setState(message.state);
      else if(message.type==='trigger')core.trigger(message.event);
      else if(message.type==='stop')core.stopSources(message.source,message.frame);
      else if(message.type==='clear')core.clear();
      else if(message.type==='sample')core.setSample(message.index,message.pcm,message.sampleRate);
      else if(message.type==='mic'){core.micGain=message.enabled?.12:0;core.micDestination=message.destination|0;}
    }
    _message(message) {
      if(message.type==='meters')this._meter=Object.assign(message.meters,{step:this._displayStep});
      else if(message.type==='recordChunk'){this._recordChunks.push(message.pcm);this._recordFrames+=message.pcm.length/2;}
      else if(message.type==='recordStopped'){this.isRecording=false;if(this._recordResolve){this._recordResolve();this._recordResolve=null;}if(message.limit)this.onRecordingLimit?.();}
    }
    _loadSamples(assets) {
      for(let i=0;i<4;i++) {
        const asset=assets[i],key=asset?.pcm||null;
        if(key===this._sampleKeys[i]&&(asset?.sampleRate||null)===this._sampleRates[i])continue;
        this._sampleKeys[i]=key;this._sampleRates[i]=asset?.sampleRate||null;
        try {
          const pcm=key?fromBase64(key):null;
          if(pcm){if(pcm.length>asset.sampleRate*10+1)throw new Error('Sample exceeds ten seconds.');for(let j=0;j<pcm.length;j++)pcm[j]=Number.isFinite(pcm[j])?Math.max(-1,Math.min(1,pcm[j])):0;}
          this._samples[i]=pcm?{pcm,sampleRate:asset.sampleRate}:null;
          this._send({type:'sample',index:i,pcm:pcm?new Float32Array(pcm):null,sampleRate:asset?.sampleRate||48000});
        }catch(error){this._samples[i]=null;this._send({type:'sample',index:i,pcm:null,sampleRate:48000});this.onStatus?.('A sample could not be loaded.');}
      }
    }
    setState(state) {this.state=state;this._send({type:'state',state:stateForDSP(state)});if(this.node)this._loadSamples(state.samples||[]);}
    async start() {
      const request=this._startRequest=(this._startRequest||0)+1;
      await this.init();if(request!==this._startRequest||this._disposed)return;
      await this.context.resume();if(request!==this._startRequest||this._disposed||this.isPlaying)return;
      this.isPlaying=true;this._step=0;this._nextTime=this.context.currentTime+.055;this._transportGeneration=(this._transportGeneration||0)+1;
      this._schedule();this._timer=setInterval(()=>this._schedule(),25);
    }
    _schedule() {
      if(!this.isPlaying)return;
      const ctx=this.context,now=ctx.currentTime;
      if(this._nextTime<now-.1){this._nextTime=now+.03;}
      while(this._nextTime<now+.16) {
        const step=this._step,time=this._nextTime,base=60/Math.max(40,Math.min(200,this.state.tempo||96))/4;
        const interval=base*(step%2?1-(this.state.swing||0):1+(this.state.swing||0));
        (this.state.sources||[]).forEach((source,index)=>{
          const hit=source.steps?.[step];if(!hit?.on||source.mute||Math.random()>=(hit.probability??1))return;
          const count=Math.max(1,Math.min(4,hit.ratchet||1));
          for(let ratchet=0;ratchet<count;ratchet++)this._send({type:'trigger',event:{index,velocity:(hit.velocity??.8)*(ratchet?.88:1),frame:Math.round((time+interval*ratchet/count)*ctx.sampleRate)}});
        });
        const generation=this._transportGeneration;
        const timer=setTimeout(()=>{this._stepTimers.delete(timer);if(this.isPlaying&&generation===this._transportGeneration){this._displayStep=step;this._meter.step=step;this.onStep?.(step,time);}},Math.max(0,(time-now)*1000));
        this._stepTimers.add(timer);this._step=(step+1)%16;this._nextTime+=interval;
      }
    }
    stop() {
      this._startRequest=(this._startRequest||0)+1;this.isPlaying=false;this._transportGeneration=(this._transportGeneration||0)+1;clearInterval(this._timer);this._stepTimers.forEach(clearTimeout);this._stepTimers.clear();
      this._send({type:'stop'});this._displayStep=-1;this._meter.step=-1;this.onStep?.(-1,this.context?.currentTime||0);
    }
    panic() {this._panicGeneration=(this._panicGeneration||0)+1;this.stop();this._micRequest=(this._micRequest||0)+1;this._micNode?.disconnect();this._micNode=null;this._stream?.getTracks().forEach(track=>track.stop());this._stream=null;this.micEnabled=false;this._send({type:'mic',enabled:false,destination:0});this._send({type:'clear'});this._meter.nodes=[0,0,0,0];this._meter.peak=0;this._meter.rms=0;this._meter.clipped=false;}
    async trigger(sourceIndex,velocity=1) {const generation=this._panicGeneration||0;await this.init();if(generation!==(this._panicGeneration||0)||this._disposed)return false;await this.context.resume();if(generation!==(this._panicGeneration||0)||this._disposed)return false;this._send({type:'trigger',event:{index:sourceIndex,velocity,frame:Math.round((this.context.currentTime+.005)*this.context.sampleRate)}});return true;}
    async triggerNode(nodeIndex) {const generation=this._panicGeneration||0;await this.init();if(generation!==(this._panicGeneration||0)||this._disposed)return false;await this.context.resume();if(generation!==(this._panicGeneration||0)||this._disposed)return false;this._send({type:'trigger',event:{index:0,audition:true,destination:Math.max(0,Math.min(3,nodeIndex|0)),velocity:1,frame:Math.round((this.context.currentTime+.005)*this.context.sampleRate)}});return true;}
    scheduleNote({voiceId='0',note=60,velocity=.8,when,durationSeconds=.25,source='loom'}={}) {if(!this.context||!this.node)throw new Error('Prepare the instrument before scheduling notes.');const index=Number(voiceId);if(!Number.isInteger(index)||index<0||index>3)throw new Error('Choose one of REDUCE’s four sources.');this._send({type:'trigger',event:{index,note,velocity,durationSeconds,source,frame:Math.round(Math.max(this.context.currentTime,Number(when)||this.context.currentTime)*this.context.sampleRate)}});return true;}
    stopNotes({source,when}={}){this._send({type:'stop',source,frame:this.context?Math.round(Math.max(this.context.currentTime,Number.isFinite(when)?when:this.context.currentTime)*this.context.sampleRate):undefined});}
    async renderNotes({events,tempo=120,lengthBeats=4,tailSeconds=4,signal,state=this.state}={}) {const check=()=>{if(signal?.aborted)throw new DOMException('Pattern render cancelled.','AbortError');};check();const snapshot=JSON.parse(JSON.stringify(stateForDSP(window.MireSchema.normalize(state))));snapshot.tempo=tempo;const sr=48000,body=lengthBeats*60/tempo,tail=Math.min(30,Math.max(0,Number(tailSeconds)||0));if(!Number.isFinite(body)||body<=0||body+tail>180)throw new Error('Pattern render must be between zero and 180 seconds.');const core=new DSP(sr,snapshot,0x504f4e44);for(let i=0;i<4;i++){const asset=state.samples?.[i];if(asset?.pcm)core.setSample(i,fromBase64(asset.pcm),asset.sampleRate);}for(const e of events)core.trigger({index:Number(e.voiceId??0),note:e.note,velocity:e.velocity,frame:Math.round(e.startBeat*60/tempo*sr),durationSeconds:e.durationBeats*60/tempo});const frames=Math.ceil((body+tail)*sr),chunks=[];for(let at=0;at<frames;){check();const length=Math.min(8192,frames-at),pcm=new Float32Array(length*2);for(let offset=0;offset<length;offset+=128){const n=Math.min(128,length-offset),l=new Float32Array(n),r=new Float32Array(n);core.processBlock(l,r);for(let i=0;i<n;i++){pcm[(offset+i)*2]=l[i];pcm[(offset+i)*2+1]=r[i];}}chunks.push(pcm);at+=length;await new Promise(resolve=>setTimeout(resolve,0));}check();return{blob:wavBlob(chunks,frames,sr),sampleRate:sr,tempo,sourceApp:'mire'};}
    getMeters() {return this._meter;}
    async setMic(enabled,destination=0) {
      const request=this._micRequest=(this._micRequest||0)+1;await this.init();
      if(request!==this._micRequest)return;
      if(!enabled){this._micNode?.disconnect();this._micNode=null;this._stream?.getTracks().forEach(track=>track.stop());this._stream=null;this.micEnabled=false;this._send({type:'mic',enabled:false,destination:0});return;}
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone input needs HTTPS or localhost in this browser.');
      if(this._micNode){this._send({type:'mic',enabled:true,destination:Math.max(0,Math.min(3,destination))});return;}
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:false},video:false});
      if(this._disposed||request!==this._micRequest){stream.getTracks().forEach(track=>track.stop());return;}
      this._stream=stream;this._micNode=this.context.createMediaStreamSource(stream);this._micNode.connect(this.node);this.micEnabled=true;
      this._send({type:'mic',enabled:true,destination:Math.max(0,Math.min(3,destination))});await this.context.resume();
    }
    async decodeSample(file) {
      await this.init();const decoded=await this.context.decodeAudioData(await file.arrayBuffer());
      const sampleRate=Math.max(8000,Math.min(96000,decoded.sampleRate)),sourceCount=Math.min(decoded.length,Math.floor(decoded.sampleRate*10));
      const count=Math.max(1,Math.floor(sourceCount*sampleRate/decoded.sampleRate)),pcm=new Float32Array(count);let peak=0,mean=0;
      for(let channel=0;channel<decoded.numberOfChannels;channel++){const data=decoded.getChannelData(channel);for(let i=0;i<count;i++){const position=i*decoded.sampleRate/sampleRate,index=Math.floor(position),fraction=position-index;pcm[i]+=(data[index]+(data[Math.min(sourceCount-1,index+1)]-data[index])*fraction)/decoded.numberOfChannels;}}
      for(let i=0;i<count;i++){pcm[i]=Number.isFinite(pcm[i])?pcm[i]:0;mean+=pcm[i];}mean/=Math.max(1,count);
      for(let i=0;i<count;i++){pcm[i]-=mean;peak=Math.max(peak,Math.abs(pcm[i]));}
      const scale=peak>.95?.95/peak:1,fade=Math.max(1,Math.round(sampleRate*.003));
      for(let i=0;i<count;i++)pcm[i]*=scale*Math.min(1,i/fade,(count-1-i)/fade);
      return {name:file.name||'Imported sample',sampleRate,pcm:toBase64(pcm),duration:count/sampleRate};
    }
    createSample(pcm,sampleRate,name='Shared sample') {
      if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||Object.prototype.toString.call(pcm)!=='[object Float32Array]'||pcm.length<4||pcm.length%2)throw new Error('Provide valid interleaved stereo audio.');
      const sourceFrames=pcm.length/2;
      if(sourceFrames/sampleRate>10)throw new Error('REDUCE accepts samples up to ten seconds. Trim the sample before importing it.');
      for(let i=0;i<pcm.length;i++)if(!Number.isFinite(pcm[i]))throw new Error('The incoming audio contains invalid samples.');
      const targetRate=Math.min(96000,sampleRate),frames=Math.max(1,Math.floor(sourceFrames*targetRate/sampleRate)),mono=new Float32Array(frames);
      let mean=0,peak=0;
      for(let i=0;i<frames;i++) {
        const position=i*sampleRate/targetRate,index=Math.floor(position),blend=position-index,next=Math.min(sourceFrames-1,index+1);
        const left=pcm[index*2]*(1-blend)+pcm[next*2]*blend,right=pcm[index*2+1]*(1-blend)+pcm[next*2+1]*blend;
        mono[i]=left*.5+right*.5;mean+=mono[i];
      }
      mean/=frames;
      for(let i=0;i<frames;i++)peak=Math.max(peak,Math.abs(mono[i]-mean));
      const scale=peak>.95?.95/peak:1,fade=Math.max(1,Math.round(targetRate*.003));
      for(let i=0;i<frames;i++)mono[i]=(mono[i]-mean)*scale*Math.min(1,i/fade,(frames-1-i)/fade);
      return {name:String(name).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100)||'Shared sample',sampleRate:targetRate,pcm:toBase64(mono),duration:frames/targetRate};
    }
    startRecording() {
      if(this.isRecording)return;this.isRecording=true;this._recordChunks=[];this._recordFrames=0;this._recordStarting=true;
      this._recordStartPromise=this.init().then(()=>this.context.resume()).then(()=>{this._recordStarting=false;if(this.isRecording&&this.mode==='worklet')this.node.port.postMessage({type:'recordStart'});}).catch(error=>{this.isRecording=false;this._recordStarting=false;this.onStatus?.(error.message);});
    }
    async stopRecording() {
      if(this._recordStartPromise)await this._recordStartPromise;
      if(this.isRecording&&this.mode==='worklet') {
        await this.context.resume();
        await new Promise(resolve=>{this._recordResolve=resolve;this.node.port.postMessage({type:'recordStop'});});
      }
      this.isRecording=false;const blob=wavBlob(this._recordChunks,this._recordFrames,this.context?.sampleRate||48000);this._recordChunks=[];this._recordFrames=0;return blob;
    }
    async renderWav(bars=4,tailSeconds=4,{signal}={}) {
      const checkAbort=()=>{if(signal?.aborted)throw new DOMException('Render canceled.','AbortError');};
      checkAbort();await this.init();checkAbort();const sampleRate=48000,source=JSON.parse(JSON.stringify(stateForDSP(this.state)));
      const lengthBars=Math.max(1,Math.min(16,Math.round(bars))),barSeconds=240/source.tempo,totalSeconds=lengthBars*barSeconds+Math.max(0,Math.min(30,Number.isFinite(+tailSeconds)?+tailSeconds:4));
      const frozen=!!source.garden.freeze;if(frozen)source.garden.freeze=false;
      const core=new DSP(sampleRate,source,0x504f4e44);this._samples.forEach((sample,i)=>{if(sample)core.setSample(i,sample.pcm,sample.sampleRate);});
      const schedule=(offset,barsToSchedule)=>{let time=offset;for(let step=0;step<barsToSchedule*16;step++) {
        const cell=step%16,interval=60/source.tempo/4*(cell%2?1-source.swing:1+source.swing);
        source.sources.forEach((track,index)=>{const hit=track.steps[cell];if(!hit.on||track.mute||core.random()>=(hit.probability??1))return;const ratchets=Math.max(1,Math.min(4,hit.ratchet||1));for(let r=0;r<ratchets;r++)core.trigger({index,velocity:hit.velocity*(r?.88:1),frame:Math.round((time+interval*r/ratchets)*sampleRate)});});time+=interval;
      }};
      if(frozen){schedule(0,1);const frames=Math.round(barSeconds*sampleRate);let done=0;while(done<frames){checkAbort();const count=Math.min(128,frames-done);core.processBlock(new Float32Array(count),new Float32Array(count));done+=count;if(done%32768===0)await new Promise(resolve=>setTimeout(resolve,0));}source.garden.freeze=true;core.setState(source);}
      else schedule(0,lengthBars);
      const totalFrames=Math.round(totalSeconds*sampleRate),chunks=[];let rendered=0;
      this.onStatus?.('Rendering the feedback network…');
      while(rendered<totalFrames) {
        checkAbort();
        const length=Math.min(8192,totalFrames-rendered),pcm=new Float32Array(length*2);
        for(let at=0;at<length;at+=128){const count=Math.min(128,length-at),l=new Float32Array(count),r=new Float32Array(count);core.processBlock(l,r);for(let i=0;i<count;i++){pcm[(at+i)*2]=l[i];pcm[(at+i)*2+1]=r[i];}}
        const fade=Math.round(sampleRate*.02);for(let i=0;i<length;i++){const gain=Math.min(1,(rendered+i)/fade,(totalFrames-rendered-i-1)/fade);pcm[i*2]*=gain;pcm[i*2+1]*=gain;}
        chunks.push(pcm);rendered+=length;await new Promise(resolve=>setTimeout(resolve,0));
      }
      checkAbort();return wavBlob(chunks,totalFrames,sampleRate);
    }
    dispose() {
      this._panicGeneration=(this._panicGeneration||0)+1;this.stop();this._disposed=true;this.isRecording=false;this._stream?.getTracks().forEach(track=>track.stop());this._micNode?.disconnect();this.node?.disconnect();this._output?.disconnect();this.context?.close().catch(()=>{});
      if(this._recordResolve){this._recordResolve();this._recordResolve=null;}this._recordChunks=[];this._samples=[];
    }
  }
  window.MireAudio=MireAudio;
})();
