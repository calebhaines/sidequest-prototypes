'use strict';
// Actual bundled-model regression: no fake inference, external model requests,
// operating-system voices or fixed padding assumptions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),errors=[],requests=[];
const server=http.createServer((request,response)=>{
 const pathname=new URL(request.url,'http://local').pathname;
 if(pathname==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta charset="utf-8"><script src="/vendor/speech-assets.js"></script><script src="/speech-source.js"></script>');return;}
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end('missing');return;}
 response.setHeader('Content-Type','text/javascript');fs.createReadStream(file).pipe(response);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(120000);page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{const url=request.url();if(!url.startsWith('http://127.0.0.1:')&&!url.startsWith('blob:')&&!url.startsWith('data:'))requests.push(url);});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.MorselSpeech);
  await page.evaluate(()=>MorselSpeech.prepare());
  const rows=[],failures=[];
  for(const voice of ['alto','tenor','bass','robot'])for(const text of ['a','I','the','love','sing','kitchen']){
   const row=await page.evaluate(async({voice,text})=>{
    const audio=await MorselSpeech.render(text,{voice});let peak=0,power=0;
    for(const sample of audio.left){if(!Number.isFinite(sample))throw Error('Nonfinite neural PCM');peak=Math.max(peak,Math.abs(sample));power+=sample*sample;}
    return{voice,text,frames:audio.left.length,sourceFrames:audio.sourceFrames,trimmedFrames:audio.trimmedFrames,trimmedEnergyFraction:audio.trimmedEnergyFraction,rate:audio.sampleRate,peak,rms:Math.sqrt(power/audio.left.length),backend:audio.backend};
   },{voice,text});
   assert.equal(row.backend,'kitten-tts-nano-0.8-int8');assert.equal(row.rate,24000);
   assert(row.frames>=Math.min(row.sourceFrames,768),'Valid short word must retain a usable span: '+JSON.stringify(row));
   if(!(row.peak>.01&&row.rms>.002))failures.push(row);
   assert(row.trimmedEnergyFraction<=.001001,'Only measured quiet tail energy can be discarded: '+JSON.stringify(row));
   assert.equal(row.trimmedFrames,row.sourceFrames-row.frames);rows.push(row);console.log('PASS '+JSON.stringify(row));
  }
  await page.evaluate(()=>MorselSpeech.dispose());assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  assert.deepEqual(failures,[],'Every actual short word must remain audible');
  console.log(JSON.stringify({passed:rows.length,errors,externalRequests:requests}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
