/* CUPBOARD · original cabinet/body impulse responses and four virtual microphones. */
(function (scope) {
  'use strict';
  function createLoomCabinetDSP() {
    'use strict';
    // This complete factory is serialized into the real-time AudioWorklet.
    const PI = Math.PI, TAU = PI * 2, HOP = 128, FFT_SIZE = HOP * 2, BINS = HOP + 1;
    const specifications = {
      model: ['open112','tweed110','british212','british412','modern412','bass410','bass810','bass115','rotary','radio','megaphone','horn','electrostatic','underwater','acousticguitar','violin','cello','grandpiano','metalbowl','woodenbox'],
      stereo: ['mono','split'], alignment: ['aligned','natural'], input: [-24,24,0], output: [-24,12,0], lowCut: [20,400,40], highCut: [1500,20000,18000], room: [0,1,0], mix: [0,1,1]
    };
    const micTypes = ['dynamic57','dynamic421','dynamic20','ribbon121','ribbon160','condenser87','condenser414','small184','omni','contact'];
    const micDefaults = [
      ['on','dynamic57',0,0,.08,0,0,0], ['off','ribbon121',-.3,0,.18,20,-6,-.25],
      ['off','condenser87',.45,0,.65,-25,-9,.25], ['off','omni',0,0,1.8,0,-12,0]
    ];
    for (let n = 1; n <= 4; n++) {
      const k = 'mic' + n, d = micDefaults[n-1];
      specifications[k+'Enabled'] = d[0] === 'on' ? ['on','off'] : ['off','on'];
      specifications[k+'Type'] = [d[1], ...micTypes.filter(type => type !== d[1])];
      specifications[k+'X'] = [-1,1,d[2]]; specifications[k+'Y'] = [-1,1,d[3]];
      specifications[k+'Distance'] = [.02,3,d[4]]; specifications[k+'Angle'] = [-180,180,d[5]];
      specifications[k+'Level'] = [-60,12,d[6]]; specifications[k+'Pan'] = [-1,1,d[7]];
      specifications[k+'Polarity'] = ['normal','invert']; specifications[k+'Solo'] = ['off','on'];
    }
    const keys = Object.keys(specifications), clamp = (x,a,b) => Math.max(a,Math.min(b,x));
    const finite = (x,fallback) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const clean = x => x >= -8 && x <= 8 ? x : Number.isFinite(x) ? clamp(x,-8,8) : 0;
    const db = x => Math.pow(10,x/20), dbRead = x => 20*Math.log10(Math.max(1e-6,x));
    const lowpass = (hz,sr) => 1-Math.exp(-TAU*Math.min(hz,sr*.43)/sr);
    function normalize(value) {
      const source = value && typeof value === 'object' ? value : {}, out = {};
      for (const key of keys) { const r = specifications[key]; out[key] = typeof r[0] === 'number' ? clamp(finite(source[key],r[2]),r[0],r[1]) : r.includes(source[key]) ? source[key] : r[0]; }
      out.bypass = source.bypass === true; return out;
    }
    // Broad physical design choices, not captured responses from named hardware.
    // low/high, cone/cavity peak frequency,dB,Q, notch frequency,dB,Q,
    // internal reflection seconds/gain, duration seconds, radiating half-width.
    const profiles = {
      open112: [72,5300,2250,3.8,.85,720,-3,1.1,.0018,-.16,.024,.17],
      tweed110: [100,5700,1850,4.5,.9,460,-3.5,1,.00125,.17,.024,.13],
      british212: [78,5500,2600,4.2,1.1,1050,-3.4,1.4,.0021,-.19,.028,.29],
      british412: [70,5000,3000,5.4,1.2,850,-4.4,1.5,.0028,.21,.032,.31],
      modern412: [62,5500,3600,5.6,1.5,580,-5,1.1,.0032,-.2,.032,.32],
      bass410: [42,4300,1000,2.7,.8,240,-2.7,1.3,.0025,.16,.036,.3],
      bass810: [38,3400,720,3.6,.85,330,-3.1,1.5,.0038,-.21,.04,.32],
      bass115: [34,3400,155,3.5,1.15,1200,-3,1.2,.0042,.23,.04,.21],
      rotary: [65,6200,1650,3.8,1.5,600,-4.5,1.25,.0048,-.24,.036,.26],
      radio: [240,4400,1350,6.2,1.3,700,-5,2,.0016,.3,.026,.09],
      megaphone: [350,4600,1750,8,1.8,3700,-5,2.2,.0022,.32,.03,.12],
      horn: [170,8200,2650,6,1.4,1200,-4.5,1.8,.0037,-.27,.032,.24],
      electrostatic: [48,16000,4800,1.2,.6,2100,-1.5,1,.0011,-.08,.026,.34],
      underwater: [85,2600,560,6,2,1450,-7,2.6,.006,.3,.04,.21],
      acousticguitar: [75,11500,185,5.8,3.8,850,-3.2,2,.0024,-.16,.04,.19],
      violin: [180,12500,470,5.5,4.5,1600,-3.5,2.1,.0016,.15,.04,.11],
      cello: [55,10000,130,6.3,3.5,760,-3.8,2.2,.0036,-.19,.04,.21],
      grandpiano: [32,14000,320,4.3,2.8,1600,-2.8,1.6,.0052,.22,.04,.48],
      metalbowl: [160,14500,850,8,12,1800,-5,4,.0058,-.29,.04,.18],
      woodenbox: [80,7600,240,8,4.2,1050,-5,2.8,.0041,.26,.04,.22]
    };
    // Mic low/high, presence Hz/dB/Q, polar pattern, proximity strength, sensitivity.
    // RE20's Variable-D family minimizes proximity; M160 is hypercardioid.
    const microphones = {
      dynamic57: [65,15000,4700,4.2,1,'cardioid',.62,1],
      dynamic421: [42,17000,3500,2.7,.85,'cardioid',.54,1],
      dynamic20: [42,18000,4200,1.1,.75,'cardioid',.08,.98],
      ribbon121: [30,15000,5200,-2.8,.75,'figure8',1.05,.94],
      ribbon160: [40,18000,6400,-1.4,.9,'hyper',.78,.97],
      condenser87: [25,20000,8500,2.7,.8,'cardioid',.45,1.02],
      condenser414: [23,20000,6500,1.9,.8,'cardioid',.38,1.01],
      small184: [24,20000,9000,1.7,.75,'cardioid',.3,1],
      omni: [20,20000,11000,.4,.65,'omni',0,1],
      contact: [70,16000,3100,5.2,1.7,'contact',0,.93]
    };
    const reverse = new Uint16Array(FFT_SIZE), cos = new Float64Array(HOP), sin = new Float64Array(HOP);
    for (let i = 0; i < FFT_SIZE; i++) { let a=i,b=0;for(let j=0;j<8;j++){b=(b<<1)|(a&1);a>>=1;}reverse[i]=b; }
    for (let i=0;i<HOP;i++){cos[i]=Math.cos(TAU*i/FFT_SIZE);sin[i]=Math.sin(TAU*i/FFT_SIZE);}
    function fft(re,im,inverse) {
      for(let i=0;i<FFT_SIZE;i++){const j=reverse[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
      for(let size=2;size<=FFT_SIZE;size*=2){const half=size/2,step=FFT_SIZE/size;for(let start=0;start<FFT_SIZE;start+=size)for(let j=0;j<half;j++){
        const c=cos[j*step],s=inverse?sin[j*step]:-sin[j*step],at=start+j,other=at+half,tr=c*re[other]-s*im[other],ti=s*re[other]+c*im[other];
        re[other]=re[at]-tr;im[other]=im[at]-ti;re[at]+=tr;im[at]+=ti;
      }}
      if(inverse)for(let i=0;i<FFT_SIZE;i++){re[i]/=FFT_SIZE;im[i]/=FFT_SIZE;}
    }
    function biquad(kind,hz,q,gain,sr) {
      const w=TAU*clamp(hz,10,sr*.43)/sr,c=Math.cos(w),alpha=Math.sin(w)/(2*q),A=Math.pow(10,gain/40);
      let b0,b1,b2,a0,a1,a2;
      if(kind==='high'){b0=(1+c)/2;b1=-(1+c);b2=b0;a0=1+alpha;a1=-2*c;a2=1-alpha;}
      else if(kind==='low'){b0=(1-c)/2;b1=1-c;b2=b0;a0=1+alpha;a1=-2*c;a2=1-alpha;}
      else {b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;}
      return new Float64Array([b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]);
    }
    function filter(value,c,s,at) {const out=c[0]*value+s[at];s[at]=c[1]*value-c[3]*out+s[at+1];s[at+1]=c[2]*value-c[4]*out;return Number.isFinite(out)?out:0;}
    const responseCache = new Map();
    function cachedResponse(model,sr){const key=sr+':'+model;const value=responseCache.get(key);if(value){responseCache.delete(key);responseCache.set(key,value);}return value;}
    function responseJob(model,sr) {
      const key=sr+':'+model,p=profiles[model],length=Math.max(64,Math.ceil(sr*p[10])),raw=new Float64Array(length),states=Array.from({length:4},()=>new Float64Array(2));
      const coefficients=[biquad('high',p[0],.72,0,sr),biquad('low',p[1],.72,0,sr),biquad('peak',p[2],p[4],p[3],sr),biquad('peak',p[5],p[7],p[6],sr)];
      // Modes are linear recurrences. Neither generating each IR sample nor
      // reading it in real time needs a transcendental-function evaluation.
      const body=model==='acousticguitar'||model==='violin'||model==='cello'||model==='grandpiano'||model==='metalbowl'||model==='woodenbox';
      const modal=body?Array.from({length:4},(_,j)=>{const freq=p[2]*[.59,1,1.67,2.43][j],r=Math.exp(-1/(sr*(model==='metalbowl'?.027:.018)*(1-j*.12))),w=TAU*Math.min(freq,sr*.41)/sr;return {a:2*r*Math.cos(w),b:-r*r,y1:0,y2:0,impulse:Math.sin(w)*r*(1-r)*[2.4,3.1,2.2,1.6][j]};}):[];
      const windowStart=Math.ceil((length-1)*.72),step=PI/Math.max(1,(length-1)*.28),cs=Math.cos(step),ss=Math.sin(step),theta=(windowStart/(length-1)-.72)/.28*PI;
      let wc=Math.cos(theta),ws=Math.sin(theta),cursor=0,stage=0,energy=0,calibration=1,value=null,done=false;
      return {model,get done(){return done;},get value(){return value;},advance(){
        if(done)return true;
        if(stage===0){const end=Math.min(length,cursor+256);for(let i=cursor;i<end;i++){
          let sample=i===0?1:0;for(let k=0;k<coefficients.length;k++)sample=filter(sample,coefficients[k],states[k],0);
          for(const mode of modal){const y=mode.a*mode.y1+mode.b*mode.y2+(i===0?mode.impulse:0);mode.y2=mode.y1;mode.y1=y;sample+=y;}
          let window=1;if(i>=windowStart){window=i===length-1?0:.5+.5*wc;const next=wc*cs-ws*ss;ws=ws*cs+wc*ss;wc=next;}raw[i]=sample*window;
        }cursor=end;if(cursor===length){stage=1;cursor=length-1;}return false;}
        if(stage===1){const end=Math.max(-1,cursor-256),delay=Math.round(sr*p[8]);for(let i=cursor;i>end;i--){if(i>=delay)raw[i]+=raw[i-delay]*p[9];energy+=raw[i]*raw[i];}cursor=end;if(cursor<0){calibration=.78/Math.sqrt(Math.max(1e-12,energy));const head=new Float64Array(HOP);for(let i=0;i<Math.min(HOP,length);i++)head[i]=raw[i]*calibration;value={model,length,seconds:length/sr,head,parts:[]};cursor=HOP;stage=2;}return false;}
        if(cursor<length){const re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE);for(let i=0;i<HOP&&cursor+i<length;i++)re[i]=raw[cursor+i]*calibration;fft(re,im,false);value.parts.push({re:re.slice(0,BINS),im:im.slice(0,BINS)});cursor+=HOP;}
        if(cursor>=length){done=true;responseCache.set(key,value);if(responseCache.size>4)responseCache.delete(responseCache.keys().next().value);}return done;
      }};
    }
    function response(model,sr){const hit=cachedResponse(model,sr);if(hit)return hit;const job=responseJob(model,sr);while(!job.advance()){}return job.value;}
    function sourceHistory() {
      const capacity=64,hist=Array.from({length:3},()=>Array.from({length:capacity},()=>({re:new Float64Array(BINS),im:new Float64Array(BINS)}))),ring=Array.from({length:3},()=>new Float64Array(HOP));
      const block=[new Float64Array(FFT_SIZE),new Float64Array(FFT_SIZE)],imag=[new Float64Array(FFT_SIZE),new Float64Array(FFT_SIZE)];
      let at=-1,phase=0,latest=-1,filled=0;
      return {hist,ring,capacity,get at(){return at;},get phase(){return phase;},get latest(){return latest;},get filled(){return filled;},
        push(l,r){at=(at+1)%HOP;ring[0][at]=l;ring[1][at]=r;ring[2][at]=(l+r)*.5;block[0][phase]=l;block[1][phase]=r;},
        finish(){if(++phase<HOP)return false;phase=0;latest=(latest+1)%capacity;filled=Math.min(capacity,filled+1);for(let ch=0;ch<2;ch++){block[ch].fill(0,HOP);imag[ch].fill(0);fft(block[ch],imag[ch],false);hist[ch][latest].re.set(block[ch].subarray(0,BINS));hist[ch][latest].im.set(imag[ch].subarray(0,BINS));}for(let j=0;j<BINS;j++){hist[2][latest].re[j]=(hist[0][latest].re[j]+hist[1][latest].re[j])*.5;hist[2][latest].im[j]=(hist[0][latest].im[j]+hist[1][latest].im[j])*.5;}return true;},
        reset(){for(const row of hist)for(const h of row){h.re.fill(0);h.im.fill(0);}for(const r of ring)r.fill(0);for(const r of block)r.fill(0);for(const r of imag)r.fill(0);at=latest=-1;phase=filled=0;}
      };
    }
    function convolver(ir,source,ch,prewarm=true) {
      const tail=new Float64Array(HOP),overlap=new Float64Array(HOP),re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE);
      function sum(offset){re.fill(0);im.fill(0);const available=source.filled-offset;
        for(let p=0;p<ir.parts.length&&p<available;p++){const h=ir.parts[p],x=source.hist[ch][(source.latest-offset-p+source.capacity*2)%source.capacity];for(let j=0;j<BINS;j++){re[j]+=x.re[j]*h.re[j]-x.im[j]*h.im[j];im[j]+=x.re[j]*h.im[j]+x.im[j]*h.re[j];}}
        for(let j=BINS;j<FFT_SIZE;j++){re[j]=re[FFT_SIZE-j];im[j]=-im[FFT_SIZE-j];}fft(re,im,true);
      }
      function next(){if(!ir.parts.length)return;sum(0);for(let i=0;i<HOP;i++){tail[i]=re[i]+overlap[i];overlap[i]=re[i+HOP];}}
      function prime(){if(!ir.parts.length||!source.filled)return;sum(1);for(let i=0;i<HOP;i++)overlap[i]=re[i+HOP];next();}
      if(prewarm)prime();
      return {tick(){const r=source.ring[ch],head=ir.head;let value=tail[source.phase],j=0;for(let at=source.at;at>=0;at--)value+=head[j++]*r[at];for(let at=HOP-1;j<HOP;at--)value+=head[j++]*r[at];return value;},next,reset(){tail.fill(0);overlap.fill(0);re.fill(0);im.fill(0);}};
    }
    function body(ir,source,stereo,prewarm=true){const l=convolver(ir,source,stereo==='mono'?2:0,prewarm),r=stereo==='split'?convolver(ir,source,1,prewarm):null;return {ir,stereo,l,r,next(){l.next();r?.next();},reset(){l.reset();r?.reset();}};}
    function read(buffer,at,delay){let where=at-delay;while(where<0)where+=buffer.length;const i=Math.floor(where),f=where-i,j=i+1===buffer.length?0:i+1;return buffer[i]+(buffer[j]-buffer[i])*f;}
    function create(sampleRate,params) {
      const sr=clamp(finite(sampleRate,48000),8000,192000),fadeFrames=Math.max(1,Math.round(sr*.025)),slew=1-Math.exp(-1/(sr*.018)),meterDecay=Math.exp(-1/(sr*.12));
      let p=normalize(params),source=sourceHistory(),ir=response(p.model,sr),current=body(ir,source,p.stereo),previous=null,warming=null,job=null,designClock=0,bodyFade=0,kernelBuilds=1,modelChanges=0;
      const ringLength=Math.ceil(sr*.065)+8,bodyL=new Float64Array(ringLength),bodyR=new Float64Array(ringLength),hpState=new Float64Array(4),lpState=new Float64Array(2);
      let ringAt=0,inputGain=db(p.input),outputGain=db(p.output),targetInput=inputGain,targetOutput=outputGain,wetMix=p.bypass?0:p.mix,mixFrames=0,mixStep=0,mixTarget=wetMix,room=p.room;
      let hpCoefficient=Math.exp(-TAU*p.lowCut/sr),lpCoefficient=lowpass(p.highCut,sr),targetHP=hpCoefficient,targetLP=lpCoefficient;
      let inputPeak=0,outputPeak=0,renderedFrames=0,convolvedFrames=0,quietFrames=Infinity,idle=true,lastBodyL=0,lastBodyR=0,globalMoving=0,bodyMirrored=true;
      const bassCut=lowpass(180,sr);
      const mics=Array.from({length:4},(_,i)=>({index:i,key:'mic'+(i+1),state:new Float64Array(4),coeff:new Float64Array(5),targetCoeff:new Float64Array(5),hp:new Float64Array(4),tone:new Float64Array(2),bass:new Float64Array(2),gain:0,targetGain:0,levelGain:1,acousticGain:0,panL:1,panR:1,targetPanL:1,targetPanR:1,gainFrames:0,gainStep:0,delay:0,targetDelay:0,cut:1,targetCut:1,proximity:0,targetProximity:0,hpf:0,targetHPF:0,pan:0,targetPan:0,x:0,targetX:0,y:0,targetY:0,distance:.08,targetDistance:.08,angle:0,targetAngle:0,contact:false,moving:0}));
      let workMics=[];
      function selected(next){return next.model!==current.ir.model||next.stereo!==current.stereo;}
      function acceptResponse(nextIR){
        const next=body(nextIR,source,p.stereo,false);
        if(idle){current=next;previous=warming=null;bodyFade=0;}
        else warming={body:next,blocks:2};
      }
      function advanceDesign(){
        if(job&&job.model!==p.model)job=null;
        if(warming&&(warming.body.ir.model!==p.model||warming.body.stereo!==p.stereo))warming=null;
        if(!selected(p)){job=warming=null;return;}
        if(previous||warming)return;
        if(!job){const hit=cachedResponse(p.model,sr);if(hit){acceptResponse(hit);return;}job=responseJob(p.model,sr);}
        if(job.advance()){const ready=job.value;job=null;kernelBuilds++;modelChanges++;acceptResponse(ready);}
      }
      function acoustic(m,next,instant,old){
        const k=m.key,changed=instant||old.model!==next.model||old.alignment!==next.alignment||old[k+'Type']!==next[k+'Type']||old[k+'X']!==next[k+'X']||old[k+'Y']!==next[k+'Y']||old[k+'Distance']!==next[k+'Distance']||old[k+'Angle']!==next[k+'Angle'];
        if(changed){
          const type=microphones[next[k+'Type']],contact=type[5]==='contact',profile=profiles[next.model],x=next[k+'X'],y=next[k+'Y'],distance=next[k+'Distance'],angle=next[k+'Angle']*PI/180;
          const px=x*profile[11]*.38,py=y*profile[11]*.42,path=Math.sqrt(distance*distance+px*px+py*py),incidence=(distance*Math.cos(angle)-px*Math.sin(angle))/Math.max(.0001,path);
          const polar=type[5]==='omni'||contact?1:type[5]==='figure8'?incidence:type[5]==='hyper'?.25+.75*incidence:.5+.5*incidence;
          const cone=Math.min(1.8,Math.hypot(x,y)*.6),rotation=type[5]==='omni'||contact?0:Math.abs(Math.sin(angle))*.4;
          const maxCut=Math.min(sr*.43,type[1]*(1-.34*Math.min(1.8,cone+rotation))/(1+(contact?0:distance*.04)));
          const cut=lowpass(Math.max(500,maxCut),sr),hpf=Math.exp(-TAU*Math.min(type[0],sr*.2)/sr),proximity=contact?0:type[6]*Math.exp(-distance/.18),delay=contact||next.alignment==='aligned'?0:path/343*sr;
          if(cut!==m.targetCut){m.targetCut=cut;m.moving|=4;}if(hpf!==m.targetHPF){m.targetHPF=hpf;m.moving|=16;}
          if(proximity!==m.targetProximity){m.targetProximity=proximity;m.moving|=8;}if(delay!==m.targetDelay){m.targetDelay=delay;m.moving|=2;}m.contact=contact;
          const distanceGain=contact?.9/(1+.25*(x*x+y*y)):.18/(.1+path);
          m.acousticGain=type[7]*distanceGain*polar;
          if(instant||old[k+'Type']!==next[k+'Type']){m.targetCoeff.set(biquad('peak',type[2],type[4],type[3],sr));m.moving|=32;}
        }
        if(instant||old[k+'Level']!==next[k+'Level'])m.levelGain=db(next[k+'Level']);
        const on=next[k+'Enabled']==='on'&&(!next._solo||next[k+'Solo']==='on'),gain=on?m.levelGain*m.acousticGain*(next[k+'Polarity']==='invert'?-1:1):0;
        if(gain!==m.targetGain){m.targetGain=gain;m.gainFrames=fadeFrames;m.gainStep=(gain-m.gain)/fadeFrames;}
        if(instant||old[k+'Pan']!==next[k+'Pan']){const angle=(next[k+'Pan']+1)*PI*.25;m.targetPan=next[k+'Pan'];m.targetPanL=Math.cos(angle)*Math.SQRT2;m.targetPanR=Math.sin(angle)*Math.SQRT2;m.moving|=1;}
        if(instant||old[k+'X']!==next[k+'X']||old[k+'Y']!==next[k+'Y']||old[k+'Distance']!==next[k+'Distance']||old[k+'Angle']!==next[k+'Angle']){m.targetX=next[k+'X'];m.targetY=next[k+'Y'];m.targetDistance=next[k+'Distance'];m.targetAngle=next[k+'Angle'];m.moving|=64;}
        if(instant){m.gain=m.targetGain;m.gainFrames=0;m.coeff.set(m.targetCoeff);m.delay=m.targetDelay;m.cut=m.targetCut;m.proximity=m.targetProximity;m.hpf=m.targetHPF;m.pan=next[k+'Pan'];m.panL=m.targetPanL;m.panR=m.targetPanR;m.x=next[k+'X'];m.y=next[k+'Y'];m.distance=next[k+'Distance'];m.angle=next[k+'Angle'];m.moving=0;}
      }
      function update(next,instant){
        const old=p;p=next;
        if(instant||old.lowCut!==p.lowCut){targetHP=Math.exp(-TAU*p.lowCut/sr);globalMoving|=8;}
        if(instant||old.highCut!==p.highCut){targetLP=lowpass(p.highCut,sr);globalMoving|=16;}
        if(instant||old.input!==p.input){targetInput=db(p.input);globalMoving|=1;}
        if(instant||old.output!==p.output){targetOutput=db(p.output);globalMoving|=2;}
        if(instant||old.room!==p.room)globalMoving|=4;
        p._solo=mics.some(m=>p[m.key+'Enabled']==='on'&&p[m.key+'Solo']==='on');
        for(const m of mics)acoustic(m,p,instant,old);
        workMics=mics.filter(m=>m.gain!==0||m.targetGain!==0||m.gainFrames>0);
        const target=p.bypass?0:p.mix;
        if(instant){wetMix=mixTarget=target;mixFrames=0;inputGain=targetInput;outputGain=targetOutput;room=p.room;hpCoefficient=targetHP;lpCoefficient=targetLP;globalMoving=0;}
        else if(target!==mixTarget){mixTarget=target;mixFrames=fadeFrames;mixStep=(target-wetMix)/fadeFrames;}
      }
      function clearHistory(){source.reset();current.reset();previous=warming=null;bodyFade=0;bodyL.fill(0);bodyR.fill(0);hpState.fill(0);lpState.fill(0);for(const m of mics){m.state.fill(0);m.hp.fill(0);m.tone.fill(0);m.bass.fill(0);}ringAt=0;quietFrames=Infinity;idle=true;lastBodyL=lastBodyR=0;bodyMirrored=true;}
      function effectiveCount(){return mics.filter(m=>p[m.key+'Enabled']==='on'&&(!p._solo||p[m.key+'Solo']==='on')).length;}
      function tailSeconds(){return Math.max(current.ir.seconds,previous?.ir.seconds||0,profiles[p.model][10])+.065+.16;}
      update(p,true);
      return {
        setParams(values){const next=normalize(Object.assign({},p,values&&typeof values==='object'?values:{}));update(next,false);},
        process(left,right){
          if(!left||!right||left.length!==right.length)throw new Error('CUPBOARD requires equal stereo blocks.');
          if(wetMix===0&&mixTarget===0&&mixFrames===0){
            for(let i=0;i<left.length;i++){if(++designClock===HOP){designClock=0;advanceDesign();}const l=clean(left[i]),r=clean(right[i]);left[i]=l;right[i]=r;inputPeak=Math.max(Math.abs(l),Math.abs(r),inputPeak*meterDecay);outputPeak=Math.max(Math.abs(l),Math.abs(r),outputPeak*meterDecay);}return;
          }
          const quietLimit=Math.ceil(tailSeconds()*sr);
          for(let i=0;i<left.length;i++){
            if(++designClock===HOP){designClock=0;advanceDesign();}
            const dryL=clean(left[i]),dryR=clean(right[i]);inputPeak=Math.max(Math.abs(dryL),Math.abs(dryR),inputPeak*meterDecay);
            // A callback can begin or end halfway through a finite dry fade.
            // Every settled-dry sample must skip the same control work, not
            // merely callbacks that happened to begin after the fade ended.
            if(wetMix===0&&mixTarget===0&&mixFrames===0){left[i]=dryL;right[i]=dryR;outputPeak=Math.max(Math.abs(dryL),Math.abs(dryR),outputPeak*meterDecay);continue;}
            // A settled value either equals its target or its next floating-point
            // addition is too small to change it. Skipping only those stalled
            // updates preserves the old recurrence exactly, without snapping.
            if(globalMoving&1){const before=inputGain;inputGain+=slew*(targetInput-inputGain);if(inputGain===before)globalMoving&=~1;}
            if(globalMoving&2){const before=outputGain;outputGain+=slew*(targetOutput-outputGain);if(outputGain===before)globalMoving&=~2;}
            if(globalMoving&4){const before=room;room+=slew*(p.room-room);if(room===before)globalMoving&=~4;}
            if(globalMoving&8){const before=hpCoefficient;hpCoefficient+=slew*(targetHP-hpCoefficient);if(hpCoefficient===before)globalMoving&=~8;}
            if(globalMoving&16){const before=lpCoefficient;lpCoefficient+=slew*(targetLP-lpCoefficient);if(lpCoefficient===before)globalMoving&=~16;}
            if(mixFrames>0){wetMix+=mixStep;if(--mixFrames===0){wetMix=mixTarget;if(wetMix===0)clearHistory();}}
            else if(wetMix!==mixTarget){wetMix+=slew*(mixTarget-wetMix);if(Math.abs(wetMix-mixTarget)<1e-12)wetMix=mixTarget;}
            let live=false;
            for(const m of workMics){
              if(m.gainFrames>0){m.gain+=m.gainStep;if(--m.gainFrames===0)m.gain=m.targetGain;}
              if(m.gain===0&&m.targetGain===0)continue;
              if(m.moving&1){const a=m.pan,b=m.panL,c=m.panR;m.pan+=slew*(m.targetPan-m.pan);m.panL+=slew*(m.targetPanL-m.panL);m.panR+=slew*(m.targetPanR-m.panR);if(m.pan===a&&m.panL===b&&m.panR===c)m.moving&=~1;}
              if(m.moving&2){const before=m.delay;m.delay+=slew*(m.targetDelay-m.delay);if(m.delay===before)m.moving&=~2;}
              if(m.moving&4){const before=m.cut;m.cut+=slew*(m.targetCut-m.cut);if(m.cut===before)m.moving&=~4;}
              if(m.moving&8){const before=m.proximity;m.proximity+=slew*(m.targetProximity-m.proximity);if(m.proximity===before)m.moving&=~8;}
              if(m.moving&16){const before=m.hpf;m.hpf+=slew*(m.targetHPF-m.hpf);if(m.hpf===before)m.moving&=~16;}
              if(m.moving&64){const a=m.x,b=m.y,c=m.distance,d=m.angle;m.x+=slew*(m.targetX-m.x);m.y+=slew*(m.targetY-m.y);m.distance+=slew*(m.targetDistance-m.distance);m.angle+=slew*(m.targetAngle-m.angle);if(m.x===a&&m.y===b&&m.distance===c&&m.angle===d)m.moving&=~64;}
              if(m.moving&32){let changed=false;for(let j=0;j<5;j++){const before=m.coeff[j];m.coeff[j]+=slew*(m.targetCoeff[j]-m.coeff[j]);if(m.coeff[j]!==before)changed=true;}if(!changed)m.moving&=~32;}
              live=true;
            }
            if(wetMix===0&&mixTarget===0){left[i]=dryL;right[i]=dryR;outputPeak=Math.max(Math.abs(dryL),Math.abs(dryR),outputPeak*meterDecay);continue;}
            let wetL=0,wetR=0;
            if(live){
              if(dryL===0&&dryR===0){if(!idle&&++quietFrames>=quietLimit)clearHistory();}else{quietFrames=0;idle=false;}
              if(!idle){
                renderedFrames++;if(current.r||previous?.r)bodyMirrored=false;source.push(dryL*inputGain,dryR*inputGain);let a=current.l.tick(),b=current.r?current.r.tick():a;convolvedFrames+=current.r?2:1;
                if(previous){const oldL=previous.l.tick(),oldR=previous.r?previous.r.tick():oldL,x=(fadeFrames-bodyFade+1)/fadeFrames;a=oldL+(a-oldL)*x;b=oldR+(b-oldR)*x;convolvedFrames+=previous.r?2:1;if(--bodyFade===0)previous=null;}
                bodyL[ringAt]=a;bodyR[ringAt]=b;lastBodyL=a;lastBodyR=b;
                for(const m of workMics){if(m.gain===0&&m.targetGain===0)continue;
                  let a=m.delay<1e-6?lastBodyL:read(bodyL,ringAt,m.delay);
                  if(bodyMirrored){
                    // A mono body has identical ring and mic-filter histories.
                    // Mirror the exact left recurrence, including signed zero.
                    // Once split audio has run, retain both paths until reset.
                    if(room>1e-8&&!m.contact)a+=room*(read(bodyL,ringAt,m.delay+sr*.009)*.19-read(bodyR,ringAt,m.delay+sr*.017)*.13+read(bodyL,ringAt,m.delay+sr*.031)*.09);
                    const hpA=a-m.hp[0]+m.hpf*m.hp[2];m.hp[0]=m.hp[1]=a;m.hp[2]=m.hp[3]=hpA;
                    a=filter(hpA,m.coeff,m.state,0);m.state[2]=m.state[0];m.state[3]=m.state[1];m.bass[0]+=bassCut*(a-m.bass[0]);m.bass[1]=m.bass[0];a+=m.bass[0]*m.proximity;m.tone[0]+=m.cut*(a-m.tone[0]);m.tone[1]=m.tone[0];
                  }else{
                    let b=m.delay<1e-6?lastBodyR:read(bodyR,ringAt,m.delay);
                    if(room>1e-8&&!m.contact){a+=room*(read(bodyL,ringAt,m.delay+sr*.009)*.19-read(bodyR,ringAt,m.delay+sr*.017)*.13+read(bodyL,ringAt,m.delay+sr*.031)*.09);b+=room*(read(bodyR,ringAt,m.delay+sr*.009)*.19-read(bodyL,ringAt,m.delay+sr*.017)*.13+read(bodyR,ringAt,m.delay+sr*.031)*.09);}
                    const hpA=a-m.hp[0]+m.hpf*m.hp[2],hpB=b-m.hp[1]+m.hpf*m.hp[3];m.hp[0]=a;m.hp[1]=b;m.hp[2]=hpA;m.hp[3]=hpB;
                    a=filter(hpA,m.coeff,m.state,0);b=filter(hpB,m.coeff,m.state,2);m.bass[0]+=bassCut*(a-m.bass[0]);m.bass[1]+=bassCut*(b-m.bass[1]);a+=m.bass[0]*m.proximity;b+=m.bass[1]*m.proximity;m.tone[0]+=m.cut*(a-m.tone[0]);m.tone[1]+=m.cut*(b-m.tone[1]);
                  }
                  wetL+=m.tone[0]*m.gain*m.panL;wetR+=m.tone[1]*m.gain*m.panR;
                }
                if(++ringAt===ringLength)ringAt=0;
                if(source.finish()){current.next();previous?.next();if(warming){warming.body.next();if(--warming.blocks===0){previous=current;current=warming.body;warming=null;bodyFade=fadeFrames;}}}
              }
            }else if(!idle)clearHistory();
            const hpL=wetL-hpState[0]+hpCoefficient*hpState[2],hpR=wetR-hpState[1]+hpCoefficient*hpState[3];hpState[0]=wetL;hpState[1]=wetR;hpState[2]=hpL;hpState[3]=hpR;lpState[0]+=lpCoefficient*(hpL-lpState[0]);lpState[1]+=lpCoefficient*(hpR-lpState[1]);
            const outL=clean(dryL+(lpState[0]*outputGain-dryL)*wetMix),outR=clean(dryR+(lpState[1]*outputGain-dryR)*wetMix);left[i]=outL;right[i]=outR;outputPeak=Math.max(Math.abs(outL),Math.abs(outR),outputPeak*meterDecay);
          }
        },
        reset(){previous=warming=job=null;designClock=0;bodyFade=0;if(selected(p)){ir=response(p.model,sr);current=body(ir,source,p.stereo);kernelBuilds++;}clearHistory();update(p,true);inputPeak=outputPeak=0;},
        getParams(){const out=Object.assign({},p);delete out._solo;return out;},getLatencyTime(){return 0;},
        getTailTime(){return wetMix===0&&mixTarget===0||!mics.some(m=>m.gain!==0||m.targetGain!==0)?0:Math.max(tailSeconds(),mixFrames/sr,bodyFade/sr);},
        getMeters(){return {pendingIR:selected(p)||!!job||!!warming,inputDb:dbRead(inputPeak),outputDb:dbRead(outputPeak),activeMics:effectiveCount(),processingMics:idle||wetMix===0?0:mics.filter(m=>m.gain!==0||m.targetGain!==0).length,convolvers:idle||wetMix===0?0:current.r?2:1,kernelBuilds,modelChanges,renderedFrames,convolvedFrames,latencySamples:0,active:!idle&&wetMix>0,mics:mics.map(m=>({enabled:p[m.key+'Enabled']==='on',solo:p[m.key+'Solo']==='on',type:p[m.key+'Type'],x:m.x,y:m.y,distance:m.distance,angle:m.angle,levelDb:p[m.key+'Level'],pan:m.pan,polarity:p[m.key+'Polarity']}))};}
      };
    }
    return {specifications,normalize,create};
  }
  scope.createLoomCabinetDSP=createLoomCabinetDSP;
})(typeof window==='undefined'?globalThis:window);
