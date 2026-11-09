'use strict';
/* PCM preservation for common clip interpolation, SERVICE control boundaries
 * and rolling microphone history. Expected results come only from released
 * 1.42.1 (5df579e); ordinary checks need no Git or browser.
 */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {createHash}=require('node:crypto');
const BASELINE='5df579ee99caa7a73222f8d6a52268be4cab3c75';
const P=require('./performance-142-checks.cjs');
const FROZEN=/* BASELINE-BEGIN */ {
  "baseline": "5df579ee99caa7a73222f8d6a52268be4cab3c75",
  "fixtures": "c8c762ffbe328a30b748be1eed94a18415572fb6a9826070b76827d209a5553b",
  "cases": {
    "clip-region-interpolation-48-paths": "b70bb3eed9e7dcfb809cf2482e19b30f5ad462a2567c561c5e72c0e750098755",
    "arrangement/1": "35209bb20b16787b45b1f8248517a4baaf396b46b747d4fef949965e059e7d20",
    "service/1": "d6c05df7f38ffc9b35ed16b590de2f1519d0e1d401d312fd4c68ad7a7497bb9d",
    "arrangement/17": "35209bb20b16787b45b1f8248517a4baaf396b46b747d4fef949965e059e7d20",
    "service/17": "d6c05df7f38ffc9b35ed16b590de2f1519d0e1d401d312fd4c68ad7a7497bb9d",
    "arrangement/128": "35209bb20b16787b45b1f8248517a4baaf396b46b747d4fef949965e059e7d20",
    "service/128": "d6c05df7f38ffc9b35ed16b590de2f1519d0e1d401d312fd4c68ad7a7497bb9d",
    "arrangement/137": "35209bb20b16787b45b1f8248517a4baaf396b46b747d4fef949965e059e7d20",
    "service/137": "d6c05df7f38ffc9b35ed16b590de2f1519d0e1d401d312fd4c68ad7a7497bb9d",
    "microphone-history/17": "ece48bd97627f2cdf57a52d705d5ec1052bf3fb12490b175fc4818456b936f8e:525",
    "microphone-history/128": "da34fb16d1e557afb6cbb933b854e6c152b09bd2957b69caf9dc6aa97ce80948:858",
    "microphone-history/4097": "a7b30d670fa63f1e2f1d2ced30cf3021f4ceb925b0206d941c804bc215862022:9699"
  }
} /* BASELINE-END */;
const sha=parts=>{const h=createHash('sha256');for(const p of parts)h.update(p);return h.digest('hex');};
const pcm=channels=>sha(channels.map(c=>Buffer.from(c.buffer,c.byteOffset,c.byteLength)));
function source(){const n=1031;return[0,1].map(ch=>Float32Array.from({length:n},(_,i)=>i===8&&ch===0?-0:Math.sin(i*.17+ch*.31)*.13+Math.cos(i*.053)*.07));}
function stateFor(r){const state=r.S.defaultState();state.tempo=137;state.lengthBars=1;state.loopEnabled=true;state.loopStart=.25;state.loopEnd=.375;for(const owner of[...state.tracks,...state.buses,...state.returns,state.master]){owner.effects.fill(null);owner.automation=[];}state.tracks.forEach((t,i)=>{t.disabled=i>=3;t.instrumentLive=false;t.output=i===1?'bus-1':'master';t.sends=i===2?[.17,.09]:[0,0];t.eq={low:1,lowMid:-.7,highMid:.8,high:0,lowMidFreq:390,highMidFreq:2700};t.clips=i>=3?[]:[{id:'clip-'+i,type:'audio',assetId:'asset',start:0,length:2,sourceStart:.002013,sourceEnd:.017021,sourceOffset:.00131,rate:[.999,1.001,2.37][i],reverse:i===1,loop:true,gain:.7,fadeIn:0,fadeOut:0}];});return state;}
function capture(r){const result={},samples=source(),asset={left:samples[0],right:samples[1],sampleRate:48000};
 const direct=[];
 for(const reverse of[false,true])for(const loop of[false,true])for(const rate of[.125,.999,1,1.001,2.37,8])for(const edge of[0,.000013]){
  const item=r.DSP.ClipPlayback.compile({start:.23,length:8,sourceStart:.002+edge,sourceEnd:.017+edge,sourceOffset:.00131,rate,reverse,loop,gain:.71,fadeIn:.013,fadeOut:.003},asset),pair=[0,0],data=new Float64Array(1024);
  for(let i=0;i<512;i++){r.DSP.ClipPlayback.read(item,.23+(i-7)*.00037,.5,pair);data[i*2]=pair[0];data[i*2+1]=pair[1];}direct.push(Buffer.from(data.buffer));
 }
 result['clip-region-interpolation-48-paths']=sha(direct);
 for(const block of[1,17,128,137])for(const service of[false,true]){
  const state=stateFor(r),core=new r.DSP.Core(state,{asset},48000),frames=8193,audio=[new Float32Array(frames),new Float32Array(frames)];
  if(service)core.startService({clips:state.tracks.map(t=>t.clips[0]||null)},.249);else core.start(.249);
  const edits=service?[17,95,2027,4091]:[33,1597,3079,6143];let at=0,event=0;
  while(at<frames){if(at===edits[event]){if(service){const changes=[{overrides:[{trackId:'track-1',target:'eq:lowMid',value:4}]},{overrides:[{trackId:'track-1',target:'eq:lowMidFreq',value:870}]},{stutterBeats:.125,fill:true,overrides:[{trackId:'track-1',target:'eq:high',value:-3}]},{overrides:[]}];core.queueService('performance',changes[event],'immediate',event+1);}else if(event===0)core.seek(.311);else if(event===1)core.stop();else if(event===2)core.start(.249);else {const next=r.S.copy(state);next.tracks[1].mute=true;next.tracks[2].output='bus-2';core.setState(next);}event++;}
   const end=Math.min(frames,at+block,edits[event]??Infinity);core.renderRealtime(audio[0].subarray(at,end),audio[1].subarray(at,end));at=end;
  }
  result[(service?'service':'arrangement')+'/'+block]=pcm(audio);
 }
 for(const n of[17,128,4097]){
  const rec=new r.DSP.Recorder(8000,()=>{},()=>{}),input=source();
  rec._rememberMicrophone(input,Math.min(1031,n));rec._rememberMicrophone([],n);rec._rememberMicrophone([input[1]],377);rec._rememberMicrophone(null,n);rec._rememberMicrophone([undefined,input[0]],97);
  result['microphone-history/'+n]=pcm(rec.microphoneHistory)+':'+rec.microphoneClock;
 }
 return result;
}
function immutable(){const file=path.join(__dirname,'performance-142-checks.cjs'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;const source=fs.readFileSync(file,'utf8').replace("const BASELINE = '244ab5b41d14e42c8a588aea9a180725d0b71cba';",'const BASELINE = '+JSON.stringify(BASELINE)+';');mod._compile(source,file);return mod.exports.load(BASELINE);}
if(process.argv.includes('--capture-baseline')){const value={baseline:BASELINE,fixtures:sha([capture.toString(),stateFor.toString(),source.toString()]),cases:capture(immutable())};const text=fs.readFileSync(__filename,'utf8');assert(text.includes('/* BASELINE-BEGIN */'));fs.writeFileSync(__filename,text.replace(/\/\* BASELINE-BEGIN \*\/[\s\S]*?\/\* BASELINE-END \*\//,'/* BASELINE-BEGIN */ '+JSON.stringify(value,null,2)+' /* BASELINE-END */'));console.log('Captured immutable 1.42.1 preservation fixtures.');}
else {assert.equal(FROZEN?.baseline,BASELINE,'Immutable baseline capture is required.');assert.equal(FROZEN.fixtures,sha([capture.toString(),stateFor.toString(),source.toString()]),'Preservation scenarios must stay fixed.');const actual=capture(P.load());for(const[name,expected]of Object.entries(FROZEN.cases))assert.equal(actual[name],expected,name+' preserves released PCM/history');console.log('Playback stability: '+Object.keys(actual).length+' immutable audio/history fixture groups passed.');}
