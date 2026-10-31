'use strict';
/* HEIRLOOM: real standalone, serialized Worklet, fallback and GALLEY checks.
 * No browser dependency is added to the instrument. Use HEIRLOOM_QA_PHASES to
 * reserve one Chromium run at a time: engine,ui,midi,host. Source previews are
 * built under /tmp; HEIRLOOM_QA_BUILT=1 tests the packaged standalone instead.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const installed = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync(installed) ? installed : 'playwright'));
const appRoot = __dirname, parentRoot = path.dirname(appRoot);
const hasGalley = fs.existsSync(path.join(parentRoot,'loom','audio-engine.js'));
const root = hasGalley ? parentRoot : appRoot;
const artifacts = process.env.HEIRLOOM_QA_ARTIFACTS || '/tmp/heirloom-browser-qa';
const evidence = {}, passed = [], errors = [], external = [];
let server, browser, servedHTML, activeCheck = '';
fs.mkdirSync(artifacts,{recursive:true});
const copy = value => JSON.parse(JSON.stringify(value));
async function appHTML() {
  if(process.env.HEIRLOOM_QA_FILE)return fs.readFileSync(process.env.HEIRLOOM_QA_FILE,'utf8');
  if(process.env.HEIRLOOM_QA_BUILT)return fs.readFileSync(path.join(appRoot,'index.html'),'utf8');
  const output=path.join(artifacts,'source-preview.html');
  await promisify(execFile)('python3',[path.join(appRoot,'build.py'),'--output',output],{maxBuffer:1024*1024});
  return fs.readFileSync(output,'utf8');
}
async function serve() {
  servedHTML=await appHTML();
  server=http.createServer((request,response)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
    response.setHeader('Cache-Control','no-store');
    if(/^\/heirloom(?:\/index\.html)?\/?$/.test(pathname)){response.setHeader('Content-Type','text/html');response.end(servedHTML);return;}
    if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
    const base=pathname.startsWith('/heirloom/')?appRoot:root,relative=pathname.startsWith('/heirloom/')?pathname.slice('/heirloom'.length):pathname;
    let file=path.resolve(base,'.'+relative);if(!file.startsWith(base+path.sep)){response.writeHead(403);response.end();return;}
    try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{}
    fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){response.writeHead(404);response.end('Missing fixture');return;}response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(response);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port+'/heirloom/';
}
async function check(name,run) {
  if(process.env.HEIRLOOM_QA_FILTER&&!new RegExp(process.env.HEIRLOOM_QA_FILTER).test(name))return;
  activeCheck=name;
  const began=Date.now(),value=await run();passed.push({name,milliseconds:Date.now()-began,evidence:value});
  fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({passed,evidence,errors,external},null,2)+'\n');
  console.log('PASS '+name+(value===undefined?'':' '+JSON.stringify(value)));
  activeCheck='';
}
async function contextFor(url,options={}) {
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000},...options});
  const allowed=new Set([new URL(url).origin,...(process.env.HEIRLOOM_HOST_URL?[new URL(process.env.HEIRLOOM_HOST_URL).origin]:[])]);
  await context.route('**/*',route=>{const address=route.request().url();if(/^(data:|blob:|about:)/.test(address)||allowed.has(new URL(address).origin))return route.continue();external.push(address);return route.abort();});
  context.on('page',page=>page.on('pageerror',error=>errors.push({url:page.url(),check:activeCheck,message:error.message,stack:error.stack?.split('\n').slice(0,6).join('\n')})));
  return context;
}
async function pageFor(context,url,{fallback=false,midi=false,width=1440}={}) {
  const page=await context.newPage();await page.setViewportSize({width,height:1000});
  if(fallback)await page.addInitScript(()=>{Object.defineProperty(window,'AudioWorkletNode',{value:undefined,configurable:true});});
  if(midi)await page.addInitScript(()=>{
    const eventSource=value=>{const listeners=new Map();return Object.assign(value,{addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(handler);},removeEventListener(type,handler){listeners.get(type)?.delete(handler);},listenerCount(type){return listeners.get(type)?.size||0;},emit(type,details={}){const event={type,target:this,timeStamp:performance.now(),...details};this['on'+type]?.(event);for(const handler of listeners.get(type)||[])handler(event);}});};
    window.__qaMidiInput=eventSource({id:'heirloom-qa-midi',name:'Browser fixture keys',manufacturer:'QA',state:'connected',connection:'open',type:'input',onmidimessage:null,async open(){this.connection='open';return this;},async close(){this.connection='closed';return this;},send(data){this.emit('midimessage',{data:new Uint8Array(data),receivedTime:performance.now()});}});
    window.__qaMidiAccess=eventSource({inputs:new Map([['heirloom-qa-midi',__qaMidiInput]]),outputs:new Map(),onstatechange:null});
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>__qaMidiAccess,configurable:true});
  });
  await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>window.HeirloomApp&&window.HeirloomSchema&&window.createHeirloomDSP&&window.MusicLabPatternInstrument,null,{timeout:30000});
  await helpers(page);return page;
}
async function helpers(page) {
  await page.evaluate(()=>{
    const clone=value=>JSON.parse(JSON.stringify(value));
    window.heirloomQA={
      clone,
      patch(){const state=HeirloomSchema.defaultState();state.tempo=120;Object.assign(state.synth,{vintage:0,noiseLevel:0,volume:.5,ampAttack:.003,ampDecay:.1,ampSustain:.7,ampRelease:.025,filterAttack:.003,filterDecay:.1,filterSustain:.5,filterRelease:.025,cutoff:2800,resonance:.2});state.pattern=MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:'Browser phrase',sourceApp:'heirloom',kind:'notes',tempo:120,swing:0,lengthBeats:4,meter:[4,4],seed:17,voices:[{id:'synth',name:'HEIRLOOM',pitch:60}],notes:[{id:'first',voice:'synth',pitch:60,beat:0,duration:.75,velocity:.8,probability:1},{id:'second',voice:'synth',pitch:64,beat:1,duration:1.25,velocity:.7,probability:1},{id:'last',voice:'synth',pitch:67,beat:2.75,duration:1.25,velocity:.85,probability:1}]});return HeirloomSchema.normalize(state);},
      events(){return [
        {type:'on',options:{id:'alpha-a',source:'alpha',channel:0,pitch:60,velocity:.8,frame:257,durationFrames:5500}},
        {type:'on',options:{id:'beta-b',source:'beta',channel:1,pitch:67,velocity:.7,frame:2305,durationFrames:7000}},
        {type:'bend',options:{source:'alpha',channel:0,value:.23,frame:3073}},
        {type:'wheel',options:{source:'beta',channel:1,value:.4,frame:4099}},
        {type:'sustain',options:{source:'beta',channel:1,down:true,frame:6145}},
        {type:'off',options:{source:'beta',channel:1,id:'beta-b',frame:7169}},
        {type:'cancel',options:{source:'alpha',frame:8193}},
        {type:'sustain',options:{source:'beta',channel:1,down:false,frame:10241}}
      ];},
      stats(left,right=left){let peak=0,square=0,first=-1,nonfinite=0,stereoDifference=0;for(let i=0;i<left.length;i++){for(const value of [left[i],right[i]]){if(!Number.isFinite(value))nonfinite++;peak=Math.max(peak,Math.abs(value));square+=value*value;}if(first<0&&Math.max(Math.abs(left[i]),Math.abs(right[i]))>1e-6)first=i;stereoDifference=Math.max(stereoDifference,Math.abs(left[i]-right[i]));}return {frames:left.length,peak,rms:Math.sqrt(square/Math.max(1,left.length*2)),first,nonfinite,stereoDifference};},
      difference(a,b){if(a.length!==b.length)throw Error('Different PCM dimensions');let max=0,different=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))throw Error('Non-finite PCM');const difference=Math.abs(a[i]-b[i]);max=Math.max(max,difference);if(difference)different++;}return {max,different};},
      core(state,events,frames=14336,rate=48000,block=128,start=0){const core=new(createHeirloomPlaybackDSP(createHeirloomDSP).Core)(rate,state,start);for(const event of events)core.enqueue(event.type,{...event.options,frame:start+event.options.frame});const left=new Float32Array(frames),right=new Float32Array(frames);for(let at=0;at<frames;at+=block)core.process(left.subarray(at,at+block),right.subarray(at,at+block));return {core,left,right};},
      interleaved(pcm){const left=new Float32Array(pcm.length/2),right=left.slice();for(let i=0;i<left.length;i++){left[i]=pcm[i*2];right[i]=pcm[i*2+1];}return {left,right};}
    };
  });
}
async function exact(page,selector,value) { const field=page.locator(selector);await field.fill(String(value));await field.press('Tab'); }
async function engineChecks(url) {
  const context=await contextFor(url),page=await pageFor(context,url);
  try {
    await check('Actual serialized HEIRLOOM Worklet matches canonical scheduling and stereo PCM',async()=>{
      const report=await page.evaluate(async()=>{
        const q=heirloomQA,state=q.patch(),engine=new HeirloomAudio(state),nativeURL=URL.createObjectURL,NativeNode=AudioWorkletNode;let captured;
        URL.createObjectURL=function(value){if(value?.type?.includes('javascript'))captured=value;return nativeURL.call(URL,value);};
        try{
          await engine.init();if(engine.mode!=='worklet')throw Error('Production Worklet failed: '+engine.workletError);
          const source=await captured.text();if(source!==HeirloomAudio.processorSource())throw Error('Captured module differs from production source');
          const rate=48000,frames=14336,events=q.events(),reference=q.core(state,events,frames,rate),offline=new OfflineAudioContext(2,frames,rate);
          const module=nativeURL.call(URL,new Blob([source+'\nregisterProcessor("heirloom-qa-offline",class extends HeirloomProcessor { constructor(options){super(options);for(const event of options.processorOptions.qaEvents)this.core.enqueue(event.type,event.options);} });'],{type:'application/javascript'}));
          try{await offline.audioWorklet.addModule(module);}finally{URL.revokeObjectURL(module);}
          const node=new NativeNode(offline,'heirloom-qa-offline',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{state,qaEvents:events}});node.connect(offline.destination);
          const rendered=await offline.startRendering(),left=rendered.getChannelData(0),right=rendered.getChannelData(1),result={mode:engine.mode,left:q.difference(left,reference.left),right:q.difference(right,reference.right),stats:q.stats(left,right),beforeNote:Math.max(...left.subarray(0,257).map(Math.abs))};node.disconnect();node.port.close();return result;
        }finally{URL.createObjectURL=nativeURL;await engine.dispose();}
      });
      assert.equal(report.left.max,0);assert.equal(report.right.max,0);assert.equal(report.beforeNote,0);assert(report.stats.first>=257&&report.stats.first<257+1440);assert(report.stats.rms>1e-5);assert.equal(report.stats.nonfinite,0);evidence.worklet=report;return report;
    });
    await check('Future source cancellation and Panic remain isolated in the production serialized scheduler',async()=>{
      const report=await page.evaluate(async()=>{
        const q=heirloomQA,state=q.patch(),rate=48000,frames=10000,events=[{type:'on',options:{id:'cancelled',source:'cancel-me',channel:0,pitch:60,velocity:.8,frame:1000,durationFrames:3000}},{type:'on',options:{id:'survivor',source:'keep-me',channel:1,pitch:72,velocity:.8,frame:4097,durationFrames:4000}},{type:'cancel',options:{source:'cancel-me',frame:500}}];
        const reference=q.core(state,events,frames,rate),source=HeirloomAudio.processorSource(),offline=new OfflineAudioContext(2,frames,rate),url=URL.createObjectURL(new Blob([source+'\nregisterProcessor("heirloom-qa-cancel",class extends HeirloomProcessor { constructor(options){super(options);for(const event of options.processorOptions.qaEvents)this.core.enqueue(event.type,event.options);} });'],{type:'application/javascript'}));
        try{await offline.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
        const node=new AudioWorkletNode(offline,'heirloom-qa-cancel',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{state,qaEvents:events}});node.connect(offline.destination);const rendered=await offline.startRendering(),left=rendered.getChannelData(0),right=rendered.getChannelData(1),result={left:q.difference(left,reference.left),right:q.difference(right,reference.right),stats:q.stats(left,right),early:q.stats(left.subarray(0,4097),right.subarray(0,4097)).peak};node.disconnect();node.port.close();
        const core=new(createHeirloomPlaybackDSP(createHeirloomDSP).Core)(rate,state);core.enqueue('on',{id:'future',source:'panic-me',pitch:69,velocity:.9,frame:2048,durationFrames:4000});core.enqueue('panic',{frame:128});const l=new Float32Array(8192),r=l.slice();core.process(l,r);result.panic=q.stats(l,r);result.pending=core.getMeters().queued;return result;
      });
      assert.equal(report.left.max,0);assert.equal(report.right.max,0);assert.equal(report.early,0);assert(report.stats.first>=4097);assert(report.stats.peak>.001);assert.equal(report.panic.peak,0);assert.equal(report.pending,0);evidence.cancellation=report;return report;
    });
    await check('Actual ScriptProcessor fallback callback matches canonical PCM at absolute frame times',async()=>{
      const fallback=await pageFor(context,url,{fallback:true});
      try{return await fallback.evaluate(async()=>{
        const q=heirloomQA,state=q.patch(),nativeHost=window.MusicLabHost,parent=new AudioContext();await parent.suspend();const resume=parent.resume.bind(parent);parent.resume=async()=>{};window.MusicLabHost={context:parent};const engine=new HeirloomAudio(state);
        try{
          await engine.init();if(engine.mode!=='fallback')throw Error('Expected actual fallback');const rate=parent.sampleRate,start=engine.core.frame,events=q.events(),frames=engine.node.bufferSize*56,reference=q.core(state,events,frames,rate,128,start),left=new Float32Array(frames),right=left.slice();
          for(const event of events)engine._send(event.type,{...event.options,frame:start+event.options.frame});
          for(let at=0;at<frames;at+=engine.node.bufferSize){const l=left.subarray(at,at+engine.node.bufferSize),r=right.subarray(at,at+engine.node.bufferSize);engine.node.onaudioprocess({playbackTime:(start+at)/rate,outputBuffer:{getChannelData:channel=>channel?r:l}});}
          const result={mode:engine.mode,sampleRate:rate,startFrame:start,left:q.difference(left,reference.left),right:q.difference(right,reference.right),stats:q.stats(left,right)};if(result.left.max||result.right.max||result.stats.nonfinite||result.stats.peak<=.001)throw Error('Fallback PCM mismatch '+JSON.stringify(result));return result;
        }finally{await engine.dispose();window.MusicLabHost=nativeHost;parent.resume=resume;if(parent.state!=='closed')await parent.close();}
      });}finally{await fallback.close();}
    });
    await check('48 kHz WAV/PCM printing is immutable, cancellable and retains future note timing',async()=>{
      const report=await page.evaluate(async()=>{
        const q=heirloomQA,state=q.patch(),engine=new HeirloomAudio(state),before=JSON.stringify(state),appBefore=JSON.stringify(HeirloomApp.getState()),events=[{id:'late',pitch:69,beat:1,duration:1.25,velocity:.8}],audio=await engine.renderNotes({state,events,tempo:120,lengthBeats:4,tailSeconds:0,sampleRate:48000,includePCM:true}),channels=q.interleaved(audio.pcm),stats=q.stats(channels.left,channels.right),bytes=new DataView(await audio.blob.arrayBuffer());
        let wavError=0;for(let i=0;i<audio.pcm.length;i++){const value=Math.max(-1,Math.min(1,audio.pcm[i])),expected=Math.round(value*(value<0?32768:32767));wavError=Math.max(wavError,Math.abs(bytes.getInt16(44+i*2,true)-expected));}
        const controller=new AbortController(),pending=engine.renderNotes({state,events:[],tempo:120,lengthBeats:64,tailSeconds:0,sampleRate:48000,signal:controller.signal});controller.abort();let cancelled=false;try{await pending;}catch(error){cancelled=error.name==='AbortError';}
        await engine.dispose();return {stats,sampleRate:audio.sampleRate,frames:audio.pcm.length/2,wavRate:bytes.getUint32(24,true),wavChannels:bytes.getUint16(22,true),wavBits:bytes.getUint16(34,true),wavError,cancelled,stateUnchanged:JSON.stringify(state)===before,editorUnchanged:JSON.stringify(HeirloomApp.getState())===appBefore};
      });
      assert.equal(report.sampleRate,48000);assert.equal(report.frames,96000);assert.equal(report.wavRate,48000);assert.equal(report.wavChannels,2);assert.equal(report.wavBits,16);assert.equal(report.wavError,0);assert(report.stats.first>=24000);assert(report.stats.first<25440);assert(report.stats.peak>.001);assert.equal(report.stats.nonfinite,0);assert(report.cancelled&&report.stateUnchanged&&report.editorUnchanged);evidence.render=report;return report;
    });
  }finally{await context.close();}
}
async function uiChecks(url) {
  const context=await contextFor(url),page=await pageFor(context,url);
  try {
    await check('All front-panel and calibration controls fit320/390/1440 without external assets',async()=>{
      const controls=await page.evaluate(()=>HeirloomSchema.CONTROLS.map(control=>({key:control.key,type:control.type}))),widths=[];
      for(const width of [320,390,1440]){
        await page.setViewportSize({width,height:1000});await page.locator('#calibrationPanel').evaluate(element=>element.open=true);
        const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert(dimensions.document<=width+1&&dimensions.body<=width+1,JSON.stringify(dimensions));
        for(const control of controls){const selector=control.type==='toggle'?'[data-toggle="'+control.key+'"]':'[data-param="'+control.key+'"]',field=page.locator(selector);assert.equal(await field.count(),1,control.key+' single control');assert(await field.isVisible(),control.key+' reachable');await field.scrollIntoViewIfNeeded();const box=await field.boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,control.key+' fits '+width);if(control.type==='range'&&control.key!=='modWheel'){const knob=page.locator('[data-knob="'+control.key+'"]');assert.equal(await knob.count(),1,control.key+' rotary control');assert.equal(await knob.getAttribute('role'),'slider');}}
        const fields=await page.evaluate(()=>{const state=HeirloomApp.getState();return HeirloomSchema.CONTROLS.filter(control=>control.type==='range').map(control=>{const field=document.querySelector('[data-param="'+control.key+'"]'),scale=Number(field.dataset.scale||1),offset=Number(field.dataset.offset||0);return {key:control.key,shown:Number(field.value),expected:state.synth[control.key]*scale+offset};});});for(const field of fields)assert(Math.abs(field.shown-field.expected)<.0001,field.key+' exact field uses its declared scale and offset');
        await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,'heirloom-'+width+'.png'),fullPage:true});widths.push(dimensions);
      }
      assert.match(await page.title(),/HEIRLOOM/);evidence.layouts={widths,controls:controls.length};return evidence.layouts;
    });
    await check('Knob drag, exact Hz, keyboard and one-step Undo preserve the panel state',async()=>{
      await page.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));const before=await page.evaluate(()=>HeirloomApp.getState().synth.cutoff);await exact(page,'[data-param="cutoff"]',1234);assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),1234);await page.locator('#undoButton').click();assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),before);await page.locator('#redoButton').click();assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),1234);
      const knob=page.locator('[data-knob="cutoff"]');await knob.scrollIntoViewIfNeeded();await knob.focus();await knob.press('End');const maximum=await page.evaluate(()=>HeirloomSchema.controls.cutoff.max);assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),maximum);await knob.press('Home');assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),await page.evaluate(()=>HeirloomSchema.controls.cutoff.min));await exact(page,'[data-param="cutoff"]',1500);
      const original=await page.evaluate(()=>HeirloomApp.getState().synth),box=await knob.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-24,{steps:5});await page.mouse.up();assert.notEqual(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),original.cutoff);await page.locator('#undoButton').click();assert.deepEqual(await page.evaluate(()=>HeirloomApp.getState().synth),original);
      await page.locator('[data-param="filterModel"]').selectOption('cem3320');assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.filterModel),'cem3320');await page.locator('[data-toggle="sync"]').click();assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.sync),!original.sync);await page.locator('#undoButton').click();assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.sync),original.sync);return {exactHz:1234,singleUndoDrag:true,filterFamilies:2};
    });
    await check('Presets and A/B copies retain an editable sound recipe',async()=>{
      await page.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));await page.locator('#modWheel').evaluate(element=>{element.value='.7';element.dispatchEvent(new Event('input',{bubbles:true}));});const available=await page.locator('#presetSelect option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean));assert(available.length>=2,'Complete musical starting points');await page.locator('#presetSelect').selectOption(available[1]);const expected=await page.evaluate(id=>HeirloomSchema.normalizeSynth({...HeirloomPresets.find(preset=>preset.id===id).synth,modWheel:HeirloomApp.getState().synth.modWheel}),available[1]);assert.deepEqual(await page.evaluate(()=>HeirloomApp.getState().synth),expected);
      await exact(page,'[data-param="cutoff"]',1100);await page.locator('[data-compare="B"]').click();await exact(page,'[data-param="cutoff"]',2200);await page.locator('[data-compare="A"]').click();assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),1100);await page.locator('#copyCompareButton').click();await page.locator('[data-compare="B"]').click();assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.cutoff),1100);assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.modWheel),.7);return {presets:available.length,compareCopy:true,physicalWheelRetained:true};
    });
    await check('Classic and extended LFO ranges update exact fields and knob bounds together',async()=>{
      await page.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));await page.locator('#calibrationPanel').evaluate(element=>element.open=true);const expanded=await page.evaluate(()=>HeirloomSchema.controls.lfoRange.options.find(option=>option.value!=='classic').value);await page.locator('[data-param="lfoRange"]').selectOption(String(expanded));await exact(page,'[data-param="lfoRate"]',100);assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.lfoRate),100);assert.equal(Number(await page.locator('[data-knob="lfoRate"]').getAttribute('aria-valuemax')),500);await page.locator('[data-param="lfoRange"]').selectOption('classic');assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.lfoRate),20);assert.equal(Number(await page.locator('[data-param="lfoRate"]').inputValue()),20);assert.equal(Number(await page.locator('[data-knob="lfoRate"]').getAttribute('aria-valuemax')),20);return {extendedMaximum:500,classicMaximum:20,clampedStateAndField:true};
    });
    await check('Coarse oscillator offsets and B fixed-frequency position stay faithful to their raw controls',async()=>{
      await page.evaluate(()=>{const state=heirloomQA.patch();Object.assign(state.synth,{aTune:24,bTune:24,bLow:false,bKeyboard:true});HeirloomApp.loadState(state);});
      assert.equal(Number(await page.locator('[data-param="aTune"]').inputValue()),0);assert.equal(Number(await page.locator('[data-knob="aTune"]').getAttribute('aria-valuenow')),24);await exact(page,'[data-param="aTune"]',12);assert.equal(await page.evaluate(()=>HeirloomApp.getState().synth.aTune),36);
      await page.locator('[data-toggle="bKeyboard"]').click();assert.equal(Number(await page.locator('[data-param="bTune"]').getAttribute('data-offset')),0);assert.equal(Number(await page.locator('[data-param="bTune"]').inputValue()),24);assert.equal(await page.evaluate(()=>HeirloomApp.engine.mode),'idle','Editing sound controls must not start audio');return {neutralRaw:24,neutralDisplay:0,octaveRaw:36,fixedBPosition:24};
    });
    await check('Variable note lengths and resize handles retain exact phrase durations',async()=>{
      await page.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));await page.locator('#patternDetails').evaluate(element=>element.open=true);const note=page.locator('#patternRoll [data-note-id]').first();await note.click();const id=await note.getAttribute('data-note-id');await exact(page,'#noteDuration',1.375);const current=await page.evaluate(id=>HeirloomApp.getState().pattern.notes.find(note=>note.id===id),id);assert.equal(current.duration,1.375);assert(await page.locator('#patternRoll [data-resize-note]').count()>0);const selected=page.locator('#patternRoll [data-note-id="'+id+'"]');await selected.focus();await selected.press('ArrowRight');await selected.press('ArrowRight');assert.equal(await page.evaluate(id=>document.activeElement?.dataset.noteId===id,id),true);assert.equal(await page.evaluate(id=>HeirloomApp.getState().pattern.notes.find(note=>note.id===id).beat,id),.5);
      await page.evaluate(async()=>{await HeirloomApp.engine.init();window.__qaPreviewCalls=0;window.__qaOriginalSchedule=HeirloomApp.engine.scheduleNote;HeirloomApp.engine.scheduleNote=function(...args){__qaPreviewCalls++;return __qaOriginalSchedule.apply(this,args);};});try{await selected.press('Enter');await selected.press('Space');await page.waitForFunction(()=>__qaPreviewCalls===2);assert.equal(await page.evaluate(()=>HeirloomApp.engine.isPlaying),false);}finally{await page.evaluate(()=>{HeirloomApp.engine.scheduleNote=__qaOriginalSchedule;HeirloomApp.panic();});}return {variableDuration:current.duration,keyboardMoves:2,keyboardAuditionOnly:true};
    });
    await check('Pattern notifications follow note and tempo edits without firing for sound-only knobs',async()=>{
      await page.evaluate(()=>{HeirloomApp.loadState(heirloomQA.patch());window.__qaPatternEvents=0;window.__qaPatternListener=()=>__qaPatternEvents++;document.addEventListener('musiclab:patternchange',__qaPatternListener);});
      try{await exact(page,'[data-param="cutoff"]',1500);assert.equal(await page.evaluate(()=>__qaPatternEvents),0);await page.locator('#patternDetails').evaluate(element=>element.open=true);await page.locator('#patternRoll [data-note-id]').first().click();await exact(page,'#noteDuration',1.625);await page.waitForFunction(()=>__qaPatternEvents===1);await exact(page,'[data-param="cutoff"]',1600);assert.equal(await page.evaluate(()=>__qaPatternEvents),1);await exact(page,'#tempo',117);await page.waitForFunction(()=>__qaPatternEvents===2);return {soundOnly:0,noteEdit:1,tempoEdit:1};}finally{await page.evaluate(()=>document.removeEventListener('musiclab:patternchange',__qaPatternListener));}
    });
    await check('Real live keys and fallback produce audio; Panic releases every voice',async()=>{
      const livePage=await pageFor(context,url);try{await livePage.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));assert.equal(await livePage.evaluate(()=>HeirloomApp.engine.context?.state||'idle'),'idle');const key=livePage.locator('#keyboard [data-note]').first();await key.scrollIntoViewIfNeeded();const keyBox=await key.boundingBox();await livePage.mouse.move(keyBox.x+keyBox.width/2,keyBox.y+keyBox.height*.8);await livePage.mouse.down();await livePage.waitForFunction(()=>HeirloomApp.engine.getMeters().peak>.0001);const live=await livePage.evaluate(()=>HeirloomApp.engine.getMeters());assert(live.voices>0&&live.voices<=5);await livePage.mouse.up();await livePage.locator('#panicButton').click();await livePage.waitForFunction(()=>HeirloomApp.engine.getMeters().voices===0);
      const fallback=await pageFor(context,url,{fallback:true});try{await fallback.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));await fallback.locator('#playButton').click();await fallback.waitForFunction(()=>HeirloomApp.engine.getMeters().peak>.0001);const result=await fallback.evaluate(()=>HeirloomApp.engine.getMeters());assert.equal(result.mode,'fallback');assert(result.voices>0&&result.voices<=5);await fallback.locator('#panicButton').click();return {worklet:live.mode,fallback:result.mode,voices:result.voices};}finally{await fallback.close();}}finally{await livePage.close();}
    });
    await check('Saved projects reopen the complete recipe and phrase without changing values',async()=>{
      const before=await page.evaluate(()=>HeirloomApp.getState()),download=page.waitForEvent('download');await page.locator('#saveButton').click();const saved=await download,bytes=fs.readFileSync(await saved.path()),parsed=JSON.parse(bytes);assert.deepEqual(parsed.state,before);await page.evaluate(()=>HeirloomApp.loadState(HeirloomSchema.defaultState()));await page.locator('#projectFile').setInputFiles({name:'browser.heirloom.json',mimeType:'application/json',buffer:bytes});await page.waitForFunction(expected=>JSON.stringify(HeirloomApp.getState())===JSON.stringify(expected),before);
      return {projectBytes:bytes.length,completeRoundTrip:true};
    });
    await check('Sixty-four-bar export metadata and explicit counts survive sound and note edits',async()=>{
      await page.evaluate(()=>{const state=heirloomQA.patch();state.tempo=240;state.synth.release=true;state.synth.ampRelease=.025;HeirloomApp.loadState(state);});const bars=page.locator('#exportBars');assert.equal(Number(await bars.getAttribute('max')),64);assert.equal(Number(await bars.inputValue()),1);assert.equal(await page.evaluate(()=>HeirloomApp.audioExport.maxBars),64);assert.equal(await page.evaluate(()=>HeirloomApp.audioExport.defaultBars),1);
      await exact(page,'#exportBars',65);assert.equal(Number(await bars.inputValue()),64);await exact(page,'[data-param="cutoff"]',1800);assert.equal(Number(await bars.inputValue()),64);await page.locator('#patternDetails').evaluate(element=>element.open=true);await page.locator('#patternRoll [data-note-id]').first().focus();await exact(page,'#noteDuration',1.5);assert.equal(Number(await bars.inputValue()),64);await page.locator('#patternBars').selectOption('2');assert.equal(Number(await bars.inputValue()),2);assert.equal(await page.evaluate(()=>HeirloomApp.audioExport.defaultBars),2);
      await exact(page,'#exportBars',64);await page.evaluate(()=>{const state=HeirloomApp.getState();state.pattern.lengthBeats=4;HeirloomApp.loadState(state);});assert.equal(Number(await bars.inputValue()),1);await exact(page,'#exportBars',64);await page.locator('#exportScope').selectOption('pattern');const before=await page.evaluate(()=>HeirloomApp.getState());let downloads=0;const observe=()=>downloads++;page.on('download',observe);
      await page.evaluate(()=>{window.__qaOriginalRenderWav=HeirloomApp.engine.renderWav;window.__qaExportRequest=null;HeirloomApp.engine.renderWav=async function(options){__qaExportRequest={bars:options.bars,scope:options.scope,tempo:options.state.tempo,release:options.state.synth.ampRelease};throw new DOMException('Metadata-only acceptance check','AbortError');};});
      try{await page.locator('#wavButton').click();await page.waitForFunction(()=>__qaExportRequest&&!document.getElementById('wavButton').disabled);const request=await page.evaluate(()=>__qaExportRequest);assert.deepEqual(request,{bars:64,scope:'pattern',tempo:240,release:.025});assert.equal(downloads,0);assert.deepEqual(await page.evaluate(()=>HeirloomApp.getState()),before);return {maximumBars:64,secondsAt240BPM:64,explicitCountPreserved:true,forwardedToRealExportHandler:true};}finally{page.off('download',observe);await page.evaluate(()=>{HeirloomApp.engine.renderWav=__qaOriginalRenderWav;});}
    });
    await check('Actual WAV download retains state and sound settings',async()=>{
      const before=await page.evaluate(()=>HeirloomApp.getState());await page.locator('#exportScope').selectOption('note');const wav=page.waitForEvent('download',{timeout:90000});await page.locator('#wavButton').click();const item=await wav,audio=fs.readFileSync(await item.path());assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.readUInt16LE(22),2);assert.equal(audio.readUInt32LE(24),48000);assert.equal(audio.readUInt16LE(34),16);assert(audio.length>44+48000*4);assert.deepEqual(await page.evaluate(()=>HeirloomApp.getState()),before);return {wavBytes:audio.length,wavSampleRate:48000};
    });
    await check('Cancel render stops the real WAV operation without downloading or changing the recipe',async()=>{
      await page.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));await page.locator('#exportScope').selectOption('pattern');await page.locator('#exportBars').fill('16');const before=await page.evaluate(()=>HeirloomApp.getState());let downloads=0;const observe=()=>downloads++;page.on('download',observe);
      try{await page.locator('#wavButton').click();await page.locator('#cancelExportButton').waitFor({state:'visible'});await page.locator('#cancelExportButton').click();await page.waitForFunction(()=>document.getElementById('cancelExportButton').hidden&&!document.getElementById('wavButton').disabled);await page.waitForTimeout(150);assert.equal(downloads,0);assert.deepEqual(await page.evaluate(()=>HeirloomApp.getState()),before);assert.match(await page.locator('#status').textContent(),/cancel/i);return {downloads:0,stateUnchanged:true};}finally{page.off('download',observe);}
    });
    await check('Shared Samples dialog preserves natural thirty-second tails and explicit zero-tail rendering',async()=>{
      await page.evaluate(()=>{const state=heirloomQA.patch();state.synth.release=true;state.synth.ampRelease=30;HeirloomApp.loadState(state);});const before=await page.evaluate(()=>HeirloomApp.getState());await page.locator('[data-musiclab-exchange="heirloom"]').click();const dialog=page.locator('.ml-ex-dialog');await dialog.waitFor({state:'visible'});await dialog.locator('[data-tab="send"]').click();const tail=dialog.locator('[name="tail"]');assert.equal(Number(await tail.getAttribute('max')),30);assert.equal(Number(await tail.inputValue()),30);await dialog.locator('[name="scope"]').selectOption('pattern');await dialog.locator('[name="bars"]').fill('1');await tail.fill('0');await dialog.locator('[data-action="render"]').click();await dialog.locator('.ml-ex-rendered').waitFor({state:'visible',timeout:90000});const download=page.waitForEvent('download');await dialog.locator('[data-action="wav"]').click();const item=await download,bytes=fs.readFileSync(await item.path()),rate=bytes.readUInt32LE(24),channels=bytes.readUInt16LE(22),frames=bytes.readUInt32LE(40)/(channels*2);assert(Math.abs(frames-rate*2)<=1,'Explicit zero tail retains the two-second body within one browser-resampled frame');assert.equal(channels,2);assert.deepEqual(await page.evaluate(()=>HeirloomApp.getState()),before);await dialog.locator('[data-action="close"]').click();return {maximumTail:30,naturalDefault:30,explicitTail:0,bodySeconds:2,sampleRate:rate,frames,resampledFrameRounding:frames-rate*2};
    });
  }finally{await context.close();}
}
async function midiChecks(url) {
  const context=await contextFor(url),page=await pageFor(context,url,{midi:true});
  try {
    await check('MIDI note ownership, sustain, wheels, velocity-zero and disconnect remain usable',async()=>{
      await page.evaluate(()=>HeirloomApp.loadState(heirloomQA.patch()));await page.locator('#midiButton').click();await page.waitForFunction(()=>typeof __qaMidiInput.onmidimessage==='function'||__qaMidiInput.listenerCount('midimessage')>0);
      await page.evaluate(()=>__qaMidiInput.send([0x90,60,110]));await page.waitForFunction(()=>HeirloomApp.engine.getMeters().voices>0);
      await page.evaluate(()=>{__qaMidiInput.send([0xB0,64,127]);__qaMidiInput.send([0x80,60,0]);});await page.waitForTimeout(100);assert((await page.evaluate(()=>HeirloomApp.engine.getMeters().voices))>0,'Sustain keeps released MIDI key audible');
      await page.evaluate(()=>__qaMidiInput.send([0xB0,64,0]));await page.waitForFunction(()=>HeirloomApp.engine.getMeters().voices===0);
      await page.evaluate(()=>{__qaMidiInput.send([0x90,64,100]);__qaMidiInput.send([0x90,64,0]);});await page.waitForFunction(()=>HeirloomApp.engine.getMeters().voices===0);
      await page.evaluate(()=>{__qaMidiInput.send([0xB0,1,96]);__qaMidiInput.send([0xE0,127,127]);});assert(Number(await page.locator('#modWheel').inputValue())>.7);assert(Number(await page.locator('#pitchBend').inputValue())>.99);
      await page.evaluate(()=>{__qaMidiInput.send([0xE0,0,64]);window.__qaOtherToken=HeirloomApp.engine.noteOn({pitch:55,velocity:.8,source:'browser-other'});__qaMidiInput.send([0x90,72,110]);});await page.waitForFunction(()=>HeirloomApp.engine.getMeters().voices>=2);await page.evaluate(()=>{__qaMidiInput.state='disconnected';__qaMidiInput.emit('statechange',{port:__qaMidiInput});__qaMidiAccess.emit('statechange',{port:__qaMidiInput});});await page.waitForFunction(()=>HeirloomApp.engine.getMeters().voices===1);await page.waitForFunction(()=>!__qaMidiInput.onmidimessage&&__qaMidiInput.listenerCount('midimessage')===0);await page.evaluate(()=>HeirloomApp.engine.noteOff(__qaOtherToken));await page.waitForFunction(()=>HeirloomApp.engine.getMeters().voices===0);await page.locator('#panicButton').click();return {device:'fake MIDI input',sustain:true,velocityZero:true,wheels:true,disconnectOwnership:true};
    });
  }finally{await context.close();}
}
async function hostChecks(url) {
  if(!hasGalley&&!process.env.HEIRLOOM_HOST_URL){evidence.hostSkipped='GALLEY is not included in the standalone instrument source archive';return;}
  const hostURL=process.env.HEIRLOOM_HOST_URL||new URL('../loom/index.html',url).href,context=await contextFor(url),page=await context.newPage();
  try {
    await page.goto(hostURL,{waitUntil:'load'});await page.waitForFunction(()=>window.LoomApp&&window.LoomNoteRenderer,null,{timeout:60000});
    const source=await page.evaluate(async({url,built})=>{const html=await(await fetch(url)).text();if(!window.LoomEmbeddedInstruments?.heirloom)throw Error('GALLEY is missing its HEIRLOOM bundle');if(built&&LoomEmbeddedInstruments.heirloom!==html)throw Error('GALLEY embeds a stale HEIRLOOM standalone');if(!built)LoomEmbeddedInstruments.heirloom=html;return {built,sourceOverlay:!built,embeddedCharacters:html.length};},{url,built:Boolean(process.env.HEIRLOOM_QA_BUILT)});evidence.hostSource=source;
    await page.evaluate(async()=>{await LoomApp.loadState(LoomSchema.defaultState());await LoomApp.engine.applyAudioSettings({sampleRate:'44100'});const parent=await LoomApp.engine.init();await parent.resume();LoomApp.engine.panic();});
    await check('Two actual GALLEY instances keep live notes, cancellation and parent context ownership separate',async()=>{
      const report=await page.evaluate(async()=>{
        const app=LoomApp,state=LoomSchema.defaultState();if(state.tracks.length!==8||state.tracks.some(track=>track.effects.length!==5)||state.master.effects.length!==4||state.returns.some(bus=>bus.effects.length!==4))throw Error('Expected eight5-slot tracks and4-slot buses');await app.loadState(state);await app.engine.applyAudioSettings({sampleRate:'44100'});const parent=await app.engine.init();await parent.resume();
        const frames=[document.createElement('iframe'),document.createElement('iframe')];frames.forEach(frame=>document.body.append(frame));
        try{
          await app.host.load('track-1',{id:'heirloom',name:'HEIRLOOM'},frames[0]);await app.host.load('track-2',{id:'heirloom',name:'HEIRLOOM'},frames[1]);await app.host.command('track-1','prepare');await app.host.command('track-2','prepare');app.engine.resumeAudition('track-1');app.engine.resumeAudition('track-2');
          const first=frames[0].contentWindow.HeirloomApp,second=frames[1].contentWindow.HeirloomApp,a=first.getState(),b=second.getState(),facades=[first.engine.context,second.engine.context];a.synth.cutoff=1100;b.synth.cutoff=4200;first.loadState(a);second.loadState(b);const when=parent.currentTime+.08;
          async function assertUnloaded(engine,facade){for(let attempt=0;attempt<40&&!engine._disposed;attempt++)await new Promise(resolve=>setTimeout(resolve,25));if(!engine._disposed||engine.node||engine.context)throw Error('Host unload must complete child pagehide disposal after its facade closes');if(facade.state!=='closed')throw Error('Unloaded child facade must be closed');if(parent.state==='closed')throw Error('Child unload closed the parent context');}
          await app.host.scheduleNote('track-1',{pitch:60,velocity:.8,when,durationSeconds:.9,source:'browser-instance-a'});await app.host.scheduleNote('track-2',{pitch:67,velocity:.8,when,durationSeconds:.9,source:'browser-instance-b'});await new Promise(resolve=>setTimeout(resolve,240));
          let live;for(let attempt=0;attempt<16;attempt++){live={a:first.engine.getMeters(),b:second.engine.getMeters(),mix:app.engine.getMeters()};if(live.a.peak>.0001&&live.b.peak>.0001&&live.mix.tracks[0].peak>.0001&&live.mix.tracks[1].peak>.0001)break;await new Promise(resolve=>setTimeout(resolve,25));}if(first.engine.context.__loomRawContext!==parent||second.engine.context.__loomRawContext!==parent)throw Error('Both native instruments must route through parent context');if(first.engine.isPlaying||second.engine.isPlaying)throw Error('Incoming notes started autonomous native phrase');
          await app.host.cancelNotes('track-1',{source:'browser-instance-a',when:parent.currentTime});await new Promise(resolve=>setTimeout(resolve,80));app.host.unload('track-1');await assertUnloaded(first.engine,facades[0]);const after={context:parent.state,bState:second.getState(),b:second.engine.getMeters()};app.host.unload('track-2');await assertUnloaded(second.engine,facades[1]);return {parentRate:parent.sampleRate,live,after,distinctPatches:a.synth.cutoff!==b.synth.cutoff,disposedEngines:2,closedFacades:2};
        }finally{app.host.unload('track-1');app.host.unload('track-2');frames.forEach(frame=>frame.remove());app.engine.panic();}
      });
      assert.equal(report.parentRate,44100);assert(report.live.a.peak>.0001&&report.live.b.peak>.0001);assert.equal(report.live.a.mode,'worklet');assert.equal(report.live.b.mode,'worklet');assert(report.live.mix.tracks[0].peak>.0001&&report.live.mix.tracks[1].peak>.0001);assert.equal(report.after.bState.synth.cutoff,4200);assert(report.after.b.voices>0);assert(report.distinctPatches);assert.equal(report.disposedEngines,2);assert.equal(report.closedFacades,2);evidence.hostInstances=report;return {parentRate:44100,instances:2,contextPreserved:true,disposedEngines:2,closedFacades:2};
    });
    await check('GALLEY prints exact48k source frames under44.1k parent and restores variable-length note source',async()=>{
      const setup=await page.evaluate(async()=>{
        const app=LoomApp,state=LoomSchema.defaultState();state.tempo=120;state.loopEnabled=false;const frame=document.createElement('iframe');document.body.append(frame);
        let snapshot;try{await app.host.load('track-3',{id:'heirloom'},frame);const child=frame.contentWindow,patch=child.HeirloomSchema.defaultState();Object.assign(patch.synth,{cutoff:1733,filterModel:'cem3320',vintage:0,noiseLevel:0,ampAttack:.003,ampRelease:.025,filterRelease:.025});child.HeirloomApp.loadState(patch);snapshot=await app.host.snapshot('track-3');}finally{app.host.unload('track-3');frame.remove();}
        const pattern=MusicLabPatternSchema.normalize({format:'musiclab-pattern',version:1,name:'HEIRLOOM exact print',sourceApp:'heirloom',kind:'notes',tempo:120,swing:0,lengthBeats:4,meter:[4,4],seed:29,voices:[{id:'synth',name:'HEIRLOOM',pitch:60}],notes:[{id:'later',voice:'synth',pitch:60,beat:1,duration:.75,velocity:.8,probability:1},{id:'last',voice:'synth',pitch:67,beat:2.75,duration:1.25,velocity:.85,probability:1}]});state.tracks[0].instrument={id:'heirloom',name:'HEIRLOOM',snapshot};state.tracks[0].clips=[{id:'heirloom-browser-print',name:pattern.name,type:'notes',pattern,voiceMap:{synth:'synth'},start:0,length:4,sourceOffset:0,rate:1,loop:false,gain:1,fadeIn:0,fadeOut:0,transpose:0}];await app.loadState(state);app.selectClip('heirloom-browser-print');return {pattern,original:app.getState().tracks[0].clips[0],snapshot};
      });
      await page.locator('#printNoteClipButton').click();await page.waitForFunction(()=>LoomApp.getState().tracks[0].clips[0].type==='audio',null,{timeout:120000});
      const printed=await page.evaluate(()=>{const state=LoomApp.getState(),clip=state.tracks[0].clips[0],asset=state.assets.find(asset=>asset.id===clip.assetId),decoded=LoomSchema.decodeAsset(asset);let peak=0,first=-1,early=0,nonfinite=0;for(let i=0;i<decoded.left.length;i++){const value=Math.max(Math.abs(decoded.left[i]),Math.abs(decoded.right[i]));if(!Number.isFinite(value))nonfinite++;peak=Math.max(peak,value);if(i<24000-2)early=Math.max(early,value);if(first<0&&value>1e-5)first=i;}const restored=LoomSchema.parseProject(LoomSchema.serializeProject(state));return {clip,asset:{frames:asset.frames,sampleRate:asset.sampleRate,duration:asset.duration},peak,first,early,nonfinite,portableOrigin:restored.tracks[0].clips[0].origin,parentRate:LoomApp.engine.context.sampleRate};});
      assert.equal(printed.parentRate,44100);assert.equal(printed.asset.sampleRate,48000);assert.equal(printed.asset.frames,96000);assert.equal(printed.asset.duration,2);assert(printed.peak>.001&&printed.early<1e-5);assert(printed.first>=24000-2&&printed.first<25440);assert.equal(printed.nonfinite,0);assert.deepEqual(printed.clip.origin.pattern,setup.pattern);assert.deepEqual(printed.portableOrigin,printed.clip.origin);
      await page.locator('#editSourceButton').click();await page.waitForFunction(()=>!!LoomApp.noteWorkflow.sourceEdit);const source=await page.evaluate(()=>{const record=LoomApp.host.records.get('track-1');return {patch:record.iframe.contentWindow.HeirloomApp.getState(),pattern:record.iframe.contentWindow.HeirloomApp.getState().pattern,parent:LoomApp.engine.context.state};});assert.equal(source.patch.synth.cutoff,1733);assert.equal(source.patch.synth.filterModel,'cem3320');assert.deepEqual(source.pattern.notes,setup.pattern.notes);assert.equal(source.pattern.lengthBeats,setup.pattern.lengthBeats);assert.equal(source.pattern.swing,setup.pattern.swing);assert.notEqual(source.parent,'closed');await page.locator('#closeInstrument').click();await page.locator('#restoreNotesButton').click();await page.waitForFunction(()=>LoomApp.getState().tracks[0].clips[0].type==='notes');assert.deepEqual(await page.evaluate(()=>LoomApp.getState().tracks[0].clips[0]),setup.original);evidence.print=printed;return {parentRate:44100,sourceRate:48000,frames:96000,firstFrame:printed.first,sourceRestored:true};
    });
  }finally{await page.evaluate(()=>LoomApp?.engine.dispose()).catch(()=>{});await context.close();}
}
(async()=>{
  const url=process.argv[2]||process.env.HEIRLOOM_QA_URL||await serve();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  try{for(const phase of(process.env.HEIRLOOM_QA_PHASES||'engine,ui,midi,host').split(',')){if(phase==='engine')await engineChecks(url);else if(phase==='ui')await uiChecks(url);else if(phase==='midi')await midiChecks(url);else if(phase==='host')await hostChecks(url);else throw Error('Unknown phase '+phase);}assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(external,[],'No external requests');evidence.release={built:Boolean(process.env.HEIRLOOM_QA_BUILT),htmlSha256:servedHTML?createHash('sha256').update(servedHTML).digest('hex'):null};fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({url,passed,evidence,errors,external},null,2)+'\n');console.log('HEIRLOOM browser: '+passed.length+' groups passed. '+artifacts);}
  finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{fs.writeFileSync(path.join(artifacts,'failure.json'),JSON.stringify({message:error.stack||String(error),passed,evidence,errors,external},null,2)+'\n');console.error(error);process.exitCode=1;});
