'use strict';
// Protocol tests deliberately use a fake transport. Real neural inference and
// voice quality are checked by the separate actual-Chromium instrument suite.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let posts=0;
class ProtocolWorker{
 constructor(){this.closed=false;setTimeout(()=>{if(!this.closed)this.onmessage?.({data:{ready:true,backend:'kitten-tts-nano-0.8-int8'}});},1);}
 postMessage(job){posts++;setTimeout(()=>{if(!this.closed)this.onmessage?.({data:{id:job.id,result:{left:Float32Array.of(.1,.2,-.1),sampleRate:24000,backend:'kitten-tts-nano-0.8-int8',voice:job.voice,text:job.text}}});},15);}
 terminate(){this.closed=true;}
}
const scope={window:null,console,Blob,URL,Float32Array,DOMException,setTimeout,clearTimeout,Worker:ProtocolWorker,MorselSpeechAssets:{backend:'kitten-tts-nano-0.8-int8'}};scope.window=scope;vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../speech-source.js'),'utf8'),scope);
const S=scope.MorselSpeech;
(async()=>{
 assert.equal(S.backend,'kitten-tts-nano-0.8-int8');assert.equal(S.sampleRate,24000);assert.deepEqual(Array.from(S.voices),['alto','tenor','bass','robot']);assert.equal(S.profiles[3].name,'Soprano');
 for(const value of ['',null,'a'.repeat(161)])await assert.rejects(S.render(value));
 await assert.rejects(S.render('hello',{voice:'unknown'}));await assert.rejects(S.render('hello',{speed:NaN}));
 console.log('PASS neural metadata, four stable speaker identities and invalid text/controls reject before preparation');
 const prepare=scope.MorselSpeechDSP.prepareText;
 assert.equal(prepare('I','ˈaɪ').text,'I,');assert.equal(prepare('I','ˈaɪ').phonemes,'ˈaɪ,');assert.equal(prepare('I','ˈaɪ').styleIndex,2);
 assert.equal(prepare('love.','lˈʌv.').phonemes,'lˈʌv.');assert.equal(prepare('love.').text,'love.');
 assert.equal(prepare('a'.repeat(160)).styleIndex,161);assert.equal(prepare('é🙂').styleIndex,3);
 console.log('PASS bare words, terminal punctuation, max-length and Unicode text match upstream prosodic/style preparation');
 const trim=scope.MorselSpeechDSP.trimPadding, short=new Float32Array(4000), love=new Float32Array(5400), padded=new Float32Array(20000);
 for(let i=300;i<short.length-200;i++)short[i]=.2*Math.sin(i*.07);
 for(let i=400;i<love.length-50;i++)love[i]=.2*Math.sin(i*.07);
 for(let i=200;i<8000;i++)padded[i]=.2*Math.sin(i*.07);
 assert(trim(short,24000).left.length>3000,'A valid under5000-frame word must not become empty');
 assert(trim(love,24000).left.length>5000,'A5400-frame word must not lose93percent to a fixed5000-frame cut');
 const clean=trim(padded,24000);assert(clean.left.length>=8000&&clean.left.length<9000);assert(clean.trimmedEnergyFraction<=.001);
 assert.throws(()=>trim(new Float32Array(100),24000),/produce a sound/);
 console.log('PASS short-word padding preserves speech below5000frames and only removes measured quiet tails');
 const first=await S.render('hello',{voice:'alto'});first.left[0]=9;const count=posts;const again=await S.render('hello',{voice:'alto',pitch:72});assert(Math.abs(again.left[0]-.1)<1e-6);assert.equal(posts,count,'raw natural word cache is independent of musical note pitch');
 console.log('PASS natural raw utterances have detached caches and musical pitch does not duplicate inference');
 const abort=new AbortController(),pending=S.render('pending',{signal:abort.signal});setTimeout(()=>abort.abort(),2);await assert.rejects(pending,{name:'AbortError'});
 const closing=S.render('closing');setTimeout(()=>S.dispose(),2);await assert.rejects(closing,{name:'AbortError'});assert.equal(S.ready,false);await S.prepare();assert.equal(S.ready,true);await S.render('restarted');S.dispose();
 console.log('PASS queued cancellation, disposal and re-preparation cannot deliver stale worker results');
})().catch(error=>{S.dispose();console.error(error);process.exitCode=1;});
