'use strict';
/* GALLEY track freeze: actual browser workflow, serialized audio paths and host
 * lifecycle. No production source is patched. FREEZE_QA_BUILT=1 requires the
 * shipped standalone; the default maintained preview supports early UI work.
 * One Chromium only; coordinate its window on the two-CPU development host.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const installed='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||(fs.existsSync(installed)?installed:'playwright'));
const appRoot=__dirname,root=path.dirname(appRoot);
const shared=fs.existsSync(path.join(appRoot,'shared/pattern-schema.js'))?path.join(appRoot,'shared'):path.join(root,'shared');
const artifacts=process.env.FREEZE_QA_ARTIFACTS||'/tmp/galley-freeze-browser-qa';
const passed=[],errors=[],external=[],evidence={};
let server,browser,servedHTML,activeCheck='startup';
fs.mkdirSync(artifacts,{recursive:true});
function preview(){
  if(process.env.FREEZE_QA_FILE)return fs.readFileSync(process.env.FREEZE_QA_FILE);
  if(process.env.FREEZE_QA_BUILT)return fs.readFileSync(path.join(appRoot,'index.html'));
  const code=String.raw`from pathlib import Path
import ast,base64,json,re,runpy,sys
p=Path(sys.argv[1]);shared=Path(sys.argv[2]);source=(p/'build.py').read_text();tree=ast.parse(source)
names=next(ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCRIPTS' for t in node.targets))
css='\n'.join((p/name).read_text() for name in dict.fromkeys(re.findall(r"ROOT / '([^']+\.css)'",source)))
fonts=[]
for family,weight,style,name in [('Loom Sans',400,'normal','noto-sans-regular.woff2'),('Loom Sans',700,'normal','noto-sans-bold.woff2'),('Loom Serif',400,'normal','noto-serif-regular.woff2'),('Loom Serif',400,'italic','noto-serif-italic.woff2')]:
 data=base64.b64encode((p/'fonts'/name).read_bytes()).decode();fonts.append('@font-face{font-family:'+repr(family)+';font-style:'+style+';font-weight:'+str(weight)+';src:url(data:font/woff2;base64,'+data+") format('woff2')}")
css=css.replace('/* FONT_FACES */','\n'.join(fonts))
embedded={}
for app in ['brine','heirloom']:
 candidates=[p/'instruments'/(app+'.html'),p.parent/app/'index.html']
 actual=next((f for f in candidates if f.is_file()),None)
 if actual:embedded[app]=actual.read_text()
