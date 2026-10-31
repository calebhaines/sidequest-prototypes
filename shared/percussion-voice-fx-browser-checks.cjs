'use strict';
// Real shared GALLEY inserts, standalone percussion engines, and hosted native
// printing. Source previews never mutate generated app files. Final artifacts:
// PERCUSSION_VOICE_FX_BUILT=1 node shared/percussion-voice-fx-browser-checks.cjs
// Filter with PERCUSSION_VOICE_FX_PHASES=bridge,lifecycle,projects,audio,explicit,exports,live,transport,ui,host and
// PERCUSSION_VOICE_FX_APPS=grain,tine,form,batter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const portable = fs.existsSync(path.join(__dirname, 'galley-effects'));
const root = path.resolve(__dirname, '..');
const artifacts = process.env.PERCUSSION_VOICE_FX_QA_DIR || '/tmp/percussion-voice-fx-qa';
const apps = (process.env.PERCUSSION_VOICE_FX_APPS || 'grain,tine,form,batter').split(',');
const facades = { grain: 'GrainApp', tine: 'TineApp', form: 'FormApp', batter: 'BatterApp' };
const effectFiles = ['vocal-catalog.js','utility-catalog.js','filter-catalog.js','creative-catalog.js','preamp-catalog.js','tape-catalog.js','char-catalog.js','effects-catalog.js','vocal-dsp.js','utility-dsp.js','filter-dsp.js','creative-dsp.js','broiler-pedals.js','compressor-dsp.js','preamp-dsp.js','tape-dsp.js','char-dsp.js','effects.js'];
const engineFiles = ['service-schema.js','schema.js','audio-engine.js','host-bridge.js','instrument-host.js','note-renderer.js','note-playback.js'];
const passed = [];
function check(condition, message) { assert(condition, message); }
function maintainedHTML(id) {
  const preview = process.env.PERCUSSION_VOICE_FX_PREVIEW_DIR && path.join(process.env.PERCUSSION_VOICE_FX_PREVIEW_DIR, id + '.html');
  if (preview && fs.existsSync(preview)) return fs.readFileSync(preview);
  if (process.env.PERCUSSION_VOICE_FX_BUILT || id === 'form') {
    const candidates = [path.join(root, id === 'form' ? 'music/form/index.html' : id + '/index.html'), path.join(root, 'instruments', id + '.html'), path.join(root, 'index.html')];
    return fs.readFileSync(candidates.find(file => fs.existsSync(file)));
  }
  const python = `from pathlib import Path\nimport runpy,re,json,sys\nr=Path(sys.argv[1]);a=r/sys.argv[2];h=runpy.run_path(str(r/'shared/bundle_audio_exchange.py'))\nnames=list(dict.fromkeys(re.findall(r"'([^']+\\.js)'",(a/'build.py').read_text())))\ncss=(a/'styles.css').read_text();js='\\n'.join((a/n).read_text() for n in names)\nif sys.argv[2]=='batter':js='window.BatterLibrary='+json.dumps(json.loads((a/'factory-samples.json').read_text()),separators=(',',':'))+';\\n'+js\nhtml=(a/'app.html').read_text().replace('<!-- STYLES -->','<style>'+css+'</style>').replace('<!-- SCRIPTS -->','<script>'+js.replace('</script','<\\\\/script')+'</script>')\nsys.stdout.write(h['embed_exchange'](html,sys.argv[2],a))`;
  return execFileSync('python3',['-c',python,root,id],{maxBuffer:96*1024*1024});
}
async function serve() {
  const pages = new Map();
  const bridge = '<!doctype html><meta charset="utf-8"><body><script src="/shared/pattern-schema.js"></script>' + effectFiles.map(file => '<script src="/loom/'+file+'"></script>').join('') + '<script src="/shared/voice-effects.js"></script></body>';
  const server = http.createServer((request,response) => {
    const pathname = new URL(request.url,'http://localhost').pathname;
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (pathname === '/bridge.html') { response.setHeader('Content-Type','text/html'); response.end(bridge); return; }
    const app = /^\/(grain|tine|form|batter)\/index\.html$/.exec(pathname)?.[1];
    if (app) { if(!pages.has(app)) pages.set(app,maintainedHTML(app));response.setHeader('Content-Type','text/html');response.end(pages.get(app));return; }
    if (pathname === '/host.html') {
      const embedded=Object.fromEntries(apps.map(id=>[id,maintainedHTML(id).toString()]));
      const html='<!doctype html><meta charset="utf-8"><body><iframe id="editor"></iframe><script>window.LoomEmbeddedInstruments='+JSON.stringify(embedded).replace(/</g,'\\u003c')+';</script><script src="/shared/pattern-schema.js"></script>'+[...effectFiles,...engineFiles].map(file=>'<script src="/loom/'+file+'"></script>').join('');
      response.setHeader('Content-Type','text/html');response.end(html);return;
    }
    let file = path.resolve(root,'.'+pathname);
    if (portable && pathname.startsWith('/loom/')) { const name=pathname.slice(6);file=[path.join(__dirname,'galley-effects',name),path.join(root,name),file].find(candidate=>fs.existsSync(candidate))||file; }
    if (!file.startsWith(root+path.sep)) { response.writeHead(403);response.end();return; }
    fs.readFile(file,(error,data)=>{if(error){response.writeHead(404);response.end();return;}response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');response.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function helpers(page) {
  await page.evaluate(() => {
    const copy=value=>JSON.parse(JSON.stringify(value));
    window.voiceFxQA={
      copy, fx(type,patch={}) { const d=LoomEffectsCatalog.find(d=>d.id===type);if(!d)throw Error('Unknown fixture '+type);return{type,params:{...copy(d.defaults),...patch}}; },
      stats(audio,from=0,to=audio.length){let peak=0,sum=0,first=-1;for(let i=from;i<Math.min(to,audio.length);i++){const v=audio[i];if(!Number.isFinite(v))throw Error('Non-finite audio');peak=Math.max(peak,Math.abs(v));sum+=v*v;if(first<0&&Math.abs(v)>1e-6)first=i;}return{peak,rms:Math.sqrt(sum/Math.max(1,to-from)),first};},
      diff(a,b){if(a.length!==b.length)throw Error('Different audio dimensions');let max=0,sum=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];max=Math.max(max,Math.abs(d));sum+=d*d;}return{max,rms:Math.sqrt(sum/a.length)};},
      projection(a,hz,rate=48000,from=0,to=a.length){let re=0,im=0;for(let i=from;i<to;i++){re+=a[i]*Math.cos(2*Math.PI*hz*i/rate);im+=a[i]*Math.sin(2*Math.PI*hz*i/rate);}return 2*Math.hypot(re,im)/Math.max(1,to-from);},
      signal(frames=24000,rate=48000){const l=new Float32Array(frames),r=new Float32Array(frames);for(let i=2400;i<Math.min(frames,12000);i++){const t=i/rate,envelope=Math.min(1,(i-2400)/128,(12000-i)/128);l[i]=.12*envelope*(Math.sin(2*Math.PI*137*t)+.4*Math.sin(2*Math.PI*1703*t));r[i]=.09*envelope*(Math.sin(2*Math.PI*241*t)-.3*Math.sin(2*Math.PI*2903*t));}return{left:l,right:r};},
      async decode(result){if(result?.blob)result=result.blob;if(result instanceof Blob){const ctx=new AudioContext({sampleRate:48000});try{const b=await ctx.decodeAudioData(await result.arrayBuffer());return{left:b.getChannelData(0).slice(),right:b.getChannelData(Math.min(1,b.numberOfChannels-1)).slice(),sampleRate:b.sampleRate};}finally{await ctx.close();}}if(result?.pcm){const l=new Float32Array(result.pcm.length/2),r=l.slice();for(let i=0;i<l.length;i++){l[i]=result.pcm[i*2];r[i]=result.pcm[i*2+1];}return{left:l,right:r,sampleRate:result.sampleRate};}if(result?.left)return result;throw Error('Unknown audio export');}
    };
  });
}
async function bridgeChecks(browser,url) {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(url+'/bridge.html');await page.waitForFunction(()=>!!window.KitchenVoiceEffects);await helpers(page);
    const report=await page.evaluate(async()=>{
      const q=voiceFxQA,K=KitchenVoiceEffects,rate=48000,result={};
      q.renderBank=async(slots,signals=[q.signal()],options={})=>{
        const frames=signals[0].left.length,ctx=new OfflineAudioContext(2,frames,rate);await K.prepare(ctx);
        const bank=K.createBank(ctx,ctx.destination,{voiceCount:signals.length,tempo:120});
        bank.setClock({tempo:120,beat:0,time:0,playing:true});
        signals.forEach((signal,index)=>{bank.setVoice(index,slots[index]||[null,null]);const b=ctx.createBuffer(2,frames,rate);b.getChannelData(0).set(signal.left);b.getChannelData(1).set(signal.right);const source=ctx.createBufferSource();source.buffer=b;source.connect(bank.input(index));source.start();});
        const rendered=await ctx.startRendering();const audio={left:rendered.getChannelData(0).slice(),right:rendered.getChannelData(1).slice()};bank.dispose();return audio;
      };
      const signal=q.signal(),empty=await q.renderBank([[null,null]],[signal]);result.empty=q.diff(empty.left,signal.left);
      const patches={prism:{low:-9,mid:6,high:-6},velvet:{model:'fet-76',threshold:-30,ratio:8,makeup:0,input:6,colour:.5},cinder:{drive:24,mix:1,output:-6},undertow:{mode:'flanger',delay:3,depth:2,rate:1,mix:1},parallax:{clock:'free',time:80,feedback:.4,mix:1},vestige:{predelay:12,mix:1,decay:1,size:.3},halo:{semitones:7,window:30,mix:1},tremor:{depth:.8,mix:1,pan:0},broiler:{model:'iron-800',drive:18,output:-12},glaze:{output:-6,mix:1},scales:{input:-9,tuner:'off'},strainer:{cutoff:500,mix:1},swirl:{mix:1},crumble:{bits:5,mix:1},saute:{model:'tube-610',drive:18,colour:1,mix:1}};
      result.effects=[];
      for(const def of LoomEffectsCatalog){const slot=q.fx(def.id,patches[def.id]);const actual=await q.renderBank([[slot,null]],[signal]);const reference={left:signal.left.slice(),right:signal.right.slice()},dsp=createLoomEffectsDSP().create(def.id,rate,slot.params);for(let at=0;at<reference.left.length;at+=128)dsp.process(reference.left.subarray(at,at+128),reference.right.subarray(at,at+128),{tempo:120,beat:at/rate*2,playing:true});result.effects.push({id:def.id,parity:q.diff(actual.left,reference.left),right:q.diff(actual.right,reference.right),changed:q.diff(actual.left,signal.left).rms,stats:q.stats(actual.left)});}
      const loud=q.fx('cinder',{drive:28,mix:1,output:-12}),filter=q.fx('prism',{filter:'lowpass',cutoff:600});const a=await q.renderBank([[loud,filter]],[signal]),b=await q.renderBank([[filter,loud]],[signal]);result.order=q.diff(a.left,b.left);
      const muted=q.fx('scales',{mute:'on',tuner:'off'}),other=q.signal();for(let i=0;i<other.left.length;i++){other.left[i]*=.4;other.right[i]*=.4;}const isolated=await q.renderBank([[muted,null],[null,null]],[signal,other]);result.isolation=q.diff(isolated.left,other.left);
      const delay=q.fx('parallax',{clock:'free',time:120,feedback:.6,damping:18000,spread:0,mix:1}),impulse={left:new Float32Array(48000),right:new Float32Array(48000)};impulse.left[2400]=.2;impulse.left[7200]=.1;impulse.right.set(impulse.left);const echoes=await q.renderBank([[delay,null]],[impulse]);result.delay={early:q.stats(echoes.left,0,8150),first:q.stats(echoes.left,8150,8250),later:q.stats(echoes.left,14000,30000),all:q.stats(echoes.left)};
      return result;
    });
    assert.equal(report.empty.max,0,'No-FX bank returns exact native input');assert.equal(report.effects.length,16);
    for(const effect of report.effects){assert(effect.stats.peak>1e-5,effect.id+' must render');assert(effect.changed>1e-6,effect.id+' fixture must audibly process');assert(effect.parity.max<2e-6&&effect.right.max<2e-6,effect.id+' Worklet must match canonical DSP '+JSON.stringify(effect));}
    assert(report.order.rms>1e-4,'Serial effect order changes actual audio');assert(report.isolation.max<2e-6,'One muted voice cannot affect another');assert(report.delay.early.peak<1e-6,'Delay cannot print audio before its due time');assert(report.delay.first.peak>.05&&report.delay.later.peak>.01,'Persistent rack retains both delayed hits and feedback tails');assert.deepEqual(errors,[]);
    passed.push('Shared OfflineAudioWorklet: all16canonical effects, serial order, stereo parity, zero-latency empty path, independent voices and persistent tails');console.log('PASS bridge '+JSON.stringify(report));
  }finally{await page.close();}
}
async function lifecycleChecks(browser,url){
  const page=await browser.newPage();
  try{await page.goto(url+'/bridge.html');await page.waitForFunction(()=>!!window.KitchenVoiceEffects);await helpers(page);
    const result=await page.evaluate(async()=>{const q=voiceFxQA,K=KitchenVoiceEffects,rate=48000,frames=38400;
      const signal=(hz,end=.65)=>{const left=new Float32Array(frames),right=new Float32Array(frames);for(let i=2400;i<Math.min(frames,Math.round(end*rate));i++)left[i]=right[i]=.08*Math.sin(2*Math.PI*hz*i/rate);return{left,right};};
      async function render(kind){const ctx=new OfflineAudioContext(2,frames,rate);await K.prepare(ctx);const bank=K.createBank(ctx,ctx.destination,{voiceCount:2,tempo:120});bank.setClock({tempo:120,beat:0,time:0,playing:true});const a=signal(137,kind==='reset'?.1:.65),b=signal(617),slots=kind==='clock'?[q.fx('tremor',{depth:1,pan:0,shape:'gate',duty:.5,smooth:0,division:'1/4',mix:1}),null]:kind==='reset'?[q.fx('parallax',{clock:'free',time:80,feedback:.8,damping:18000,spread:0,mix:1}),null]:[q.fx('scales',{tuner:'off'}),null];
        const releases=[];for(const[index,audio]of[a,b].entries()){const buffer=ctx.createBuffer(2,frames,rate);buffer.getChannelData(0).set(audio.left);buffer.getChannelData(1).set(audio.right);const source=ctx.createBufferSource();source.buffer=buffer;releases.push(bank.connectSource(index,source));source.start();}
        bank.setVoice(0,slots);if(kind==='clock')bank.setClock({tempo:120,beat:.75,time:.2,playing:true});if(kind==='reset'){bank.reset(0,.25);bank.reset(0,.4);}if(kind==='gate'){bank.setAudible(0,false);bank.setVoice(0,[null,null]);}
        const gated=bank.input(0)!==ctx.destination&&bank.input(1)===ctx.destination;const rendered=await ctx.startRendering(),actual=rendered.getChannelData(0).slice(),expected=a.left.slice(),other=a.right.slice();
        if(kind==='gate')expected.fill(0);else{const fx=createLoomEffectsDSP().create(slots[0].type,rate,slots[0].params);for(let at=0;at<frames;at+=128){if(kind==='reset'&&at===19200)fx.reset();const beat=kind==='clock'&&at>=9600?.75+(at-9600)/rate*2:at/rate*2;fx.process(expected.subarray(at,at+128),other.subarray(at,at+128),{tempo:120,beat,playing:true});}}
        for(let i=0;i<frames;i++)expected[i]+=b.left[i];const difference=q.diff(actual,expected);let firstDifference=-1;for(let i=0;i<frames;i++)if(Math.abs(actual[i]-expected[i])>1e-6){firstDifference=i;break;}const windows=[.1,.23,.35,.55].map(time=>{const start=Math.round(time*rate),end=start+480;return{time,actual:q.diff(actual.subarray(start,end),b.left.subarray(start,end)).rms,expected:q.diff(expected.subarray(start,end),b.left.subarray(start,end)).rms};});releases.forEach(release=>release());bank.dispose();return{difference,firstDifference,windows,gated,peak:q.stats(actual).peak};}
      return{clock:await render('clock'),reset:await render('reset'),gate:await render('gate')};});
    for(const[key,value]of Object.entries(result)){assert(value.peak>.01,key+' lifecycle signal audible');assert(value.difference.max<2e-6,key+' actual Worklet timing/gate differs from canonical '+JSON.stringify(value));assert(value.gated,key+' usedrack retains gate; neverusedrack exactdirect');}
    passed.push('Actual Worklet future clock anchors, superseded scheduled resets and emptied-muted rack gates match canonical processing');console.log('PASS lifecycle '+JSON.stringify(result));
  }finally{await page.close();}
}
async function prepareApp(page,id,url){await page.goto(url+'/'+id+'/index.html');await page.waitForFunction(name=>!!window[name]?.getProject&&!!window.MusicLabPatternInstrument?.renderPattern,facades[id],{timeout:60000});await helpers(page);await page.evaluate(({id,name})=>{const q=voiceFxQA;q.id=id;q.app=window[name];q.project=async()=>q.copy(await q.app.getProject());q.state=p=>p.state||p.project||p;q.voices=p=>{const s=q.state(p);return id==='form'?s.sounds:id==='batter'?s.lanes:s.tracks;};q.load=async p=>{await q.app.loadState(q.copy(p));await new Promise(r=>requestAnimationFrame(r));};q.quiet=p=>{const s=q.state(p);delete s.musicLabPattern;if(id==='grain'||id==='tine'){s.drive=s.space=s.swing=0;s.master=.7;s.bpm=120;s.tracks.forEach(t=>{t.mute=t.solo=false;if(id==='tine')t.variation=0;});}else if(id==='form'){s.bpm=120;s.swing=0;s.masterVolume=.7;s.muted=Array(8).fill(false);s.sounds.forEach(t=>{t.effects.reverb=t.effects.delay=0;});}else{s.tempo=120;s.humanize=s.velocityHumanize=s.swing=0;s.lanes.forEach(t=>{t.mute=t.solo=false;t.room=t.delay=0;t.lfo.enabled=false;});}q.voices(p).forEach(v=>v.galleyFx=[null,null]);return p;};q.packet=(voices=[0],beats=[.25])=>{const original=q.app.getSequencerPattern(),list=original.voices;return MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:'Voice FX native fixture',sourceApp:id,kind:'drums',tempo:120,swing:0,lengthBeats:2,meter:[4,4],voices:list,notes:beats.map((beat,index)=>({id:'voice-fx-'+index,voice:list[voices[index%voices.length]].id,pitch:list[voices[index%voices.length]].pitch??36+voices[index%voices.length],beat,duration:.25,velocity:.8,probability:1})),seed:1234567});};q.render=async(p,packet=q.packet(),tailSeconds=.4)=>q.decode(await MusicLabPatternInstrument.renderPattern({state:q.copy(p),pattern:packet,tempo:120,tailSeconds}));}, {id,name:facades[id]});}
async function projectChecks(browser,url,id){const page=await browser.newPage();try{await prepareApp(page,id,url);const result=await page.evaluate(async()=>{const q=voiceFxQA,base=q.quiet(await q.project());await q.load(base);const source=await q.project(),original=JSON.stringify(source),rows=[];for(const def of LoomEffectsCatalog){const p=q.copy(source);q.voices(p)[0].galleyFx=[q.fx(def.id),q.fx('prism',{high:-3})];await q.load(p);const restored=await q.project();rows.push({id:def.id,slots:q.copy(q.voices(restored)[0].galleyFx),other:q.copy(q.voices(restored)[1].galleyFx)});}await q.load(source);const before=JSON.stringify(await q.project()),bad=[];for(const value of [[null], [null,null,null], [{type:'unknown',params:{}},null], [{type:'prism',params:{...q.fx('prism').params,low:Infinity}},null], [{type:'prism',params:{...q.fx('prism').params,low:'2'}},null]]){const p=q.copy(source);q.voices(p)[0].galleyFx=value;let rejected=false;try{await q.load(p);}catch(_){rejected=true;}bad.push({rejected,unchanged:JSON.stringify(await q.project())===before});}await q.load(source);return{rows,bad,original,final:JSON.stringify(await q.project()),count:q.voices(source).length};});assert.equal(result.count,id==='batter'?12:8);for(const row of result.rows){assert.equal(row.slots.length,2);assert.equal(row.slots[0].type,row.id);assert.equal(row.slots[1].type,'prism');assert.deepEqual(row.other,[null,null]);}assert(result.bad.every(x=>x.rejected&&x.unchanged),id+' malformed racks must reject atomically '+JSON.stringify(result.bad));assert.equal(result.original,result.final);passed.push(id+' all16effects, two complete slots, voice isolation and atomic malformed project rejection');console.log('PASS projects '+id);}finally{await page.close();}}
async function audioChecks(browser,url,id){const page=await browser.newPage();try{await prepareApp(page,id,url);const result=await page.evaluate(async()=>{const q=voiceFxQA,base=q.quiet(await q.project());await q.load(base);const source=await q.project(),packet=q.packet(),dry=await q.render(source,packet),before=JSON.stringify(await q.project());const changed=q.copy(source);q.voices(changed)[0].galleyFx=[q.fx('prism',{filter:'lowpass',cutoff:250}),q.fx('cinder',{drive:20,mix:1,output:-6})];const wet=await q.render(changed,packet),other=q.copy(source);q.voices(other)[1].galleyFx=q.voices(changed)[0].galleyFx;const isolated=await q.render(other,packet);const bypass=q.copy(changed);q.voices(bypass)[0].galleyFx.forEach(slot=>slot.params.bypass=true);const by=await q.render(bypass,packet);const reversed=q.copy(changed);q.voices(reversed)[0].galleyFx.reverse();const reverse=await q.render(reversed,packet);const delay=q.copy(source);q.voices(delay)[0].galleyFx=[q.fx('parallax',{clock:'free',time:160,feedback:.6,damping:18000,spread:0,mix:1}),null];const delayed=await q.render(delay,packet,.8);const lastDry=q.stats(dry.left,Math.floor(.7*dry.sampleRate)),tail=q.stats(delayed.left,Math.floor(.7*delayed.sampleRate));const rmsDry=q.stats(dry.left).rms,rmsWet=q.stats(wet.left).rms;return{frames:dry.left.length,rate:dry.sampleRate,dry:q.stats(dry.left),wet:q.stats(wet.left),changed:q.diff(dry.left,wet.left),isolated:q.diff(dry.left,isolated.left),bypass:q.diff(dry.left,by.left),order:q.diff(wet.left,reverse.left),tail,lastDry,rmsDry,rmsWet,sourceUnchanged:before===JSON.stringify(await q.project())};});assert(result.dry.peak>.001&&result.wet.peak>.00001,id+' useful processed audio');assert(result.changed.rms>1e-5,id+' effects must alter actual native rendering');assert(result.isolated.max<=3/32768,id+' another voice rack must not affect this voice');assert(result.bypass.max<=3/32768,id+' bypass retains native signal');assert(result.order.rms>1e-5,id+' both serial slots and order must process');assert(result.tail.peak>1e-5,id+' delayed tail persists beyond source');assert(result.sourceUnchanged,id+' offline rendering must not mutate current project');passed.push(id+' actual native offline rendering, two-slot order, bypass, voice isolation, tails and immutable snapshots');console.log('PASS audio '+id+' '+JSON.stringify(result));}finally{await page.close();}}
async function explicitNoteChecks(browser,url,id){
  if(id!=='tine')return;
  const page=await browser.newPage();
  try{
    await prepareApp(page,id,url);
    const result=await page.evaluate(async()=>{
      const q=voiceFxQA,base=q.quiet(await q.project()),rows=[];
      const events=[{voice:0,at:.125,velocity:.8,pitch:0,source:'qa-explicit',voiceKey:'voice-0'}],options={durationSeconds:.5,tailSeconds:.3,nativeHits:true};
      let normal=null;
      for(const mode of['normal','mute','other-solo']){
        const p=q.copy(base),s=q.state(p);s.tracks[0].mute=mode==='mute';s.tracks[1].solo=mode==='other-solo';
        const dry=await q.decode(await q.app.engine.renderNativeEvents(q.copy(s),events,options));
        s.tracks[0].galleyFx=[q.fx('prism',{filter:'lowpass',cutoff:600}),null];
        const wet=await q.decode(await q.app.engine.renderNativeEvents(q.copy(s),events,options));
        if(!normal)normal=wet;
        rows.push({mode,dry:q.stats(dry.left),wet:q.stats(wet.left),sameAsNormal:q.diff(wet.left,normal.left)});
      }
      const p=q.copy(base),s=q.state(p);s.tracks.forEach(v=>v.steps=v.steps.map(()=>0));s.tracks[0].steps[0]=1;s.tracks[0].mute=true;s.tracks[0].galleyFx=[q.fx('prism',{filter:'lowpass',cutoff:600}),null];
      const native=await q.decode(await q.app.engine.exportWav(s,{bars:1,tailSeconds:.2}));
      await q.load(p);const e=q.app.engine;await e.init();await e.setVoiceEffects(s.tracks,s.bpm);
      const analyser=e.context.createAnalyser();analyser.fftSize=2048;e.graph.master.connect(analyser);
      e.scheduleNativeNote(s.tracks[0],e.context.currentTime+.03,{voiceKey:'voice-0',voiceIndex:0,velocity:.8,source:'qa-explicit',beat:0,tempo:120});
      const until=e.context.currentTime+.16;while(e.context.currentTime<until)await new Promise(resolve=>setTimeout(resolve,10));
      const live=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(live);e.stop();analyser.disconnect();
      return{rows,native:q.stats(native.left),live:q.stats(live)};
    });
    console.log('DETAIL explicit tine '+JSON.stringify(result));
    for(const row of result.rows){assert(row.dry.peak>.001,'explicit '+row.mode+' legacy note audible');assert(row.wet.peak>.001,'explicit '+row.mode+' occupied rack audible');assert(row.sameAsNormal.max<=3/32768,'explicit '+row.mode+' PCM agrees within WAV quantization after native sequencer mute/solo');}
    assert.equal(result.native.peak,0,'native sequencer still respects its muted voice');assert(result.live.peak>.001,'direct host scheduled note opens the requested muted voice rack');
    passed.push('CLATTER explicit native/host events retain mute/solo audibility while native sequencer remains muted');console.log('PASS explicit tine '+JSON.stringify(result));
  }finally{await page.close();}
}
async function exportChecks(browser,url,id){const page=await browser.newPage();try{await prepareApp(page,id,url);const report=await page.evaluate(async()=>{const q=voiceFxQA,p=q.quiet(await q.project()),scope=q.id==='form'?'voice':q.id==='batter'?'lane':'hit';await q.load(p);const dry=await q.decode(await q.app.exportAudio({scope,voice:0,laneId:'kick',bars:1,tailSeconds:.2}));const raw=q.id==='batter'?await q.decode(await q.app.exportAudio({scope:'source',laneId:'kick'})):null;const muted=q.copy(await q.project());q.voices(muted)[0].galleyFx=[q.fx('scales',{mute:'on',tuner:'off'}),null];await q.load(muted);const wet=await q.decode(await q.app.exportAudio({scope,voice:0,laneId:'kick',bars:1,tailSeconds:.2}));const after=q.id==='batter'?await q.decode(await q.app.exportAudio({scope:'source',laneId:'kick'})):null;return{dry:q.stats(dry.left),wet:q.stats(wet.left),dryFrames:dry.left.length,wetFrames:wet.left.length,raw:raw?q.diff(raw.left,after.left):null};});assert(report.dry.peak>.001,id+' native selected-voice WAV fixture audible');assert(report.wet.peak<1e-4,id+' selected-voice WAV/shared Samples export must includeSCALES mute '+JSON.stringify(report));if(report.raw)assert.equal(report.raw.max,0,'BATTER SourceA remains raw whenlaneFXmute');passed.push(id+' actual one-shot/selected-voice WAV and shared Samples facade includes FX'+(id==='batter'?', raw SourceA unchanged':''));console.log('PASS exports '+id+' '+JSON.stringify(report));}finally{await page.close();}}
async function liveChecks(browser,url,id){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await prepareApp(page,id,url);
    await page.evaluate(async()=>{const q=voiceFxQA,p=q.quiet(await q.project()),v=q.voices(p)[0];
      if(q.id==='grain'){v.mode='bass';v.level=.4;Object.assign(v.synth.body,{level:1,frequency:220,pitchAmount:0,attack:.001,hold:.3,decay:2,curve:'linear'});v.synth.noise.level=0;v.synth.mod.target='off';}
      else if(q.id==='tine'){Object.assign(v,{model:'bowl',decay:4,pitchHz:220,noise:0,mallet:1,level:.4,variation:0,damping:.2});}
      else if(q.id==='form'){delete v.architecture;v.type='perc';Object.assign(v.tone,{frequency:220,pitchAmount:0,attack:1,decay:2000,release:1000});v.noise.level=0;v.effects.reverb=v.effects.delay=v.effects.drive=0;v.mix.volume=.4;}
      await q.load(p);
      if(q.id==='batter'){const pcm=new Float32Array(48000*3*2);for(let i=0;i<pcm.length/2;i++)pcm[i*2]=pcm[i*2+1]=.15*Math.sin(2*Math.PI*220*i/48000);await q.app.importAudio({pcm,sampleRate:48000,name:'Long voice FX fixture',options:{target:'kick',replace:true}});}
    });
    const audition=id==='form'?'.burner-panel .burner-actions button:first-child':id==='batter'?'#auditionButton':'#audition-button';
    await page.locator(audition).first().click();
    await page.waitForFunction(()=>{const e=voiceFxQA.app.engine;return e.context?.state==='running'&&!!(e.graph?.input||e.graph?.master||e.master);});
    await page.evaluate(()=>{const q=voiceFxQA,e=q.app.engine,ctx=e.context;const analyser=q.liveAnalyser=ctx.createAnalyser();analyser.fftSize=2048;(e.graph?.input||e.graph?.master||e.master).connect(analyser);q.liveSignal=()=>{const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);return q.stats(data);};});
    const wait=async seconds=>{const until=await page.evaluate(seconds=>voiceFxQA.app.engine.context.currentTime+seconds,seconds);await page.waitForFunction(until=>voiceFxQA.app.engine.context.currentTime>=until,until,{timeout:45000});};
    await wait(.12);const before=await page.evaluate(()=>voiceFxQA.liveSignal());
    await page.locator('[data-voice-fx-slot="0"]').click();await page.locator('[data-voice-fx-type]').selectOption('scales');await page.locator('.voice-fx-dialog details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
    await page.locator('[data-voice-fx-param="mute"]').selectOption('on');await wait(.14);const muted=await page.evaluate(()=>voiceFxQA.liveSignal());
    await page.locator('[data-voice-fx-param="mute"]').selectOption('off');await wait(.1);const restored=await page.evaluate(()=>voiceFxQA.liveSignal());
    await page.locator('[data-voice-fx-number="output"]').fill('-12');await page.locator('[data-voice-fx-number="output"]').press('Tab');await wait(.1);const trimmed=await page.evaluate(()=>voiceFxQA.liveSignal());const meterText=await page.locator('[data-voice-fx-meter]').innerText();assert(!meterText.includes('Play this voice')&&/dB|Hz|cents/.test(meterText),id+' live SCALES meter/tuner feedback '+meterText);
    await page.keyboard.press('Escape');
    assert(before.rms>.001,id+' long-note fixture must be audible '+JSON.stringify(before));
    assert(muted.rms<before.rms*.02,id+' first FX added to an already ringing dry voice must process it immediately '+JSON.stringify({before,muted}));
    assert(restored.rms>before.rms*.03,id+' changing parameters must restore the same ringing source '+JSON.stringify({before,restored}));
    assert(trimmed.rms<restored.rms*.5,id+' subsequent trim must affect the active source '+JSON.stringify({restored,trimmed}));
    await page.evaluate(audition=>{voiceFxQA.app.stop();document.querySelector(audition).click();},audition);await wait(.15);const fresh=await page.evaluate(()=>voiceFxQA.liveSignal());
    assert(fresh.rms>.0001,id+' Stop followed by immediate preview must not be cut by a stale deferred reset '+JSON.stringify(fresh));
    await page.evaluate(()=>voiceFxQA.app.stop());await wait(.15);const stopped=await page.evaluate(()=>voiceFxQA.liveSignal());assert(stopped.rms<before.rms*.002,id+' Stop must silence voice FX after its release '+JSON.stringify(stopped));
    assert.deepEqual(errors,[]);passed.push(id+' first effect over a ringing dry voice, live parameters, Stop and immediate preview');console.log('PASS live '+id+' '+JSON.stringify({before,muted,restored,trimmed,fresh,stopped}));
  }finally{await page.close();}
}
async function transportChecks(browser,url,id){
  const page=await browser.newPage();
  try{
    await prepareApp(page,id,url);
    const report=await page.evaluate(async()=>{
      const q=voiceFxQA,p=q.quiet(await q.project()),v=q.voices(p)[0];
      if(q.id==='grain'){v.mode='bass';v.level=.4;Object.assign(v.synth.body,{level:1,frequency:220,pitchAmount:0,attack:.001,hold:.3,decay:2,curve:'linear'});v.synth.noise.level=0;v.synth.mod.target='off';}
      else if(q.id==='tine'){Object.assign(v,{model:'bowl',decay:4,pitchHz:220,noise:0,mallet:1,level:.4,variation:0,damping:.2});}
      else if(q.id==='form'){delete v.architecture;v.type='perc';Object.assign(v.tone,{frequency:220,pitchAmount:0,attack:1,decay:2000,release:1000});v.noise.level=0;v.effects.reverb=v.effects.delay=v.effects.drive=0;v.mix.volume=.4;}
      v.galleyFx=[q.fx('parallax',{clock:'free',time:80,feedback:.75,damping:18000,spread:0,mix:1}),null];await q.load(p);
      if(q.id==='batter'){const pcm=new Float32Array(48000*3*2);for(let i=0;i<pcm.length/2;i++)pcm[i*2]=pcm[i*2+1]=.15*Math.sin(2*Math.PI*220*i/48000);await q.app.importAudio({pcm,sampleRate:48000,name:'Long transport FX fixture',options:{target:'kick',replace:true}});}
      const a=MusicLabPatternInstrument;await a.prepare();const e=q.app.engine,ctx=e.context,analyser=ctx.createAnalyser();analyser.fftSize=2048;(e.graph?.input||e.graph?.master||e.master).connect(analyser);
      const read=()=>{const pcm=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(pcm);return q.stats(pcm);},wait=async seconds=>{const until=ctx.currentTime+seconds;while(ctx.currentTime<until)await new Promise(resolve=>setTimeout(resolve,10));},voice=a.notes.voices[0],rows=[];
      for(const [index,mode]of['stop','seek'].entries()){
        q.app.stop();await a.prepare();a.transport({tempo:120,beat:0,when:ctx.currentTime,playing:true,revision:index*3});a.scheduleNote({id:'transport-tail-'+index,voice:voice.id,pitch:voice.pitch??36,velocity:.8,when:ctx.currentTime+.02,beat:0,tempo:120,durationSeconds:.1,source:'qa-transport'});await wait(.35);const before=read();a.cancelNotes({source:'qa-transport'});a.transport({tempo:120,beat:mode==='seek'?4:0,when:ctx.currentTime,playing:mode==='seek',revision:index*3+1});await wait(.08);let after={peak:0,rms:0,first:-1};for(let sample=0;sample<15;sample++){const current=read();if(current.rms>after.rms)after=current;await wait(.02);}rows.push({mode,before,after});
      }
      a.panic();await wait(.1);const panic=read();analyser.disconnect();return{rows,panic};
    });
    console.log('DETAIL transport '+id+' '+JSON.stringify(report));
    for(const row of report.rows){assert(row.before.rms>1e-5,id+' delay tail audible before '+row.mode);assert(row.after.rms<1e-6,id+' hosted '+row.mode+' clears old rack histories '+JSON.stringify(row));}assert(report.panic.rms<1e-6,id+' panic clears hosted FX');
    passed.push(id+' actual shared host adapter Stop/seek/panic clear delay histories');console.log('PASS transport '+id);
  }finally{await page.close();}
}
async function uiChecks(browser,url,id){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await prepareApp(page,id,url);await page.waitForSelector('[data-voice-fx-slot]');assert.equal(await page.locator('[data-voice-fx-slot]').count(),2,id+' compact two slots');
    const untouchedVoice=await page.evaluate(async()=>voiceFxQA.copy(voiceFxQA.voices(await voiceFxQA.project())[1]));
    const slots=()=>page.evaluate(async()=>voiceFxQA.copy(voiceFxQA.voices(await voiceFxQA.project())[0].galleyFx));const waitSlots=async predicate=>{for(let i=0;i<150;i++){if(predicate(await slots()))return;await page.waitForTimeout(20);}throw Error(id+' slot state did not settle');};
    const open=async index=>{if(await page.locator('.voice-fx-dialog[open]').count())await page.locator('[data-voice-fx-action="close"]').click();await page.locator('[data-voice-fx-slot="'+index+'"]').click();await page.waitForSelector('.voice-fx-dialog[open]');};
    const setNumber=async(key,value)=>{await page.locator('.voice-fx-dialog details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));const input=page.locator('[data-voice-fx-number="'+key+'"]');await input.fill(String(value));await input.press('Tab');};
    await open(0);await page.locator('[data-voice-fx-type]').selectOption('prism');await setNumber('low',6);assert.equal((await slots())[0].params.low,6);
    await page.keyboard.press('Control+z');await waitSlots(s=>s[0]?.params.low===0);assert.equal((await slots())[0].type,'prism',id+' one Undo restores one parameter change');
    await open(0);await setNumber('low',6);await page.locator('[data-voice-fx-action="bypass"]').click();assert.equal((await slots())[0].params.bypass,true);await page.locator('[data-voice-fx-action="bypass"]').click();
    await page.locator('[data-voice-fx-action="reset"]').click();assert.equal((await slots())[0].params.low,0);await page.keyboard.press('Control+z');await waitSlots(s=>s[0]?.params.low===6);
    await open(0);await page.locator('[data-voice-fx-action="remove"]').click();assert.equal((await slots())[0],null);await page.keyboard.press('Control+z');await waitSlots(s=>s[0]?.type==='prism');
    await open(1);await page.locator('[data-voice-fx-type]').selectOption('saute');await page.locator('[data-voice-fx-param="model"]').selectOption('tube-610');assert.equal((await slots())[1].params.model,'tube-610');
    const recipe=await page.locator('[data-voice-fx-preset] option').nth(1).getAttribute('value');await page.locator('[data-voice-fx-preset]').selectOption(recipe);const expected=await page.evaluate(recipe=>LoomEffectsCatalog.find(e=>e.id==='saute').presets.find(p=>p.id===recipe).params,recipe);assert.deepEqual((await slots())[1].params,expected,id+' recipe replaces every parameter');await setNumber('drive',expected.drive+1);assert.equal(await page.locator('[data-voice-fx-preset]').inputValue(),'');await page.locator('[data-voice-fx-preset]').selectOption(recipe);assert.deepEqual((await slots())[1].params,expected,id+' same recipe reload after manual edit');
    const beforeSwap=await slots();await page.locator('[data-voice-fx-action="swap"]').click();const afterSwap=await slots();assert.deepEqual(afterSwap.map(s=>s?.type||null),['saute','prism'],id+' slot swap '+JSON.stringify({beforeSwap,afterSwap}));const other=await page.evaluate(async()=>voiceFxQA.voices(await voiceFxQA.project())[1].galleyFx);assert.deepEqual(other,[null,null]);await page.keyboard.press('Escape');
    for(const width of[320,390,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(layout.scroll<=width+1,id+' page overflows at'+width+':'+JSON.stringify(layout));await open(0);await page.screenshot({path:path.join(artifacts,id+'-voice-fx-'+width+'.png')});await page.keyboard.press('Escape');}
    await page.waitForTimeout(400);const expectedRecovery=await slots();await prepareApp(page,id,url);assert.deepEqual(await slots(),expectedRecovery,id+' both voice slots survive actual native recovery reload');assert.deepEqual(await page.evaluate(async()=>voiceFxQA.copy(voiceFxQA.voices(await voiceFxQA.project())[1])),untouchedVoice,id+' recovery retains untouched voice');
    assert.deepEqual(errors,[]);passed.push(id+' two-slot editor, real Undo/bypass/reset/remove/swap/model/preset controls, native recovery and phone/desktop layouts');console.log('PASS ui '+id);
  }finally{await page.close();}
}
async function hostChecks(browser,url,id){const page=await browser.newPage();try{await page.goto(url+'/host.html');await page.waitForFunction(()=>!!window.LoomNoteRenderer&&!!window.LoomInstrumentHost);await helpers(page);const result=await page.evaluate(async({id,facade})=>{const q=voiceFxQA,context=new AudioContext({sampleRate:48000});await context.resume();const output=context.createGain();output.gain.value=0;output.connect(context.destination);const host=new LoomInstrumentHost({context,getTrackInput:()=>output,baseURL:location.origin+'/'}),renderer=new LoomNoteRenderer({context,baseURL:location.origin+'/'});try{await host.load('fx-native',{id},document.querySelector('iframe'));const child=document.querySelector('iframe').contentWindow,app=child[facade],p=q.copy(await app.getProject()),s=p.state||p.project||p,voices=id==='form'?s.sounds:id==='batter'?s.lanes:s.tracks;voices.forEach(v=>v.galleyFx=[null,null]);if(id==='grain'||id==='tine'){s.drive=s.space=s.swing=0;s.master=.5;s.bpm=120;if(id==='tine')s.tracks.forEach(v=>v.variation=0);}else if(id==='form'){s.bpm=120;s.swing=0;s.sounds.forEach(v=>v.effects.reverb=v.effects.delay=0);}else{s.tempo=120;s.humanize=s.velocityHumanize=0;s.lanes.forEach(v=>{v.room=v.delay=0;v.lfo.enabled=false;});}voices[0].galleyFx=[q.fx('prism',{filter:'lowpass',cutoff:300}),q.fx('saute',{model:'tube-610',drive:18,colour:1})];await app.loadState(p);const snapshot=await host.snapshot('fx-native'),original=JSON.stringify(snapshot.state),nativePacket=await host.exportPattern('fx-native'),voice=nativePacket.voices[0],packet=MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:'Hosted voice FX',sourceApp:id,kind:'drums',tempo:120,swing:0,lengthBeats:2,meter:[4,4],voices:nativePacket.voices,notes:[{id:'fx-hit',voice:voice.id,pitch:voice.pitch??36,beat:.5,duration:.25,velocity:.8,probability:1}],seed:1234567});const state=LoomSchema.defaultState();state.tempo=120;state.lengthBars=2;state.loopEnabled=false;state.tracks[0].instrument={id,snapshot};state.tracks[0].clips=[{id:'fx-native-clip',type:'notes',name:'FX source',pattern:packet,voiceMap:Object.fromEntries(packet.voices.map(v=>[v.id,v.id])),start:1,length:2,sourceOffset:0,rate:1,loop:false,gain:1,fadeIn:0,fadeOut:0,transpose:0}];const before=JSON.stringify(state),printed=await renderer.print(state,'track-1','fx-native-clip');const dry=q.copy(state),dryVoices=id==='form'?dry.tracks[0].instrument.snapshot.state.sounds:id==='batter'?(dry.tracks[0].instrument.snapshot.state.state||dry.tracks[0].instrument.snapshot.state).lanes:(dry.tracks[0].instrument.snapshot.state.state||dry.tracks[0].instrument.snapshot.state).tracks;dryVoices[0].galleyFx=[null,null];const unprocessed=await renderer.print(dry,'track-1','fx-native-clip');const current=await host.snapshot('fx-native');return{different:q.diff(printed.audio.left,unprocessed.audio.left),wet:q.stats(printed.audio.left),origin:JSON.stringify(printed.origin.instrument.snapshot.state)===original,unchanged:before===JSON.stringify(state)&&JSON.stringify(current.state)===original,frames:document.querySelectorAll('iframe').length,registry:Object.values(window.__LoomHostRegistry).filter(r=>r.active).length};}finally{await renderer.dispose();host.dispose();output.disconnect();await context.close();}}, {id,facade:facades[id]});assert(result.wet.peak>.0001&&result.different.rms>1e-5,id+' GALLEY private native Print must include voice FX');assert(result.origin&&result.unchanged,id+' source patch and complete FX snapshot preserved');assert.equal(result.frames,1);assert.equal(result.registry,1);passed.push(id+' actual GALLEY host snapshot, private wet native Print and source preservation');console.log('PASS host '+id+' '+JSON.stringify(result));}finally{await page.close();}}
(async()=>{fs.mkdirSync(artifacts,{recursive:true});const server=await serve(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{for(const phase of(process.env.PERCUSSION_VOICE_FX_PHASES||'bridge,lifecycle,projects,audio,explicit,exports,live,transport,ui,host').split(',')){if(phase==='bridge')await bridgeChecks(browser,server.url);else if(phase==='lifecycle')await lifecycleChecks(browser,server.url);else for(const id of apps){if(phase==='projects')await projectChecks(browser,server.url,id);else if(phase==='audio')await audioChecks(browser,server.url,id);else if(phase==='explicit')await explicitNoteChecks(browser,server.url,id);else if(phase==='exports')await exportChecks(browser,server.url,id);else if(phase==='live')await liveChecks(browser,server.url,id);else if(phase==='transport')await transportChecks(browser,server.url,id);else if(phase==='ui')await uiChecks(browser,server.url,id);else if(phase==='host')await hostChecks(browser,server.url,id);else throw Error('Unknown phase '+phase);}}console.log(JSON.stringify({passed,artifacts},null,2));}finally{await browser.close();await server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
