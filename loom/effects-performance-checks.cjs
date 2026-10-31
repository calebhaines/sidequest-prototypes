'use strict';
/* Exact-audio guards for the effect CPU changes. Fixtures are recorded ONLY
 * from immutable released 1.25 sources (47d210f), never the working tree.
 * The frozen hashes also run from an extracted source ZIP without Git.
 * node loom/effects-performance-checks.cjs --record-release regenerates those
 * original-release fixtures; normal execution never changes the fixture file.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const RELEASE='47d210f95124c54ba5aa4a87f4370986963f32c6';
const TYPES=['prism','velvet','cinder','undertow','parallax','vestige','halo','tremor','broiler','glaze','scales','strainer','swirl','crumble','saute','preserve'];
const MODULES=['vocal-dsp.js','utility-dsp.js','filter-dsp.js','creative-dsp.js','broiler-pedals.js','compressor-dsp.js','preamp-dsp.js','tape-dsp.js','char-dsp.js','effects.js'];
const FACTORIES=['createLoomVocalDSP','createLoomUtilityDSP','createLoomFilterDSP','createLoomCreativeDSP','createLoomBroilerPedalsDSP','createLoomCompressorDSP','createLoomPreampDSP','createLoomTapeDSP','createLoomCharDSP'];
const AUTOMATE={prism:'cutoff',velvet:'threshold',cinder:'drive',undertow:'depth',parallax:'time',vestige:'decay',halo:'semitones',tremor:'depth',broiler:'drive',glaze:'threshold',scales:'input',strainer:'cutoff',swirl:'center',crumble:'bits',saute:'drive',preserve:'drive'};
const fixtureFile=path.join(__dirname,'effects-performance-fixtures.json');
const digest=value=>createHash('sha256').update(value).digest('hex');
function load(released=false){
  const scope={},hashes={};scope.window=scope;scope.globalThis=scope;
  for(const name of MODULES){
    const source=released?execFileSync('git',['show',RELEASE+':loom/'+name],{cwd:path.resolve(__dirname,'..'),maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}).toString():fs.readFileSync(path.join(__dirname,name),'utf8');
    hashes[name]=digest(source);Function('window','globalThis',source+'\n//# sourceURL=effect-cpu-'+(released?'released-':'working-')+name)(scope,scope);
  }
  return {E:scope.createLoomEffectsDSP(...FACTORIES.map(name=>scope[name])),hashes};
}
function cases(E){
  const result=[],add=(id,type,patch={},extra={})=>result.push({id,type,patch,rate:48000,frames:4096,...extra});
  for(const type of TYPES)for(const rate of [8000,48000,96000,192000])add('default/'+type+'/'+rate,type,{}, {rate,frames:3072});
  for(const stages of ['4','8','12'])for(const shape of ['sine','triangle'])add('swirl/'+stages+'/'+shape,'swirl',{stages,shape,depth:48,spread:2.4,stereo:137,envAmount:19,feedback:.6,clock:'free',output:-4},{frames:8192});
  add('swirl/static-coefficients','swirl',{depth:0,spread:1.7,envAmount:0,feedback:.4,output:-3},{frames:8192});
  for(const stereo of ['linked','independent'])for(const prefilter of ['raw','soft'])add('crumble/'+stereo+'/'+prefilter,'crumble',{stereo,prefilter,bits:6.75,sampleRate:4781,jitter:.7,dither:.55,drive:9,tone:4500,transient:.8,output:-8},{frames:8192});
  for(const model of E.specifications.strainer.model)for(const envMode of ['peak','rms'])add('strainer/'+model+'/'+envMode,'strainer',{model,envMode,slope:'24',cutoff:1877,resonance:.92,envAmount:-39,lfoAmount:23,stereo:.7,phase:97,shape:'samplehold',clock:'sync',division:'1/32',drive:12,output:-10},{frames:8192});
  add('strainer/static-coefficients','strainer',{cutoff:2371,lfoAmount:0,envAmount:0,drive:0,output:-3},{frames:8192});
  for(const model of E.specifications.broiler.model)add('broiler/'+model,'broiler',{model,drive:18,bias:.31,voltage:1.13,feedback:.47,tightness:.73,bright:.21,coupling:.41,cathode:.66,transformer:.19,powerScale:.83,output:-16},{frames:8192});
  for(const note of [110,440,1760])add('scales/analysis/'+note,'scales',{tuner:'on',input:-2,tunerChannel:'auto'},{frames:24000,tonal:note});
  for(const model of E.specifications.preserve.model)add('preserve/transport/'+model,'preserve',{model,drive:9,warmth:.6,wear:.3,noise:.2,dropouts:.6,wow:.7,flutter:.4,stereoLink:.7,output:-9},{frames:32000});
  for(const model of E.specifications.saute.model)add('saute/'+model,'saute',{model,drive:16,bias:.37,feedback:.81,transformer:.65,colour:.8,lowGain:3,highGain:-2,lowCut:30,highCut:17000,output:-10});
  for(const model of E.specifications.velvet.model)for(const bandMode of ['full','multiband'])add('butter/'+model+'/'+bandMode,'velvet',{model,bandMode,input:3,makeup:-1,threshold:-26,ratio:5,colour:.6,link:.73,lowThreshold:-40,midThreshold:-33,highThreshold:-28,lowRatio:3,midRatio:6,highRatio:9,lowGain:2,midGain:-1,highGain:-2});
  for(const shape of E.specifications.cinder.shape)add('char/'+shape,'cinder',{shape,drive:19,bias:.18,tone:12751,output:-13,mix:.74});
  add('glaze/cleanup','glaze',{clean:'on',deess:'on',deessAmount:.9,compressor:'on',guard:'on',ceiling:-12,input:8,output:6},{frames:8192});
  add('glaze/pitch','glaze',{pitch:'correct',harmony:'on',clean:'on',deess:'on',deessAmount:.9,guard:'on',output:-9},{frames:8192});
  add('glaze/no-cleanup','glaze',{clean:'off',deess:'off',guard:'off',output:-9},{frames:8192});
  return result;
}
function changes(fixture,E){
  const key=AUTOMATE[fixture.type],rule=E.specifications[fixture.type][key],value=t=>rule[0]+(rule[1]-rule[0])*t;
  const events=[{at:17,patch:{[key]:value(.23)}},{at:113,patch:{bypass:true}},{at:257,patch:{bypass:false}},{at:991,patch:{mix:0}},{at:1237,patch:{mix:.73}},{at:1877,patch:{[key]:value(.67)}},{at:2048,reset:true},{at:2051,patch:{[key]:value(.67)}},{at:3001,patch:{[key]:value(.41)}}];
  if(fixture.type==='swirl')events.push({at:555,patch:{spread:.37,stages:'12',sensitivity:-8,output:2}},{at:2501,patch:{spread:2.1,stages:'4',output:-6}});
  if(fixture.type==='crumble')events.push({at:555,patch:{sampleRate:1271,tone:971,drive:13,output:-11}},{at:2501,patch:{bits:11.3,sampleRate:19371,tone:12731,drive:1,output:-3}});
  if(fixture.type==='strainer')events.push({at:555,patch:{cutoff:77,drive:19,output:-9,envAmount:17,lfoAmount:9}},{at:2501,patch:{cutoff:13771,envMode:'rms',drive:2,lfoAmount:0,envAmount:0}});
  if(fixture.type==='saute')events.push({at:555,patch:{bias:-.43,feedback:.17,drive:25,output:-15}},{at:2501,patch:{model:'tube-610',bias:.61,feedback:.93,compensate:'off',output:-20}});
  if(fixture.type==='velvet')events.push({at:555,patch:{input:-4,makeup:5,lowThreshold:-53,midRatio:2.3,highAttack:.07}},{at:2501,patch:{model:'opto-2a',input:9,makeup:-6,bandMode:'multiband',crossoverLow:637,crossoverHigh:3711}},{at:3501,patch:{bandMode:'full',input:-9,makeup:1}});
  if(fixture.type==='cinder')events.push({at:555,patch:{shape:'rectifier',bias:-.27,output:-9}},{at:1555,patch:{shape:'valve',bias:.4}},{at:2501,patch:{shape:'soft',drive:23,bias:.2}},{at:3501,patch:{shape:'sinefold',bias:-.13}});
  if(fixture.type==='broiler')events.push({at:555,patch:{bias:-.43,voltage:.76,feedback:.81,tightness:.9,bright:.7,coupling:.23,cathode:.81,transformer:.43,powerScale:.37}},{at:2501,patch:{powerTube:'el34',depth:.7,presence:.15}},{at:3501,patch:{powerTube:'el84',stereo:'mono'}},{at:4095,patch:{powerTube:'kt88',stereo:'stereo'}},{at:4501,patch:{powerTube:'solid',bias:.17}});
  if(fixture.type==='glaze')events.push({at:555,patch:{clean:'off',deess:'off'}},{at:1555,patch:{clean:'on',deess:'on',deessFreq:4333,deessAmount:.83}},{at:2501,patch:{gate:-39,deessThreshold:-31,output:-7}});
  return events.sort((a,b)=>a.at-b.at).filter(event=>event.at<fixture.frames);
}
function render(E,fixture){
  const {rate,frames,type}=fixture,params=E.normalize(type,fixture.patch),fx=E.create(type,rate,params),events=changes(fixture,E),blocks=[1,17,137,251,32,113],left=new Float32Array(frames),right=left.slice();
  for(let i=0;i<frames;i++){const t=i/rate;if(fixture.tonal){left[i]=.23*Math.sin(2*Math.PI*fixture.tonal*t)+.03*Math.sin(4*Math.PI*fixture.tonal*t);right[i]=.19*Math.sin(2*Math.PI*fixture.tonal*t+.17);}else if(i%2304<1536){left[i]=.29*(Math.sin(2*Math.PI*137*t)+.37*Math.cos(2*Math.PI*1717*t));right[i]=.24*(Math.sin(2*Math.PI*227*t+.17)-.29*Math.cos(2*Math.PI*2719*t));if(i%701===3)left[i]+=.4;}}
  const reports=createHash('sha256');let eventAt=0,blockAt=0;
  for(let at=0;at<frames;){
    while(eventAt<events.length&&events[eventAt].at===at){const event=events[eventAt++];if(event.patch)fx.setParams(event.patch);if(event.reset)fx.reset();}
    const end=Math.min(frames,at+blocks[blockAt++%blocks.length],events[eventAt]?.at??frames),clock={tempo:123,beat:at/rate*123/60,playing:true};
    fx.process(left.subarray(at,end),right.subarray(at,end),clock);
    reports.update(JSON.stringify({at:end,meters:fx.getMeters(),tail:fx.getTailTime?.(clock)}));at=end;
  }
  for(const channel of [left,right])for(const value of channel)assert(Number.isFinite(value),fixture.id+' produced non-finite audio');
  return {pcm:createHash('sha256').update(Buffer.from(left.buffer)).update(Buffer.from(right.buffer)).digest('hex'),meters:reports.digest('hex')};
}
function run(){
  const recording=process.argv.includes('--record-release'),loaded=load(recording),definitions=cases(loaded.E),definitionsHash=digest(JSON.stringify(definitions));
  if(recording){
    const expected=Object.fromEntries(definitions.map(fixture=>[fixture.id,render(loaded.E,fixture)]));
    fs.writeFileSync(fixtureFile,JSON.stringify({release:RELEASE,definitionsHash,sourceHashes:loaded.hashes,expected},null,2)+'\n');
    console.log('Recorded '+definitions.length+' fixtures from immutable release '+RELEASE);return;
  }
  const frozen=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));assert.equal(frozen.release,RELEASE);assert.equal(frozen.definitionsHash,definitionsHash,'Fixture definitions changed; review and record the immutable release explicitly.');
  assert.equal(Object.keys(frozen.expected).length,definitions.length);
  const groups=new Map();
  for(const fixture of definitions){assert.deepEqual(render(loaded.E,fixture),frozen.expected[fixture.id],fixture.id+' differs from released stereo PCM, meters or tail state');groups.set(fixture.type,(groups.get(fixture.type)||0)+1);}
  for(const [type,count]of groups)console.log('PASS '+type+': '+count+' released-PCM, meter, odd-block, partial-edit and reset fixtures');
  console.log(definitions.length+' effect lifecycle fixtures passed with exact stereo PCM and meter/tail state against GALLEY 1.25.');
}
if(require.main===module){try{run();}catch(error){console.error(error);process.exitCode=1;}}
module.exports={load,cases,changes,render,RELEASE};