def value(v):return json.dumps(v,ensure_ascii=True,separators=(',',':')).replace('<','\\u003c')
js='window.LoomEmbeddedInstruments='+value(embedded)+';window.LoomDemoAssets={};window.LoomDemoTemplate=null;\n'+'\n'.join((p/name).read_text() for name in names)
html=(p/'app.html').read_text().replace('<!-- STYLES -->','<style>'+css+'</style>').replace('<!-- SCRIPTS -->','<script>'+js.replace('</script','<\\/script')+'</script>')
helpers=runpy.run_path(str(shared/'bundle_audio_exchange.py'));sys.stdout.write(helpers['embed_exchange'](html,'loom',p))`;
  return execFileSync('python3',['-c',code,appRoot,shared],{maxBuffer:24*1024*1024});
}
async function serve(){
  servedHTML=preview();
  server=http.createServer((request,response)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
    response.setHeader('Cache-Control','no-store');
    if(pathname==='/loom/'||pathname==='/loom/index.html'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(servedHTML);return;}
    if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
    const base=pathname.startsWith('/shared/')?shared:root,relative=pathname.startsWith('/shared/')?pathname.slice(7):pathname,file=path.resolve(base,'.'+relative);
    if(!file.startsWith(base+path.sep)){response.writeHead(403);response.end();return;}
    fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){response.writeHead(404);response.end('Missing fixture');return;}response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(response);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port+'/loom/index.html';
}
function save(){fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({passed,evidence,errors,external,release:{built:!!process.env.FREEZE_QA_BUILT,htmlSha256:servedHTML?createHash('sha256').update(servedHTML).digest('hex'):null}},null,2)+'\n');}
async function check(name,run){if(process.env.FREEZE_QA_FILTER&&!new RegExp(process.env.FREEZE_QA_FILTER).test(name))return;activeCheck=name;const began=Date.now(),value=await run();passed.push({name,milliseconds:Date.now()-began,evidence:value});save();console.log('PASS '+name+(value===undefined?'':' '+JSON.stringify(value)));}
async function contextFor(url,{fallback=false}={}){
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),origin=new URL(url).origin;
  await context.route('**/*',route=>{const address=route.request().url();if(/^(data:|blob:|about:)/.test(address)||new URL(address).origin===origin)return route.continue();external.push(address);return route.abort();});
  context.on('page',page=>page.on('pageerror',error=>errors.push({check:activeCheck,url:page.url(),message:error.message,stack:error.stack?.split('\n').slice(0,7).join('\n')})));
  if(fallback)await context.addInitScript(()=>Object.defineProperty(window,'AudioWorkletNode',{value:undefined,configurable:true}));
  return context;
}
async function pageFor(context,url){
  const page=await context.newPage();await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>window.LoomApp&&window.LoomSchema&&typeof LoomApp.freezeTrack==='function'&&typeof LoomApp.unfreezeTrack==='function',null,{timeout:30000});
  await helpers(page);return page;
}
async function helpers(page){
  await page.evaluate(()=>{
    const copy=value=>JSON.parse(JSON.stringify(value));
    window.freezeQA={
      copy,
      status(){const value=LoomApp.freezeStatus;return typeof value==='function'?value.call(LoomApp):value;},
      fx(type,params={}){const definition=LoomEffectsCatalog.find(effect=>effect.id===type);if(!definition)throw Error('Missing fixture effect '+type);return LoomSchema.effect({type,params:{...definition.defaults,...params}});},
      route(ownerId,target,amount=.05,effectType){return{id:(ownerId+'-'+target).replace(/[^a-zA-Z0-9_-]/g,'-'),ownerId,target,enabled:true,amount,...(effectType?{effectType}:{})};},
      blank(){const state=LoomSchema.defaultState();state.name='Freeze browser arrangement';state.tempo=240;state.lengthBars=1;state.loopEnabled=false;state.loopStart=0;state.loopEnd=4;state.recording.countInBars=0;state.recording.punchEnd=4;state.master.level=.73;state.master.effects.fill(null);state.returns.forEach(owner=>{owner.effects.fill(null);owner.level=.65;owner.pan=0;});state.tracks.forEach(track=>{track.instrumentLive=false;track.effects.fill(null);track.automation=[];track.level=.7;track.pan=0;});return state;},
      fixture(){
        const state=this.blank();
        for(const [index,frequency]of[[0,137],[1,383]]){
          const rate=48000,frames=12000,left=Float32Array.from({length:frames},(_,i)=>.055*Math.sin(2*Math.PI*frequency*i/rate)+.012*Math.sin(2*Math.PI*1703*i/rate)),right=Float32Array.from({length:frames},(_,i)=>.046*Math.sin(2*Math.PI*(frequency+40)*i/rate)+.009*Math.cos(2*Math.PI*1327*i/rate));
          const asset=LoomSchema.encodeAsset({id:'freeze-source-'+index,name:'Stereo source '+index,left,right,sampleRate:rate});state.assets.push(asset);state.tracks[index].clips=[{id:'freeze-clip-'+index,name:'Original stereo '+index,assetId:asset.id,start:0,length:4,sourceStart:0,sourceEnd:frames/rate,sourceOffset:0,rate:1,reverse:false,loop:true,gain:.8,fadeIn:.002,fadeOut:.004}];
        }
        const t=state.tracks[0];t.effects[0]=this.fx('prism',{filter:'lowpass',cutoff:1700,resonance:.2,mix:.8});t.effects[1]=this.fx('cinder',{shape:'diode',drive:7,tone:9000,output:-7,mix:.4});t.effects[4]=this.fx('preserve',{drive:4,warmth:.3,hiss:0,mix:.45});t.eq={...LoomSchema.defaultTrackEq(),low:2,lowMid:-1.5,highMid:1,high:-.5,lowMidFreq:650,highMidFreq:3400};t.sends=[.4,.3];t.sendPre=[true,false];
        t.automation=[{target:'level',enabled:true,interpolation:'linear',points:[{beat:0,value:.4},{beat:4,value:.9}]},{target:'pan',enabled:true,interpolation:'linear',points:[{beat:0,value:-.35},{beat:4,value:.4}]},{target:'send:0',enabled:true,interpolation:'linear',points:[{beat:0,value:.15},{beat:4,value:.6}]},{target:'send:1',enabled:true,interpolation:'hold',points:[{beat:0,value:.25},{beat:2,value:.45}]},{target:'fx:0:cutoff',effectType:'prism',enabled:true,interpolation:'linear',points:[{beat:0,value:800},{beat:4,value:4000}]},{target:'eq:lowMidFreq',enabled:true,interpolation:'linear',points:[{beat:0,value:250},{beat:4,value:1200}]}];
        state.returns[0].effects[0]=this.fx('cinder',{shape:'soft',drive:4,output:-3,mix:.4});state.returns[1].effects[0]=this.fx('parallax',{clock:'free',time:80,feedback:.3,spread:.35,mix:1});state.master.effects[0]=this.fx('prism',{filter:'highpass',cutoff:45,mix:.3});
        Object.assign(state.lfos[0],{enabled:true,wave:'triangle',sync:false,rate:1.3,depth:.2,offset:0,routes:[this.route('track-1','fx:0:cutoff',.04,'prism'),this.route('track-2','pan',.08),this.route('lfo-2','depth',.08)]});Object.assign(state.lfos[1],{enabled:true,wave:'sine',sync:true,division:2,depth:.2,routes:[this.route('track-1','eq:high',.025),this.route('track-1','send:1',.04),this.route('lfo-1','rate',.025)]});
        return LoomSchema.normalize(state);
      },
      trackSource(track){const value=copy(track);delete value.freeze;return value;},
      directNative(record,source,snapshot,packet){const child=record.iframe.contentWindow,P=child.createBrinePlaybackDSP(child.createBrineDSP),raw=snapshot.state||snapshot,state=child.BrineSchema.normalize({...raw,tempo:240,pattern:packet}),core=new P.Core(48000,state),frames=source.left.length,left=new Float32Array(frames),right=new Float32Array(frames),noteFrames=[{id:'manual-low',pitch:48,frame:3000,durationFrames:9000,velocity:.48},{id:'manual-high',pitch:67,frame:24000,durationFrames:6000,velocity:.4}];for(const note of noteFrames)core.enqueue('on',{...note,source:'direct',channel:0});core.enqueue('cancel',{source:'direct',frame:48000});for(let at=0;at<frames;at+=128)core.process(left.subarray(at,Math.min(frames,at+128)),right.subarray(at,Math.min(frames,at+128)));const result={frames,noteFrames,left:this.difference(left,source.left.subarray(0,frames)),right:this.difference(right,source.right.subarray(0,frames))};core.dispose();return result;},
      core(state,{frames=55296,block=128,startBeat=0,rate=48000,assets}={}){const core=new(createLoomEngineDSP(createLoomEffectsDSP,createLoomLFODSP,createLoomCPUProfiler,createLoomTrackEQDSP).Core)(state,assets||LoomSchema.decodeAssets(state.assets,state.freezeAssets),rate,{linear:true});const left=new Float32Array(frames),right=new Float32Array(frames);core.start(startBeat);for(let at=0;at<frames;at+=block)core.processBlock(left.subarray(at,Math.min(frames,at+block)),right.subarray(at,Math.min(frames,at+block)));return{core,left,right};},
      difference(a,b){if(a.length!==b.length)throw Error('Different audio lengths');let max=0,sum=0,maxIndex=0,firstDifferent=-1,lastDifferent=-1;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))throw Error('Non-finite audio');const delta=a[i]-b[i];if(Math.abs(delta)>max){max=Math.abs(delta);maxIndex=i;}if(Math.abs(delta)>1e-10){if(firstDifferent<0)firstDifferent=i;lastDifferent=i;}sum+=delta*delta;}return{max,rms:Math.sqrt(sum/Math.max(1,a.length)),maxIndex,firstDifferent,lastDifferent};},
      stats(channels){let max=0,sum=0,count=0;for(const a of channels)for(const x of a){if(!Number.isFinite(x))throw Error('Non-finite audio');max=Math.max(max,Math.abs(x));sum+=x*x;count++;}return{peak:max,rms:Math.sqrt(sum/Math.max(1,count))};},
      async wav(state,options={}){const blob=await LoomApp.engine.renderWav(state,LoomSchema.decodeAssets(state.assets,state.freezeAssets),{snapshotReady:true,startBeat:0,endBeat:4,tailSeconds:.15,...options}),buffer=await blob.arrayBuffer(),view=new DataView(buffer);if(view.getUint32(24,true)!==48000||view.getUint16(22,true)!==2)throw Error('Expected native 48000 Hz stereo WAV');const left=new Float32Array((buffer.byteLength-44)/4),right=left.slice();for(let i=0;i<left.length;i++){left[i]=view.getInt16(44+i*4,true)/32768;right[i]=view.getInt16(46+i*4,true)/32768;}return{left,right,frames:left.length,sampleRate:48000};},
      async freeze(id='track-1'){return LoomApp.freezeTrack(id);},
      async unfreeze(id='track-1'){return LoomApp.unfreezeTrack(id);}
    };
  });
}
async function dispose(context,page){if(page&&!page.isClosed())await page.evaluate(async()=>{LoomApp?.cancelFreeze();LoomApp?.host.dispose();await LoomApp?.noteRenderer.dispose();await LoomApp?.engine.dispose();}).catch(()=>{});await context.close();}

async function lifecycleChecks(url){
  const context=await contextFor(url),page=await pageFor(context,url);
  try{
    await check('freeze preserves source controls and matches live-quantum stereo mix with shared buses',async()=>{
      const result=await page.evaluate(async()=>{
        const q=freezeQA;await LoomApp.engine.applyAudioSettings({sampleRate:48000,latencyProfile:'live'});await LoomApp.loadState(q.fixture());q.original=LoomApp.getState();q.reference=q.core(q.original);await q.freeze();const frozen=LoomApp.getState(),actual=q.core(frozen);
        q.frozen=frozen;
        return{frozen:!!frozen.tracks[0].freeze,sourceBefore:q.trackSource(q.original.tracks[0]),sourceAfter:q.trackSource(frozen.tracks[0]),otherBefore:q.original.tracks.slice(1),otherAfter:frozen.tracks.slice(1),returnsBefore:q.original.returns,returnsAfter:frozen.returns,masterBefore:q.original.master,masterAfter:frozen.master,lfosBefore:q.original.lfos,lfosAfter:frozen.lfos,left:q.difference(q.reference.left,actual.left),right:q.difference(q.reference.right,actual.right),stats:q.stats([actual.left,actual.right]),slots:actual.core.slots[0].filter(Boolean).length,eq:!!actual.core.trackEq[0],sources:actual.core.clipLists[0].length};
      });
      assert.equal(result.frozen,true);assert.deepEqual(result.sourceAfter,result.sourceBefore);assert.deepEqual(result.otherAfter,result.otherBefore);assert.deepEqual(result.returnsAfter,result.returnsBefore);assert.deepEqual(result.masterAfter,result.masterBefore);assert.deepEqual(result.lfosAfter,result.lfosBefore);
      assert(result.left.max<2e-6&&result.right.max<2e-6,'Frozen main/send proxies retain source DSP and automation: '+JSON.stringify({left:result.left,right:result.right}));assert(result.stats.rms>.001);assert.equal(result.slots,0);assert.equal(result.eq,false);assert.equal(result.sources,0);
      return{left:result.left,right:result.right,stats:result.stats,selectedTrack:{insertDSP:result.slots,eqDSP:result.eq,compiledClips:result.sources}};
    });
    await check('frozen controls are read only while mute solo name and other tracks remain live',async()=>{
      assert.match(await page.locator('#trackFreezeButton').innerText(),/unfreeze/i);
      const locked=await page.locator('#level-0,#pan-0,[data-track-send][data-track="0"],[data-send-number][data-track="0"],[data-send-pre][data-track="0"],[data-eq-band][data-track="0"],[data-eq-number][data-track="0"],[data-eq-flat="0"],#instrumentLive').evaluateAll(elements=>elements.map(element=>({id:element.id||element.outerHTML.slice(0,100),locked:element.disabled===true||element.getAttribute('aria-disabled')==='true'})));
      assert(locked.length>=16);assert(locked.every(control=>control.locked),'Every frozen sound control is read only: '+JSON.stringify(locked.filter(control=>!control.locked)));
      const original=await page.evaluate(()=>freezeQA.trackSource(LoomApp.getState().tracks[0]));await page.locator('#trackName').fill('Cold storage');await page.locator('#trackName').press('Tab');
      await page.locator('[data-mute="0"]').first().click();assert.equal(await page.evaluate(()=>LoomApp.getState().tracks[0].mute),true);assert.equal(await page.evaluate(()=>!!LoomApp.getState().tracks[0].freeze),true);await page.locator('[data-mute="0"]').first().click();
      await page.locator('[data-solo="0"]').first().click();assert.equal(await page.evaluate(()=>LoomApp.getState().tracks[0].solo),true);await page.locator('[data-solo="0"]').first().click();
      const changed=await page.evaluate(()=>freezeQA.trackSource(LoomApp.getState().tracks[0]));delete original.name;delete changed.name;assert.deepEqual(changed,original);
      await page.evaluate(()=>LoomApp.selectTrack(1));assert.equal(await page.locator('#level-1').isDisabled(),false);assert.equal(await page.locator('#pan-1').isDisabled(),false);await page.evaluate(()=>LoomApp.selectTrack(0));
      assert.equal(await page.locator('#tempo').isDisabled(),true);assert.equal(await page.locator('#lengthBars').isDisabled(),true);assert.equal(await page.locator('#loopButton').isDisabled(),false);
      const lfoLocks=await page.locator('.lfo-bank [data-lfo-number],.lfo-bank [data-lfo-knob],.lfo-bank [data-lfo-field]').evaluateAll(elements=>elements.map(element=>({key:element.dataset.lfoNumber||element.dataset.lfoKnob||element.dataset.lfoField,locked:element.disabled||element.getAttribute('aria-disabled')==='true'})));assert(lfoLocks.length>=6);assert(lfoLocks.every(control=>control.locked),'Global LFO values are fixed while any track is frozen: '+JSON.stringify(lfoLocks));
      await page.evaluate(()=>LoomApp.selectEffect(0,'master'));assert.equal(await page.locator('#trackFreeze').isVisible(),false);assert.equal(await page.locator('#fx-cutoff').isDisabled(),false,'Master processing remains editable');await page.evaluate(()=>LoomApp.selectEffect(0,'return-1'));assert.equal(await page.locator('#trackFreeze').isVisible(),false);assert.equal(await page.locator('#fx-drive').isDisabled(),false,'Shared returns remain editable');await page.evaluate(()=>LoomApp.selectTrack(0));assert.equal(await page.locator('#trackFreeze').isVisible(),true);
      await page.evaluate(()=>LoomApp.selectClip('freeze-clip-0'));const clipLocks=await page.locator('[data-clip-param]').evaluateAll(elements=>elements.map(element=>({key:element.dataset.clipParam,locked:element.disabled||element.getAttribute('aria-disabled')==='true'})));assert(clipLocks.length>4);assert(clipLocks.every(control=>control.locked),'Clip edits retain their baked geometry: '+JSON.stringify(clipLocks));
      for(const width of[390,768,1440]){await page.setViewportSize({width,height:1000});await page.locator('#trackFreeze').scrollIntoViewIfNeeded();const overflow=await page.locator('#trackFreeze button,#trackFreeze progress,#trackFreezeStatus').evaluateAll(elements=>elements.flatMap(element=>{const box=element.getBoundingClientRect();return box.width&&(box.left < -1||box.right>innerWidth+1)?[{id:element.id,left:box.left,right:box.right,width:box.width}]:[];}));await page.screenshot({path:path.join(artifacts,'freeze-viewport-'+width+'.png')});await page.locator('#trackFreeze').screenshot({path:path.join(artifacts,'freeze-controls-'+width+'.png')});assert.deepEqual(overflow,[],'Freeze controls fit '+width+' px');}
      return{lockedControls:locked.length,lockedLFOControls:lfoLocks.length,liveControls:['name','mute','solo','other track level','other track pan']};
    });
    await check('actual saved project restores frozen Float32 cache and unfreeze is instant and undoable',async()=>{
      const downloadPromise=page.waitForEvent('download');await page.locator('#saveButton').click();const download=await downloadPromise,bytes=fs.readFileSync(await download.path());fs.writeFileSync(path.join(artifacts,'frozen-session.loom.json'),bytes);
      const fileState=JSON.parse(bytes).state;assert(fileState.tracks[0].freeze);await page.evaluate(()=>LoomApp.loadState(freezeQA.blank()));await page.locator('#projectFile').setInputFiles({name:'frozen-session.loom.json',mimeType:'application/json',buffer:bytes});await page.waitForFunction(()=>!!LoomApp.getState().tracks[0].freeze);
      const result=await page.evaluate(async()=>{const q=freezeQA,restored=LoomApp.getState(),render=q.core(restored),started=performance.now();await q.unfreeze();return{freeze:restored.tracks[0].freeze,left:q.difference(q.reference.left,render.left),right:q.difference(q.reference.right,render.right),milliseconds:performance.now()-started,unfrozen:LoomApp.getState().tracks[0],source:q.trackSource(restored.tracks[0])};});
      assert.deepEqual(result.freeze,fileState.tracks[0].freeze);assert(result.left.max<2e-6&&result.right.max<2e-6);assert(!result.unfrozen.freeze);assert.deepEqual(result.unfrozen,result.source);assert(result.milliseconds<1000,'Unfreeze is a quick state operation, without an audio render');
      await page.locator('#undoButton').click();assert.equal(await page.evaluate(()=>!!LoomApp.getState().tracks[0].freeze),true);await page.locator('#redoButton').click();assert.equal(await page.evaluate(()=>!!LoomApp.getState().tracks[0].freeze),false);assert.equal(await page.locator('#level-0').isDisabled(),false);assert.equal(await page.locator('#tempo').isDisabled(),false);
      return{savedBytes:bytes.length,unfreezeMilliseconds:result.milliseconds,left:result.left,right:result.right,undoRedo:true};
    });
    await check('cancel and a project replacement cannot commit an obsolete render',async()=>{
      const result=await page.evaluate(async()=>{
        const q=freezeQA;await LoomApp.loadState(q.fixture());const original=LoomApp.getState(),cancelled=q.freeze().then(()=>({ok:true}),error=>({name:error.name,message:error.message})),busyBeforeCancel=q.status().busy;let busyGuard=null;try{LoomApp.unfreezeAll();}catch(error){busyGuard=error.message;}LoomApp.cancelFreeze();const cancelResult=await cancelled,afterCancel=LoomApp.getState();
        const obsolete=q.freeze().then(()=>({ok:true}),error=>({name:error.name,message:error.message}));const next=q.blank();next.name='Replacement must survive';await LoomApp.loadState(next);const staleResult=await obsolete,afterReplace=LoomApp.getState();return{busyBeforeCancel,busyGuard,cancelResult,unchanged:JSON.stringify(original)===JSON.stringify(afterCancel),staleResult,name:afterReplace.name,frozen:afterReplace.tracks.some(track=>track.freeze),assetCount:afterReplace.assets.length,status:q.status()};
      });
      assert.equal(result.busyBeforeCancel,true);assert.match(result.busyGuard,/finish|cancel/i);assert.equal(result.unchanged,true,'Cancelled freeze is atomic');assert.equal(result.name,'Replacement must survive');assert.equal(result.frozen,false);assert.equal(result.assetCount,0);assert(!result.status?.busy);return result;
    });
  }finally{await dispose(context,page);}
}
async function serializedChecks(url){
  const context=await contextFor(url),page=await pageFor(context,url);
  try{
    await check('production serialized AudioWorklet plays cache with zero selected insert or EQ callbacks',async()=>{
      const result=await page.evaluate(async()=>{
        const q=freezeQA,nativeURL=URL.createObjectURL,NativeNode=AudioWorkletNode;let blob,processorOptions;
        URL.createObjectURL=value=>{if(value.type.includes('javascript'))blob=value;return nativeURL.call(URL,value);};window.AudioWorkletNode=class extends NativeNode{constructor(...args){super(...args);processorOptions=args[2]?.processorOptions;}};
        try{await LoomApp.loadState(q.fixture());await LoomApp.engine.applyAudioSettings({sampleRate:48000,latencyProfile:'live'});await q.freeze();await LoomApp.engine.init();}finally{URL.createObjectURL=nativeURL;window.AudioWorkletNode=NativeNode;}
        if(LoomApp.engine.mode!=='worklet'||!blob)throw Error('Actual GALLEY Worklet initialization failed: '+LoomApp.engine.workletError);
        const state=LoomApp.getState(),code=await blob.text(),frames=8192,reference=q.core(state,{frames});
        const observer=`
