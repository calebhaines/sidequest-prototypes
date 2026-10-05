function buildRavelDSP() {
  'use strict';
  const TAU = Math.PI * 2, bound = (x, a, b) => Math.min(b, Math.max(a, x));
  function random(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
  function generateSeed(asset, sampleRate = 48000) {
    const rng = random(asset.seed), beat = 60 / asset.tempo, frames = Math.round(beat * 16 * sampleRate), pcm = new Float32Array(frames * 2), notes = [36,43,48,46,36,51,43,48,39,46,51,53,36,43,46,55];
    for (let i = 0; i < 16; i++) {
      const offset = Math.round(i * beat * sampleRate), base = 440 * Math.pow(2, (notes[i] - 69) / 12), variation = .9 + rng() * .2, pan = (rng() - .5) * .8; let lp = 0, last = 0;
      for (let j = 0; j < Math.min(Math.ceil(beat * sampleRate), frames - offset); j++) {
        const t = j / sampleRate, n = rng() * 2 - 1, env = Math.exp(-t * (4 + i % 4 * 1.2)), atk = Math.min(1, t * 1000); let v = 0;
        lp += .08 * (n - lp);
        switch (asset.recipe) {
          case 'kit': v = i % 4 === 0 ? Math.sin(TAU * (47 * t + 6 * (1 - Math.exp(-t * 24)))) * Math.exp(-t * 9) + lp * Math.exp(-t * 50) * .3 : i % 4 === 2 ? n * Math.exp(-t * 19) * .55 + Math.sin(TAU * 183 * t) * Math.exp(-t * 15) * .3 : (n - last) * Math.exp(-t * (i % 2 ? 50 : 25)) * .22; break;
          case 'foley': v = Math.sin(TAU * (530 + i * 77) * t) * Math.exp(-t * 37) * .5 + lp * Math.exp(-t * 12) * .7 + n * Math.exp(-t * 110) * .25; break;
          case 'keys': v = (Math.sin(TAU * base * 2 * t) + .36 * Math.sin(TAU * base * 4.003 * t) + .17 * Math.sin(TAU * base * 6.01 * t)) * env * .55; break;
          case 'bells': v = (Math.sin(TAU * base * 4 * t) * Math.exp(-t * 3) + .47 * Math.sin(TAU * base * 10.82 * t) * Math.exp(-t * 5) + .3 * Math.sin(TAU * base * 16.1 * t) * Math.exp(-t * 8)) * .42; break;
          case 'reed': v = (Math.sin(TAU * base * 2 * t + .5 * Math.sin(TAU * 5 * t)) + .4 * Math.sin(TAU * base * 6 * t) + .16 * Math.sin(TAU * base * 10 * t)) * env * .52; break;
          case 'bass': v = (Math.sin(TAU * base * t) + .24 * Math.sin(TAU * base * 2 * t) + .11 * Math.sin(TAU * base * 3 * t)) * Math.exp(-t * 5) * .8; break;
          case 'noise': v = (lp * 2 + Math.sin(TAU * (120 + i * 31) * t) * .2) * Math.sin(Math.min(1, t / beat) * Math.PI) * .62; break;
          default: v = (Math.sin(TAU * (210 + i * 41) * t + 3 * Math.sin(TAU * (107 + i * 13) * t) * Math.exp(-t * 40)) * Math.exp(-t * 14) + n * Math.exp(-t * 90) * .2) * .72;
        }
        last = n; v *= atk * variation * Math.min(1, (beat - t) * 300); const stereo = asset.recipe === 'bells' || asset.recipe === 'keys' ? Math.sin(TAU * base * 2.007 * t) * env * .05 : 0;
        pcm[(offset + j) * 2] = v * (1 - pan * .3) + stereo; pcm[(offset + j) * 2 + 1] = v * (1 + pan * .3) - stereo;
      }
    }
    let peak = 0; for (const x of pcm) peak = Math.max(peak, Math.abs(x)); if (peak > .82) for (let i = 0; i < pcm.length; i++) pcm[i] *= .82 / peak;
    return { pcm, sampleRate };
  }
  function detectTransients(sample, trimStart = 0, trimEnd = 1) {
    const pcm=sample.pcm,frames=pcm.length/2,start=Math.floor(trimStart*frames),length=Math.max(1,Math.floor((trimEnd-trimStart)*frames)),hop=128,energy=[];let last=0,max=0;
    for(let at=start;at<start+length;at+=hop){let sum=0;for(let j=at;j<Math.min(at+hop,start+length);j++)sum+=(pcm[j*2]*pcm[j*2]+pcm[j*2+1]*pcm[j*2+1])*.5;const v=Math.sqrt(sum/hop),flux=Math.max(0,v-last);energy.push(flux);max=Math.max(max,flux);last=v;}
    const candidates=[];for(let i=1;i<energy.length-1;i++)if(energy[i]>=max*.07&&energy[i]>0&&energy[i]>=energy[i-1]&&energy[i]>=energy[i+1])candidates.push({at:i*hop/length,value:energy[i]});candidates.sort((a,b)=>b.value-a.value);
    const points=[0,1],gap=Math.max(.0002,.04*(sample.sampleRate||48000)/length);for(const p of candidates){if(points.length>=17)break;if(points.every(x=>Math.abs(x-p.at)>=gap))points.push(p.at);}points.sort((a,b)=>a-b);
    while(points.length<17){let index=0,width=0;for(let i=0;i<points.length-1;i++)if(points[i+1]-points[i]>width){width=points[i+1]-points[i];index=i;}points.splice(index+1,0,(points[index]+points[index+1])/2);}return points;
  }
  function hermite(pcm, position, channel, start, end) {
    const i = Math.floor(position), x = position - i;
    const at = n => pcm[bound(n, start, end - 1) * 2 + channel] || 0;
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2), c1 = .5 * (c - a), c2 = a - 2.5 * b + 2 * c - .5 * d, c3 = .5 * (d - a) + 1.5 * (b - c);
    return ((c3 * x + c2) * x + c1) * x + b;
  }
  class Core {
    constructor(state, sample, sampleRate = 48000) {
      this.sr = sampleRate; this.state = state; this.sample = sample?.pcm || new Float32Array(2); this.sampleRate = sample?.sampleRate || sampleRate; this.voices = []; this.events = []; this.running = false; this.frame = 0; this.nextBar = 0; this.bar = 0; this.pattern = state.selectedPattern || 0; this.pending = null; this.rng = random(state.seed); this.lastStep = -1;
      this.low = [0,0]; this.low2 = [0,0]; this.hp = [0,0]; this.prev = [0,0]; this.hold = [0,0]; this.crushFrame = 0;
      this.echo = [new Float32Array(Math.ceil(sampleRate * 2.1)),new Float32Array(Math.ceil(sampleRate * 2.1))]; this.echoAt = 0;
      this.rooms = [0,1,2,3].map((_, i) => [new Float32Array(Math.round(sampleRate * (.117 + i * .0437))), new Float32Array(Math.round(sampleRate * (.131 + i * .0473)))]); this.roomAt = [0,0,0,0]; this.meters = { peak:0,rms:0,step:-1,pattern:this.pattern,bar:0,voices:0 }; this.triggered = 0; this.externalEvents = []; this.clockFrame = 0; this.sourceCuts = new Map();
    }
    setSample(sample) { this.sample = sample.pcm; this.sampleRate = sample.sampleRate; this.voices = []; }
    setState(state) { if (state.seed !== this.state.seed) this.rng = random(state.seed); if (state.selectedPattern !== this.state.selectedPattern) { if (this.running) this.pending = state.selectedPattern; else this.pattern = state.selectedPattern; } this.state = state; }
    start() { if (this.running) return; this.running = true; this.frame = 0; this.nextBar = 0; this.bar = 0; this.events = []; this.pattern = this.state.selectedPattern; this.pending = null; this.rng = random(this.state.seed); this.scheduleBar(); }
    stop() { this.running = false; this.events = []; this.externalEvents = []; this.sourceCuts.clear(); this.voices.forEach(v => { v.release = Math.min(v.release, Math.round(this.sr * .008)); }); this.lastStep = -1; }
    panic() { this.stop(); this.voices = []; this.echo.forEach(x => x.fill(0)); this.rooms.forEach(r => r.forEach(x => x.fill(0))); this.low.fill(0); this.low2.fill(0); this.hp.fill(0); this.prev.fill(0); this.hold.fill(0); this.crushFrame=0; this.meters={peak:0,rms:0,step:-1,pattern:this.pattern,bar:0,voices:0}; }
    scheduleBar() {
      if (this.pending !== null) { this.pattern = this.pending; this.pending = null; } else if (this.state.chain && this.bar > 0) this.pattern = (this.pattern + 1) % 4;
      const duration = this.sr * 60 / this.state.tempo / 4, start = this.nextBar, steps = this.state.patterns[this.pattern].steps;
      for (let i = 0; i < 16; i++) {
        const s = steps[i], target = start + (i + (i % 2 ? this.state.swing * .5 : 0) + s.micro) * duration;
        this.events.push({ frame: Math.max(start, Math.round(target)), step:i, marker:true });
        if (!s.on || this.rng() > s.probability) continue;
        for (let r = 0; r < s.ratchet; r++) this.events.push({ frame: Math.max(start, Math.round(target + r * duration / s.ratchet)), step:i, settings:{ ...s, duration:duration / this.sr * s.gate / s.ratchet } });
      }
      this.events.sort((a,b) => a.frame - b.frame); this.nextBar += Math.round(duration * 16); this.bar++;
    }
    triggerSlice(slice, options = {}) {
      const a = this.state.sample, total = this.sample.length / 2, trim = a.trimEnd - a.trimStart;
      const lo = Math.round((a.trimStart + this.state.boundaries[slice] * trim) * total), hi = Math.max(lo + 1, Math.min(total, Math.round((a.trimStart + this.state.boundaries[slice + 1] * trim) * total)));
      const reverse = !!a.reverse !== !!options.reverse, rate = this.sampleRate / this.sr * Math.pow(2, (a.pitch + (options.pitch || 0)) / 12), duration = options.duration ? Math.round(options.duration * this.sr) : Math.ceil((hi - lo) / rate);
      if (this.voices.length >= 32) this.voices.shift(); this.voices.push({ start:lo,end:hi,at:reverse ? hi - 1 : lo,rate:reverse ? -rate : rate,age:0,duration:Math.max(1,duration),fade:Math.max(16,Math.round(a.fade / 1000 * this.sr)),velocity:options.velocity ?? .9,source:options.source || 'native',release:Infinity }); this.triggered++;
    }
    queueSlice(slice, options, frame) {
      if (frame >= (this.sourceCuts.get(options.source) ?? Infinity)) return;
      this.externalEvents.push({ slice, options, frame }); this.externalEvents.sort((a,b) => a.frame - b.frame);
    }
    clearExternalNotes(source, frame = this.clockFrame, future = false) {
      if (source === undefined) { this.externalEvents = []; this.sourceCuts.clear(); this.voices.forEach(v => { v.release = Math.min(v.release, Math.round(this.sr * .008)); }); return; }
      const at = future ? Math.min(this.sourceCuts.get(source) ?? Infinity, frame) : frame;
      if (future) this.sourceCuts.set(source, at); else this.sourceCuts.delete(source);
      this.externalEvents = this.externalEvents.filter(event => (event.options?.source ?? event.source) !== source || future && event.frame < at);
      this.externalEvents.push({ type: 'cancel', source, frame: at }); this.externalEvents.sort((a,b) => a.frame - b.frame);
    }
    processBlock(left, right, clockFrame = this.clockFrame) {
      const m = this.state.master, lp = 1 - Math.exp(-TAU * Math.min(m.tone,this.sr*.43) / this.sr), hp = Math.exp(-TAU * m.highpass / this.sr), delay = bound(Math.round(this.sr * 60 / this.state.tempo * .75),1,this.echo[0].length - 1), drive = 1 + m.drive * 6, crushBits = 16 - Math.round(m.crush * 12), crushScale = Math.pow(2,crushBits - 1), holdFrames = 1 + Math.round(m.crush * m.crush * 20); let peak = 0, power = 0;
      for (let n = 0; n < left.length; n++) {
        while (this.externalEvents.length && this.externalEvents[0].frame <= clockFrame + n) {
          const event = this.externalEvents.shift();
          if (event.type === 'cancel') this.voices.forEach(v => { if (v.source === event.source) v.release = Math.min(v.release, Math.round(this.sr * .008)); });
          else this.triggerSlice(event.slice, event.options);
        }
        if (this.running) { if (this.frame >= this.nextBar) this.scheduleBar(); while (this.events.length && this.events[0].frame <= this.frame) { const e = this.events.shift(); if (e.marker) this.lastStep = e.step; else this.triggerSlice(e.settings.slice,e.settings); } }
        let l = 0, r = 0;
        for (let i = this.voices.length - 1; i >= 0; i--) {
          const v = this.voices[i], remaining = Math.min(v.duration - v.age, (v.rate > 0 ? v.end - v.at : v.at - v.start + 1) / Math.abs(v.rate), v.release);
          if (remaining <= 0) { this.voices.splice(i,1); continue; }
          const envelope = Math.min(1,v.age / v.fade,remaining / v.fade) * v.velocity * this.state.sample.level;
          l += hermite(this.sample,v.at,0,v.start,v.end) * envelope; r += hermite(this.sample,v.at,1,v.start,v.end) * envelope; v.at += v.rate; v.age++; if (v.release !== Infinity) v.release--;
        }
        const input = [l,r]; const out = [0,0];
        for (let c = 0; c < 2; c++) { let x = input[c]; const high = hp * (this.hp[c] + x - this.prev[c]); this.prev[c] = x; this.hp[c] = high; this.low[c] += lp * (high - this.low[c]); this.low2[c] += lp * (this.low[c] - this.low2[c]); x = Math.tanh(this.low2[c] * drive) / Math.sqrt(drive); if (this.crushFrame % holdFrames === 0) this.hold[c] = Math.round(x * crushScale) / crushScale; x = this.hold[c]; const read = (this.echoAt - delay + this.echo[c].length) % this.echo[c].length, delayed = this.echo[c][read]; this.echo[c][this.echoAt] = x + delayed * m.feedback; out[c] = x + delayed * m.echo * .55; }
        let roomL = 0,roomR = 0;
        for (let k = 0; k < 4; k++) { const ri = this.roomAt[k]; const rl = this.rooms[k][0],rr = this.rooms[k][1], al = ri % rl.length,ar = ri % rr.length,dl = rl[al],dr = rr[ar]; rl[al] = out[0] * .22 + dl * .73; rr[ar] = out[1] * .22 + dr * .71; roomL += dl; roomR += dr; this.roomAt[k]++; }
        l = (out[0] + roomL * m.space * .38) * Math.sqrt(1 - Math.max(0,m.pan)); r = (out[1] + roomR * m.space * .38) * Math.sqrt(1 + Math.min(0,m.pan));
        l = Math.tanh(l * m.volume * 1.35) * .97; r = Math.tanh(r * m.volume * 1.35) * .97; left[n] = Number.isFinite(l) ? l : 0; right[n] = Number.isFinite(r) ? r : 0; peak = Math.max(peak,Math.abs(l),Math.abs(r)); power += (l*l + r*r) / 2; this.echoAt = (this.echoAt + 1) % this.echo[0].length; this.crushFrame++; if (this.running) this.frame++;
      }
      this.clockFrame = clockFrame + left.length;
      this.meters = { peak,rms:Math.sqrt(power/left.length),step:this.lastStep,pattern:this.pattern,bar:this.bar,voices:this.voices.length,pending:this.pending,triggered:this.triggered };
    }
  }
  return { Core, detectTransients, createCore:(state,sample,sr) => new Core(state,sample,sr), generateSeed, random };
}
(() => {
  'use strict';
  const DSP = buildRavelDSP(); window.RavelDSP = DSP;
  function encodePCM(pcm, sampleRate, name) {
    // Project assets use at most 48 kHz, including captures on 96 kHz hardware.
    if (sampleRate > 48000) {
      const ratio = sampleRate / 48000, inputFrames = pcm.length / 2;
      const frames = Math.floor(inputFrames / ratio), resampled = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        const position = i * ratio, index = Math.floor(position), fraction = position - index;
        for (let channel = 0; channel < 2; channel++) {
          const a = pcm[index * 2 + channel] || 0;
          const b = pcm[Math.min(index + 1, inputFrames - 1) * 2 + channel] || 0;
          resampled[i * 2 + channel] = a + (b - a) * fraction;
        }
      }
      pcm = resampled; sampleRate = 48000;
    }
    const bytes = new Uint8Array(pcm.length * 2), view = new DataView(bytes.buffer);
    for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
    let str = ''; for (let i = 0; i < bytes.length; i += 32768) str += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { kind: 'pcm', name, sampleRate, channels: 2, frames: pcm.length / 2, duration: pcm.length / 2 / sampleRate, pcm: btoa(str) };
  }

  function decodePCM(a) { const data=atob(a.pcm),bytes=new Uint8Array(data.length); for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i); const view=new DataView(bytes.buffer),pcm=new Float32Array(a.frames*2);for(let i=0;i<a.frames;i++)for(let c=0;c<2;c++)pcm[i*2+c]=view.getInt16((i*a.channels+Math.min(c,a.channels-1))*2,true)/32768; return {pcm,sampleRate:a.sampleRate}; }
  function waveBlob(pcm,sr=48000) { const buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer),word=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};word(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);return new Blob([buffer],{type:'audio/wav'}); }
  const payload = state => ({...state,asset:null});
  class RavelAudio {
    constructor(state) { this.state=state;this.context=null;this.node=null;this.core=null;this.isPlaying=false;this.isRecording=false;this.micCapturing=false;this.generation=0;this.sampleKey='';this.sample=null;this.recordChunks=[];this.recordFrames=0;this.recordToken=0;this.playToken=0;this.micToken=0;this.recordTakes=new Map();this.recordTake=null;this.micPending=false;this.meters={peak:0,rms:0,step:-1,pattern:0};this.onStatus=null;this.onRecordingLimit=null;this.onMicLimit=null;this.initPromise=null;this.pendingPads=new Map();this.getSample(); }
    getSample() { const a=this.state.asset,key=a.kind==='seed'?JSON.stringify(a):a.sampleRate+':'+a.channels+':'+a.frames+':'+a.pcm;if(key!==this.sampleKey){this.sample=a.kind==='seed'?DSP.generateSeed(a):decodePCM(a);this.sampleKey=key;}return this.sample; }
    async init() { if(this.node){if(this.context.state==='suspended')await this.context.resume();return;}if(this.initPromise)return this.initPromise;this.initPromise=this.initialize().finally(()=>this.initPromise=null);return this.initPromise; }
    async initialize() { const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('This browser does not support Web Audio.');if(!this.context)this.context=new Audio({latencyHint:'interactive'});const ctx=this.context;await ctx.resume();const sample=this.getSample();
      if(ctx.audioWorklet){try{const src=`const DSP=(${buildRavelDSP.toString()})(); class RavelProcessor extends AudioWorkletProcessor {constructor(){super();this.core=null;this.record=false;this.frames=0;this.recordId=0;this.tick=0;this.chunks=[];this.chunkFrames=0;this.port.onmessage=e=>{const m=e.data;if(m.type==='init')this.core=DSP.createCore(m.state,m.sample,sampleRate);else if(m.type==='state')this.core?.setState(m.state);else if(m.type==='sample')this.core?.setSample(m.sample);else if(m.type==='start')this.core?.start();else if(m.type==='stop')this.core?.stop();else if(m.type==='panic'){this.core?.panic();this.record=false;this.chunks=[];}else if(m.type==='pad')this.core?.triggerSlice(m.slice,m.options);else if(m.type==='scheduledPad')this.core?.queueSlice(m.slice,m.options,m.frame);else if(m.type==='clearNotes')this.core?.clearExternalNotes(m.source,m.frame,m.future);else if(m.type==='record'){this.record=m.enabled;if(m.enabled){this.recordId=m.id;this.frames=0;this.chunks=[];this.chunkFrames=0;}else this.flush();}};}flush(){if(this.chunks.length){const pcm=new Float32Array(this.chunkFrames*2);let k=0;for(const x of this.chunks){pcm.set(x,k);k+=x.length;}this.port.postMessage({type:'record',id:this.recordId,pcm},[pcm.buffer]);this.chunks=[];this.chunkFrames=0;}if(!this.record)this.port.postMessage({type:'recordEnd',id:this.recordId});}process(inputs,outputs){const out=outputs[0];if(!out?.[0])return true;const l=out[0],r=out[1]||out[0];this.core?.processBlock(l,r,currentFrame);if(this.record){const count=Math.min(l.length,180*sampleRate-this.frames),p=new Float32Array(count*2);for(let i=0;i<count;i++){p[i*2]=l[i];p[i*2+1]=r[i];}this.chunks.push(p);this.chunkFrames+=count;this.frames+=count;if(this.chunkFrames>=4096)this.flush();if(this.frames>=180*sampleRate){this.record=false;this.flush();this.port.postMessage({type:'recordLimit',id:this.recordId});}}if((this.tick+=l.length)>=2048){this.tick=0;this.port.postMessage({type:'meters',meters:this.core?.meters});}return true;}}registerProcessor('ravel-core',RavelProcessor);`;const url=URL.createObjectURL(new Blob([src],{type:'application/javascript'}));try{await ctx.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}this.node=new AudioWorkletNode(ctx,'ravel-core',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});this.node.port.onmessage=e=>this.handleMessage(e.data);this.node.port.postMessage({type:'init',state:payload(this.state),sample:{pcm:sample.pcm.slice(),sampleRate:sample.sampleRate}});this.node.connect(ctx.destination);return;}catch(error){this.onStatus?.('Using the compatible audio engine.');}}
      this.core=DSP.createCore(payload(this.state),sample,ctx.sampleRate);this.node=ctx.createScriptProcessor(1024,0,2);this.node.onaudioprocess=e=>{const l=e.outputBuffer.getChannelData(0),r=e.outputBuffer.getChannelData(1);this.core.processBlock(l,r,Math.round(e.playbackTime*ctx.sampleRate));this.meters=this.core.meters;if(this.isRecording&&this.recordTake){const take=this.recordTake,count=Math.min(l.length,180*ctx.sampleRate-take.frames),p=new Float32Array(count*2);for(let i=0;i<count;i++){p[i*2]=l[i];p[i*2+1]=r[i];}take.chunks.push(p);take.frames+=count;this.recordFrames=take.frames;if(take.frames>=180*ctx.sampleRate){this.isRecording=false;this.onRecordingLimit?.();}}};this.node.connect(ctx.destination);
    }
    handleMessage(m) { if(m.type==='meters'&&m.meters)this.meters=m.meters;else if(m.type==='record'){const take=this.recordTakes.get(m.id);if(take){take.chunks.push(m.pcm);take.frames+=m.pcm.length/2;if(take===this.recordTake)this.recordFrames=take.frames;}}else if(m.type==='recordEnd'){this.recordTakes.get(m.id)?.resolve?.();}else if(m.type==='recordLimit'&&this.recordTake?.id===m.id){this.isRecording=false;this.onRecordingLimit?.();} }
    command(type,data={}) { if(this.core){if(type==='pad')this.core.triggerSlice(data.slice,data.options);else if(type==='scheduledPad')this.core.queueSlice(data.slice,data.options,data.frame);else if(type==='clearNotes')this.core.clearExternalNotes(data.source,data.frame,data.future);else if(type==='sample')this.core.setSample(data.sample);else if(type==='state')this.core.setState(data.state);else this.core[type]?.();}else this.node?.port.postMessage({type,...data}); }
    async start() { const token=this.generation,request=++this.playToken;await this.init();if(token!==this.generation||request!==this.playToken)return false;this.isPlaying=true;this.command('start');return true; }
    stop() { this.playToken++;this.isPlaying=false;this.command('stop'); }
    panic() { this.generation++;this.stop();this.command('panic');this.pendingPads.clear();this.recordToken++;this.isRecording=false;for(const take of this.recordTakes.values())take.resolve?.();this.recordTakes.clear();this.recordTake=null;this.recordFrames=0;this.cancelMicCapture(); }
    setState(state) { this.state=state;this.command('state',{state:payload(state)});const key=this.sampleKey,sample=this.getSample();if(key!==this.sampleKey)this.command('sample',{sample:{pcm:sample.pcm.slice(),sampleRate:sample.sampleRate}}); }
    scheduleNativeNote(slice, when, options = {}) {
      if (!this.node || !this.context) throw new Error('Prepare RAVEL before scheduling notes.');
      if (!Number.isInteger(slice) || slice < 0 || slice > 15 || !Number.isFinite(when) || !Number.isFinite(options.duration) || options.duration <= 0) throw new Error('Invalid RAVEL note.');
      this.command('scheduledPad', { slice, options, frame: Math.round(when * this.context.sampleRate) });
    }
    cancelNativeNotes({ source, when } = {}) {
      if (!this.context) return;
      const time = when === undefined ? this.context.currentTime : Math.max(this.context.currentTime, Number(when));
      if (!Number.isFinite(time)) throw new Error('Provide a valid cancellation timestamp.');
      this.command('clearNotes', { source, frame: Math.round(time * this.context.sampleRate), future: when !== undefined && time > this.context.currentTime });
    }
    async renderNativeEvents(state, events, options = {}) {
      const check = () => { if (options.signal?.aborted) throw new DOMException('Pattern render cancelled.', 'AbortError'); }; check();
      const snapshot = RavelSchema.normalize(state), sample = snapshot.asset.kind === 'seed' ? DSP.generateSeed(snapshot.asset) : decodePCM(snapshot.asset);
      const seconds = options.durationSeconds, tail = options.tailSeconds ?? 0;
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120 || !Number.isFinite(tail) || tail < 0 || tail > 15 || !Array.isArray(events) || events.length > 8192) throw new Error('Invalid RAVEL render bounds.');
      const sr = 48000, frames = Math.ceil((seconds + tail) * sr), pcm = new Float32Array(frames * 2), core = DSP.createCore(payload(snapshot), sample, sr);
      for (const event of events) {
        if (!Number.isInteger(event.voice) || event.voice < 0 || event.voice > 15 || !Number.isFinite(event.at) || event.at < 0 || event.at >= seconds || !Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 1) throw new Error('Invalid RAVEL render note.');
        core.queueSlice(event.voice, { velocity: event.velocity, pitch: event.pitch || 0, duration: event.duration, reverse: !!event.reverse }, Math.round(event.at * sr));
      }
      let at = 0, block = 0; while (at < frames) {
        const count = Math.min(1024, frames - at), left = new Float32Array(count), right = new Float32Array(count); core.processBlock(left, right);
        for (let i = 0; i < count; i++) { const gain = Math.min(1, (frames - at - i - 1) / 480); pcm[(at+i)*2] = left[i] * gain; pcm[(at+i)*2+1] = right[i] * gain; }
        at += count; if (++block % 64 === 0) { check(); await new Promise(resolve => setTimeout(resolve,0)); }
      }
      check(); return { blob: waveBlob(pcm, sr), sampleRate: sr, duration: frames / sr };
    }
    async triggerSlice(slice,options={}) { const token=this.generation,id=Symbol();this.pendingPads.set(id,true);await this.init();if(token!==this.generation||!this.pendingPads.has(id))return false;this.pendingPads.delete(id);this.command('pad',{slice,options});return true; }
    getMeters() { return {...this.meters,recordSeconds:this.recordFrames/(this.context?.sampleRate||48000),micSeconds:this.micFrames/(this.context?.sampleRate||48000)||0}; }
    getWaveform(points=600) { const {pcm}=this.getSample(),frames=pcm.length/2,out=[];for(let i=0;i<points;i++){const from=Math.floor(i*frames/points),to=Math.max(from+1,Math.floor((i+1)*frames/points));let p=0;for(let j=from;j<to;j++)p=Math.max(p,Math.abs(pcm[j*2]),Math.abs(pcm[j*2+1]));out.push(p);}return out; }
    async decodeSample(file) { if(file.size>20*1024*1024)throw new Error('Audio files must be smaller than 20 MB.');const token=this.generation;await this.init();const decoded=await this.context.decodeAudioData(await file.arrayBuffer());if(token!==this.generation)return null;const sr=Math.min(48000,decoded.sampleRate),frames=Math.min(Math.round(decoded.duration*sr),sr*20),p=new Float32Array(frames*2),ratio=decoded.sampleRate/sr;for(let c=0;c<2;c++){const d=decoded.getChannelData(Math.min(c,decoded.numberOfChannels-1));for(let i=0;i<frames;i++){const pos=i*ratio,k=Math.floor(pos),f=pos-k;p[i*2+c]=(d[k]||0)*(1-f)+(d[Math.min(k+1,d.length-1)]||0)*f;}}return encodePCM(p,sr,file.name); }
    async startMicCapture() { if(this.micCapturing||this.micPending)throw new Error('A microphone take is already running or awaiting permission.');if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone recording requires HTTPS or a supported local browser.');const token=this.generation,request=++this.micToken;this.micPending=true;try{await this.init();if(token!==this.generation||request!==this.micToken)return false;const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(token!==this.generation||request!==this.micToken){stream.getTracks().forEach(t=>t.stop());return false;}this.micStream=stream;this.micSource=this.context.createMediaStreamSource(stream);this.micNode=this.context.createScriptProcessor(1024,2,2);this.micGain=this.context.createGain();this.micGain.gain.value=0;this.micChunks=[];this.micFrames=0;this.micCapturing=true;this.micNode.onaudioprocess=e=>{if(!this.micCapturing||token!==this.generation||request!==this.micToken)return;const count=Math.min(e.inputBuffer.length,this.context.sampleRate*20-this.micFrames),p=new Float32Array(count*2),l=e.inputBuffer.getChannelData(0),r=e.inputBuffer.getChannelData(Math.min(1,e.inputBuffer.numberOfChannels-1));for(let i=0;i<count;i++){p[i*2]=l[i];p[i*2+1]=r[i];}this.micChunks.push(p);this.micFrames+=count;if(this.micFrames>=this.context.sampleRate*20)this.onMicLimit?.();};this.micSource.connect(this.micNode);this.micNode.connect(this.micGain);this.micGain.connect(this.context.destination);return true;}finally{if(request===this.micToken)this.micPending=false;} }
    disconnectMic() { this.micCapturing=false;this.micStream?.getTracks().forEach(t=>t.stop());this.micSource?.disconnect();this.micNode?.disconnect();this.micGain?.disconnect();this.micStream=this.micSource=this.micNode=this.micGain=null; }
    cancelMicCapture() { this.micToken++;this.micPending=false;this.disconnectMic();this.micChunks=[];this.micFrames=0; }
    stopMicCapture() { if(!this.micCapturing)return null;this.disconnectMic();const pcm=new Float32Array(this.micFrames*2);let n=0;for(const p of this.micChunks){pcm.set(p,n);n+=p.length;}this.micChunks=[];this.micFrames=0;return pcm.length?encodePCM(pcm,this.context.sampleRate,'A microphone, caught red-handed'):null; }
    async startRecording() { if(this.isRecording)throw new Error('The live mix is already being captured.');const token=this.generation,request=++this.recordToken;await this.init();if(token!==this.generation||request!==this.recordToken)return false;const take={id:request,chunks:[],frames:0,resolve:null};this.recordTakes.set(request,take);this.recordTake=take;this.recordFrames=0;this.isRecording=true;if(!this.core)this.node.port.postMessage({type:'record',enabled:true,id:request});return true; }
    async stopRecording() { this.recordToken++;const take=this.recordTake;if(!take)return null;this.isRecording=false;this.recordTake=null;this.recordFrames=0;if(!this.core){await new Promise(resolve=>{take.resolve=resolve;this.node.port.postMessage({type:'record',enabled:false,id:take.id});setTimeout(resolve,500);});}if(!this.recordTakes.has(take.id))return null;this.recordTakes.delete(take.id);const pcm=new Float32Array(take.chunks.reduce((n,p)=>n+p.length,0));let k=0;for(const p of take.chunks){pcm.set(p,k);k+=p.length;}return pcm.length?waveBlob(pcm,this.context.sampleRate):null; }
    async renderWav(bars=4,tailSeconds=3,options={}) { const checkCancelled=()=>{if(options.signal?.aborted)throw new DOMException('Audio export cancelled.','AbortError');};checkCancelled();bars=boundInt(bars,1,16);tailSeconds=Math.min(10,Math.max(0,Number(tailSeconds)||0));const state=RavelSchema.normalize(this.state),sample=this.getSample(),sr=48000,mainFrames=Math.round(bars*240/state.tempo*sr),frames=mainFrames+Math.round(tailSeconds*sr),pcm=new Float32Array(frames*2),core=DSP.createCore(payload(state),sample,sr),l=new Float32Array(1024),r=new Float32Array(1024);core.start();let at=0,blocks=0;while(at<frames){if(blocks%128===0)checkCancelled();if(at===mainFrames)core.stop();const len=Math.min(1024,frames-at,at<mainFrames?mainFrames-at:1024);core.processBlock(l.subarray(0,len),r.subarray(0,len));for(let i=0;i<len;i++){pcm[(at+i)*2]=l[i];pcm[(at+i)*2+1]=r[i];}at+=len;if(++blocks%128===0)await new Promise(resolve=>setTimeout(resolve,0));}checkCancelled();return waveBlob(pcm,sr); }
    async renderSliceWav(slice,tailSeconds=3,options={}) {
      const checkCancelled=()=>{if(options.signal?.aborted)throw new DOMException('Audio export cancelled.','AbortError');};checkCancelled();
      slice=boundInt(slice,0,15);const state=RavelSchema.normalize(this.state),sample=this.getSample(),sr=48000,total=sample.pcm.length/2,trim=state.sample.trimEnd-state.sample.trimStart;
      const lo=Math.round((state.sample.trimStart+state.boundaries[slice]*trim)*total),hi=Math.max(lo+1,Math.min(total,Math.round((state.sample.trimStart+state.boundaries[slice+1]*trim)*total)));
      const rate=sample.sampleRate/sr*Math.pow(2,state.sample.pitch/12),mainFrames=Math.max(1,Math.ceil((hi-lo)/rate)),frames=mainFrames+Math.round(Math.min(10,Math.max(0,Number(tailSeconds)||0))*sr);
      const pcm=new Float32Array(frames*2),core=DSP.createCore(payload(state),sample,sr),left=new Float32Array(1024),right=new Float32Array(1024);core.triggerSlice(slice,{velocity:.9});
      for(let at=0,blocks=0;at<frames;blocks++){if(blocks%128===0)checkCancelled();const count=Math.min(1024,frames-at);core.processBlock(left.subarray(0,count),right.subarray(0,count));for(let i=0;i<count;i++){pcm[(at+i)*2]=left[i];pcm[(at+i)*2+1]=right[i];}at+=count;if(blocks%128===0)await new Promise(resolve=>setTimeout(resolve,0));}
      checkCancelled();return waveBlob(pcm,sr);
    }

  }
  function boundInt(x,a,b){return Math.round(Math.min(b,Math.max(a,Number(x)||a)));}
  RavelAudio.encodePCM=encodePCM;
  window.RavelAudio=RavelAudio;
})();