registerProcessor('freeze-qa-offline',class extends LoomProcessor {
 constructor(options){super(options);this.core.setAssets(options.processorOptions.qaAssets);this.qa={insertCalls:0,eqCalls:0,insertInstances:this.core.slots[0].filter(Boolean).length,eqInstance:!!this.core.trackEq[0],compiledSources:this.core.clipLists[0].length};const rack=this.core._processRack,eq=this.core._processTrackEq,self=this;this.core._processRack=function(owner,...args){if(owner.id==='track-1')self.qa.insertCalls++;return rack.call(this,owner,...args);};this.core._processTrackEq=function(index,...args){if(index===0)self.qa.eqCalls++;return eq.call(this,index,...args);};this.qaFrames=0;this.core.start(0);}
 process(inputs,outputs){const result=super.process(inputs,outputs);this.qaFrames+=outputs[0][0].length;if(this.qaFrames===${frames})this.port.postMessage({type:'freeze-qa-final',...this.qa,frames:this.qaFrames});return result;}
});`;
        const offline=new OfflineAudioContext(2,frames,48000),module=nativeURL.call(URL,new Blob([code,observer],{type:'text/javascript'}));try{await offline.audioWorklet.addModule(module);}finally{URL.revokeObjectURL(module);}
        const node=new NativeNode(offline,'freeze-qa-offline',{numberOfInputs:9,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{...processorOptions,state,qaAssets:LoomSchema.decodeAssets(state.assets,state.freezeAssets)}});let counters;
        const final=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Serialized freeze callback report timed out')),10000);node.port.onmessage=event=>{if(event.data.type==='freeze-qa-final'){clearTimeout(timer);counters=event.data;resolve();}};});node.connect(offline.destination);const audio=await offline.startRendering();await final;node.disconnect();node.port.close();
        return{mode:LoomApp.engine.mode,containsProductionFactory:code.includes('createLoomEngineDSP'),left:q.difference(reference.left,audio.getChannelData(0)),right:q.difference(reference.right,audio.getChannelData(1)),stats:q.stats([audio.getChannelData(0),audio.getChannelData(1)]),counters};
      });
      assert.equal(result.mode,'worklet');assert.equal(result.containsProductionFactory,true);assert.equal(result.left.max,0);assert.equal(result.right.max,0);assert(result.stats.rms>.001);assert.equal(result.counters.insertCalls,0);assert.equal(result.counters.eqCalls,0);assert.equal(result.counters.insertInstances,0);assert.equal(result.counters.eqInstance,false);assert.equal(result.counters.compiledSources,0);return result;
    });
  }finally{await dispose(context,page);}
}
async function nativeChecks(url){
  const context=await contextFor(url),page=await pageFor(context,url);
  try{
    await check('native BRINE note performance freezes exactly and disposes its live Worklet',async()=>{
      await page.evaluate(async()=>{await LoomApp.engine.applyAudioSettings({sampleRate:48000,latencyProfile:'live'});const state=freezeQA.blank();state.tracks[0].instrument={id:'brine',name:'BRINE'};await LoomApp.loadState(state);});
      await page.locator('#openInstrumentButton').click();await page.waitForFunction(()=>LoomApp.host.records.get('track-1')?.loaded,null,{timeout:30000});
      await page.evaluate(async()=>{
        const q=freezeQA,snapshot=await LoomApp.host.snapshot('track-1'),state=LoomApp.getState(),patch=snapshot.state.state||snapshot.state;patch.synth.velocityAmount=.65;state.tracks[0].instrument.snapshot=snapshot;
        const packet=MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:'Unequal held notes',sourceApp:'brine',kind:'notes',tempo:240,swing:0,lengthBeats:4,meter:[4,4],seed:1347571509,voices:[{id:'synth',name:'BRINE',pitch:60}],notes:[{id:'held-low',voice:'synth',pitch:48,beat:.25,duration:.75,velocity:.6,probability:1},{id:'held-high',voice:'synth',pitch:67,beat:2,duration:.5,velocity:.5,probability:1}]});
        state.tracks[0].clips=[LoomSchema.noteClip({id:'native-held-clip',name:'Unequal held notes',type:'notes',pattern:packet,voiceMap:{synth:'synth'},start:0,length:4,sourceOffset:0,rate:1,loop:false,gain:.8,fadeIn:0,fadeOut:0,transpose:0},4)];state.tracks[0].effects[0]=q.fx('prism',{filter:'lowpass',cutoff:1800,mix:.8});state.tracks[0].automation=[{target:'fx:0:cutoff',effectType:'prism',enabled:true,interpolation:'linear',points:[{beat:0,value:900},{beat:4,value:4000}]}];await LoomApp.loadState(state);
      });
      await page.locator('#openInstrumentButton').click();await page.waitForFunction(()=>LoomApp.host.records.get('track-1')?.loaded,null,{timeout:30000});
      const before=await page.evaluate(async()=>{
        const q=freezeQA;await LoomApp.host.getPatternAdapter('track-1').prepare();q.nativeRecord=LoomApp.host.records.get('track-1');q.nativeAudio=q.nativeRecord.iframe.contentWindow.BrineApp.engine;q.nativeContext=LoomApp.engine.context;q.nativeOriginal=LoomApp.getState();q.nativeOriginal.tracks[0].instrument.snapshot=await LoomApp.host.snapshot('track-1');
        const prepared=await LoomApp.noteRenderer.prepareNotes(q.nativeOriginal,LoomApp.assets,{trackId:'track-1',tailSeconds:8,preserveTails:true}),source=prepared.assets[prepared.state.tracks[0].clips[0].assetId];q.nativeReference=q.core(prepared.state,{assets:prepared.assets,frames:source.left.length});
        q.nativeSourceDiagnostics={directSchedule:q.directNative(q.nativeRecord,source,q.nativeOriginal.tracks[0].instrument.snapshot.state,q.nativeOriginal.tracks[0].clips[0].pattern),sourceFrames:source.left.length,release:q.stats([q.nativeReference.left.subarray(48000),q.nativeReference.right.subarray(48000)])};
        // The cache deliberately fades its final 6 ms after the full eight-second
        // release. This fixture has only a constant linear master after the track,
        // so that documented edge envelope also applies to the independent mix.
        const fadeFrames=Math.round(48000*.006),total=q.nativeReference.left.length;q.nativeSourceDiagnostics.finalFadeFrames=fadeFrames;for(let at=total-fadeFrames;at<total;at++){const gain=.5-.5*Math.cos(Math.PI*(total-1-at)/fadeFrames);q.nativeReference.left[at]*=gain;q.nativeReference.right[at]*=gain;}
        return{mode:q.nativeAudio.mode,hasNode:!!q.nativeAudio.node,contextState:q.nativeContext.state};
      });
      assert.equal(before.mode,'worklet');assert.equal(before.hasNode,true);assert.notEqual(before.contextState,'closed');await page.locator('#closeInstrument').click();
      await page.evaluate(()=>freezeQA.freeze());await page.waitForFunction(()=>freezeQA.nativeAudio._disposed===true&&freezeQA.nativeAudio.node===null,null,{timeout:10000});
      const result=await page.evaluate(()=>{const q=freezeQA,state=LoomApp.getState(),actual=q.core(state,{frames:q.nativeReference.left.length});return{frozen:!!state.tracks[0].freeze,left:q.difference(q.nativeReference.left,actual.left),right:q.difference(q.nativeReference.right,actual.right),rawSource:q.nativeSourceDiagnostics,sourceBefore:q.trackSource(q.nativeOriginal.tracks[0]),sourceAfter:q.trackSource(state.tracks[0]),liveHosts:LoomApp.host.records.size,frameConnected:q.nativeRecord.iframe.isConnected,oldEngineDisposed:q.nativeAudio._disposed,oldNode:q.nativeAudio.node===null,parentContextSame:LoomApp.engine.context===q.nativeContext,parentContextState:LoomApp.engine.context.state,privateRenders:LoomApp.noteRenderer.operations.size};});
      evidence.nativeComparison={left:result.left,right:result.right,rawSource:result.rawSource};save();console.log('INFO native comparison '+JSON.stringify(evidence.nativeComparison));
      assert(result.frozen);assert.equal(result.rawSource.directSchedule.left.max,0,'Native note rendering keeps the direct sample-clock note onset/duration');assert.equal(result.rawSource.directSchedule.right.max,0);assert(result.rawSource.release.rms>1e-5,'Native release continues beyond the visible clip and arrangement end');assert.deepEqual(result.sourceAfter,result.sourceBefore);assert(result.left.max<2e-6&&result.right.max<2e-6,'Native note timing and tone survive freeze: '+JSON.stringify({left:result.left,right:result.right}));assert.equal(result.liveHosts,0);assert.equal(result.frameConnected,false);assert.equal(result.oldEngineDisposed,true);assert.equal(result.oldNode,true);assert.equal(result.parentContextSame,true);assert.notEqual(result.parentContextState,'closed');assert.equal(result.privateRenders,0);
      return{before,left:result.left,right:result.right,liveHosts:result.liveHosts,oldEngineDisposed:result.oldEngineDisposed,parentContextSame:result.parentContextSame,privateRenders:result.privateRenders};
    });
    await check('frozen native-note WAV uses cache without a private instrument and unfreeze reloads lazily',async()=>{
      const result=await page.evaluate(async()=>{
        const q=freezeQA,renderer=LoomApp.noteRenderer,original=renderer._session;let sessions=0;renderer._session=function(...args){sessions++;return original.apply(this,args);};let audio;try{audio=await q.wav(LoomApp.getState());}finally{renderer._session=original;}
        const reference=q.core(LoomApp.getState(),{frames:audio.frames}),left=q.difference(audio.left,reference.left),right=q.difference(audio.right,reference.right);await q.unfreeze();return{sessions,left,right,source:q.trackSource(LoomApp.getState().tracks[0]),original:q.trackSource(q.nativeOriginal.tracks[0]),hostsAfterUnfreeze:LoomApp.host.records.size,frozen:!!LoomApp.getState().tracks[0].freeze,frames:audio.frames};
      });
      assert.equal(result.sessions,0);assert(result.left.max<=2/32768&&result.right.max<=2/32768);assert.deepEqual(result.source,result.original);assert.equal(result.hostsAfterUnfreeze,0);assert.equal(result.frozen,false);await page.locator('#openInstrumentButton').click();await page.waitForFunction(()=>LoomApp.host.records.get('track-1')?.loaded,null,{timeout:30000});
      const restored=await page.evaluate(async()=>{const actual=await LoomApp.host.snapshot('track-1'),expected=freezeQA.nativeOriginal.tracks[0].instrument.snapshot;return{actual:actual.state,expected:expected.state,privateRenders:LoomApp.noteRenderer.operations.size};});assert.deepEqual(restored.actual,restored.expected);assert.equal(restored.privateRenders,0);await page.locator('#closeInstrument').click();return{sessions:result.sessions,frames:result.frames,left:result.left,right:result.right,lazyHostRestore:true};
    });
    await check('unfreezing a native Live pattern reloads its audio while playback keeps running',async()=>{
      await page.evaluate(async()=>{const q=freezeQA,state=q.blank(),source=q.copy(q.nativeOriginal.tracks[0].instrument),patch=source.snapshot.state.state||source.snapshot.state;patch.pattern=q.copy(q.nativeOriginal.tracks[0].clips[0].pattern);patch.tempo=240;state.loopEnabled=true;state.loopEnd=4;state.tracks[0].instrument=source;state.tracks[0].instrumentLive=true;await LoomApp.loadState(state);await q.freeze();q.liveParentContext=LoomApp.engine.context;});
      assert.equal(await page.evaluate(()=>LoomApp.host.records.size),0);await page.locator('#playButton').click();await page.waitForFunction(()=>LoomApp.engine.getTransport().playing&&LoomApp.notePlayback.active,null,{timeout:15000});await page.evaluate(()=>freezeQA.unfreeze());
      await page.waitForFunction(()=>LoomApp.host.records.get('track-1')?.loaded&&LoomApp.notePlayback.tracks.has('track-1')&&LoomApp.engine.getMeters().tracks[0].rms>.0001,null,{timeout:15000});
      const result=await page.evaluate(()=>({playing:LoomApp.engine.getTransport().playing,frozen:!!LoomApp.getState().tracks[0].freeze,live:LoomApp.getState().tracks[0].instrumentLive,hasAdapter:LoomApp.notePlayback.tracks.has('track-1'),nativeMode:LoomApp.host.records.get('track-1').iframe.contentWindow.BrineApp.engine.mode,rms:LoomApp.engine.getMeters().tracks[0].rms,parentContextSame:LoomApp.engine.context===freezeQA.liveParentContext}));
      assert.equal(result.playing,true);assert.equal(result.frozen,false);assert.equal(result.live,true);assert.equal(result.hasAdapter,true);assert.equal(result.nativeMode,'worklet');assert(result.rms>.0001);assert.equal(result.parentContextSame,true);await page.locator('#stopButton').click();return result;
    });
  }finally{await dispose(context,page);}
}
async function portableRateChecks(url){
  const context=await contextFor(url),page=await pageFor(context,url);
  try{
    await check('a portable frozen project cannot enter an incompatible active audio context',async()=>{
      const result=await page.evaluate(async()=>{
        const q=freezeQA;await LoomApp.engine.applyAudioSettings({sampleRate:44100,latencyProfile:'live'});await LoomApp.loadState(q.fixture());await q.freeze();const foreign=LoomApp.getState(),cacheRate=foreign.tracks[0].freeze.sampleRate;await q.unfreeze();await LoomApp.loadState(q.blank());await LoomApp.engine.applyAudioSettings({sampleRate:48000,latencyProfile:'live'});await LoomApp.engine.init();const before=JSON.stringify(LoomApp.getState()),context=LoomApp.engine.context;let error=null;
        try{await LoomApp.loadState(foreign);await LoomApp.engine.init();}catch(caught){error={name:caught.name,message:caught.message};}
        const after=LoomApp.getState();return{cacheRate,initialRate:context.sampleRate,error,sameProject:JSON.stringify(after)===before,sameContext:LoomApp.engine.context===context,activeRate:LoomApp.engine.context?.sampleRate,frozen:!!after.tracks[0].freeze,status:q.status()};
      });
      assert.equal(result.cacheRate,44100);assert.equal(result.initialRate,48000);if(result.error){assert.match(result.error.message,/sample.?rate|44[,.]?100|audio context/i);assert.equal(result.sameProject,true,'Rejected project load preserves current project');assert.equal(result.sameContext,true);assert.equal(result.activeRate,48000);assert.equal(result.frozen,false);}else{assert.equal(result.activeRate,44100);assert.equal(result.frozen,true);}assert(!result.status?.busy);return result;
    });
  }finally{await dispose(context,page);}
}
async function run(){
  const url=process.argv[2]||process.env.FREEZE_QA_URL||await serve();
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  try{
    const phases=new Set((process.env.FREEZE_QA_PHASES||'lifecycle,serialized,native,rates').split(','));if(phases.has('lifecycle'))await lifecycleChecks(url);if(phases.has('serialized'))await serializedChecks(url);if(phases.has('native'))await nativeChecks(url);if(phases.has('rates'))await portableRateChecks(url);
    assert.deepEqual(errors,[],'No hidden page or instrument errors');assert.deepEqual(external,[],'The complete workflow runs without external network dependencies');save();console.log('PASS no hidden browser errors or external dependencies');
  }finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)run().catch(error=>{fs.writeFileSync(path.join(artifacts,'failure.json'),JSON.stringify({message:error.stack||String(error),passed,evidence,errors,external},null,2)+'\n');console.error(error);process.exitCode=1;});
