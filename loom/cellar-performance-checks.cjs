'use strict';
// CELLAR's hot-path preservation checks. Normal runs are portable and read
// frozen digests; only --record-baseline reads immutable 1.42.1 from Git.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto'), { execFileSync } = require('node:child_process');
const BASELINE = '5df579ee99caa7a73222f8d6a52268be4cab3c75';
const sourceFile = path.join(__dirname, 'svt-dsp.js'), fixtureFile = path.join(__dirname, 'cellar-performance-fixtures.json');
const privateState = `p,os,subRate,model,inputGain,inputTarget,gain,gainTarget,master,masterTarget,output,outputTarget,head,headTarget,preHead,preTarget,trim,
mix,mixTarget,mixRemaining,suspended,sleeping,quiet,peakIn,peakOut,energyIn,energyOut,powerPeak,powerMeterPeak,currentPeak,actualHead,supplyState,sagDepth,previousDemand,
coefficients,targets,steps,toneState,toneRemaining,toneMask,targetMask,james,jamesTarget,jamesStep,jamesWorkspace,jamesHistory,jamesNext,jamesRemaining,
previousNode,previousArea,previousA,previousB,charge,cathode,flux,magnet,load,feedbackY,inputDc,bandwidth,outputDcIn,outputDc,
upA,upB,upSamples,decimA,decimB,cabinetCoefficients,cabinetTargets,cabinetSteps,cabinetState,cabinetRemaining,room,roomAt,roomDelay,roomTarget,
lastWet,transitionOffset,transition,pendingTransition,couplingRate,bandwidthRate,cathodeRate,chargeAttack,chargeRelease,fluxRate,magnetRate,loadRate,dcRate,feedback,powerB,powerA,preA`;
function load(source, serialized = false, aliases = {}) {
  const marker = 'process, setParams(next)';
  assert.equal(source.split(marker).length, 2, 'Private-state instrumentation anchor must be unique.');
  const fields = privateState.split(',').map(value => { const key = value.trim(); return aliases[key] ? key + ': ' + aliases[key] : key; }).join(',');
  const instrumented = source.replace(marker, `__qaState() { return { ${fields} }; }, ${marker}`), scope = {};
  Function('window', instrumented)(scope);
  const factory = serialized ? Function('return (' + scope.createLoomSVTDSP.toString() + ')')() : scope.createLoomSVTDSP;
  return factory();
}
// Hash doubles by IEEE bits, including signed zero; JSON alone would lose it.
function digest(value) {
  const hash = createHash('sha256'), number = Buffer.allocUnsafe(8);
  function add(item) {
    if (typeof item === 'number') { number.writeDoubleLE(item); hash.update('n').update(number); }
    else if (typeof item === 'boolean') hash.update(item ? 'true;' : 'false;');
    else if (typeof item === 'string') hash.update('s' + item.length + ':').update(item);
    else if (item === null) hash.update('null;');
    else if (Array.isArray(item) || ArrayBuffer.isView(item)) { hash.update('[' + item.length + ':'); for (const entry of item) add(entry); hash.update(']'); }
    else { const keys = Object.keys(item).sort(); hash.update('{'); for (const key of keys) { add(key); add(item[key]); } hash.update('}'); }
  }
  add(value); return hash.digest('hex');
}
function signal(frames, rate, silentAfter) {
  return [0,1].map(channel => Float32Array.from({length:frames}, (_, i) => {
    if (i >= silentAfter) return i % 2 ? -0 : 0;
    const envelope = Math.min(1, i / 17) * (.7 + .3 * Math.sin(i * .013));
    return envelope * (.38 * Math.sin(2 * Math.PI * (83 + channel * 17) * i / rate) + .11 * Math.sin(2 * Math.PI * (790 + channel * 103) * i / rate)) + (i % 137 === 0 ? .7 : 0);
  }));
}
function scenarios(models) {
  const rows = [];
  for (const rate of [8000,48000,192000]) for (const quality of ['eco','high']) for (const model of models) for (const stereo of ['mono','stereo']) {
    rows.push({id:`active/${rate}/${quality}/${model}/${stereo}`,rate,frames:1537,patch:{model,quality,stereo,gain:8.3,master:7.7,input:5.2,output:-12,headroom:-2.3,bias:-.17,sag:.53,feedback:.73,transformer:.81,speakerLoad:.74,speakerDrive:.22,bass:7.2,treble:3.9,mid:6.1,midFreq:'450',ultraLow:'on',ultraHigh:'on',distance:.72,mic:.33,air:.63,mix:.87}});
  }
  for (const model of models) {
    rows.push({id:'controls/' + model,rate:48000,frames:4097,patch:{model,quality:'high',stereo:'stereo'},events:[
      {at:137,patch:{bass:0,treble:10,mid:1,midFreq:'3000',gain:10,bias:.5,feedback:1}},
      {at:513,patch:{cabinet:'di',quality:'eco',headroom:24,supply:1.2,transformer:1,sag:1}},
      {at:997,patch:{model:models[(models.indexOf(model)+1)%models.length],stereo:'mono',quality:'high',cabinet:'810'}},
      {at:1537,patch:{mix:0}}, {at:2305,patch:{mix:1,stereo:'stereo',ultraLow:'on',ultraHigh:'on'}},
      {at:3001,reset:true}, {at:3333,patch:{bias:-0,output:-0,speakerDrive:1,pad:'on',trim:'raw'}}]});
    rows.push({id:'tail-reset/' + model,rate:8000,frames:18001,silentAfter:1024,patch:{model,quality:'high',stereo:'stereo',distance:.9,gain:9,input:6,sag:1},events:[
      {at:4097,patch:{bypass:true}}, {at:4353,patch:{bypass:false}}, {at:12003,reset:true}, {at:15001,patch:{gain:5,bass:1}}]});
  }
  rows.push({id:'32-frame-automation',rate:48000,frames:4097,patch:{model:'charge',quality:'high',stereo:'stereo'},blocks:[32],events:Array.from({length:127},(_,i)=>({at:(i+1)*32,patch:{gain:3+2*Math.sin(i*.17),bass:5+4*Math.sin(i*.13),treble:5+3*Math.sin(i*.11),headroom:4+3*Math.sin(i*.07),bias:.3*Math.sin(i*.19)}}))});
  rows.push({id:'unsafe-input-and-partials',rate:48000,frames:2053,patch:{model:'adaa',stereo:'stereo'},unsafe:true,events:[{at:257,patch:{gain:Infinity,input:NaN,bias:undefined,invalid:1}},{at:511,patch:{}},{at:997,patch:{bypass:true}},{at:1537,patch:{bypass:false}}]});
  return rows;
}
function render(factory, item, blocks = item.blocks || [1,17,137,251]) {
  const effect = factory.create(item.rate,item.patch), audio = signal(item.frames,item.rate,item.silentAfter ?? Infinity), events = item.events || [], snapshots = [];
  audio[0][3] = -0; audio[1][7] = -0;
  if (item.unsafe) { audio[0][31] = Infinity; audio[1][53] = NaN; audio[0][79] = -Infinity; audio[1][101] = -32; audio[0][103] = 32; }
  let at = 0, block = 0, event = 0;
  while (at < item.frames) {
    while (events[event]?.at === at) { const next = events[event++]; if (next.reset) effect.reset(); else effect.setParams(next.patch); }
    const end = Math.min(item.frames,at+blocks[block++%blocks.length],events[event]?.at ?? Infinity);
    effect.process(audio[0].subarray(at,end),audio[1].subarray(at,end)); at = end;
    snapshots.push(digest(effect.__qaState()));
  }
  return {pcm:digest(audio),state:digest(effect.__qaState()),public:digest([effect.getState(),effect.getMeters(),effect.getTailTime()]),checkpoints:digest(snapshots)};
}
const scenarioHash = () => digest([privateState,signal.toString(),scenarios.toString(),render.toString(),digest.toString()]);
function recordBaseline() {
  const source = execFileSync('git',['show',BASELINE+':loom/svt-dsp.js'],{cwd:path.join(__dirname,'..'),maxBuffer:1024*1024}).toString(), factory = load(source), rows = scenarios(factory.specifications.model);
  const cases = Object.fromEntries(rows.map(item=>[item.id,render(factory,item)]));
  fs.writeFileSync(fixtureFile,JSON.stringify({baseline:BASELINE,baselineSourceSHA256:createHash('sha256').update(source).digest('hex'),scenarioSHA256:scenarioHash(),cases},null,2)+'\n');
  console.log('Captured ' + rows.length + ' CELLAR cases only from immutable ' + BASELINE + '.');
}
function main() {
  if(process.argv.includes('--record-baseline'))return recordBaseline();
  const frozen=JSON.parse(fs.readFileSync(fixtureFile,'utf8')), source=fs.readFileSync(sourceFile,'utf8'), factory=load(source),rows=scenarios(factory.specifications.model);
  assert.equal(frozen.baseline,BASELINE);assert.equal(frozen.scenarioSHA256,scenarioHash());assert.deepEqual(rows.map(row=>row.id).sort(),Object.keys(frozen.cases).sort());
  for(const item of rows) assert.deepEqual(render(factory,item),frozen.cases[item.id],item.id + ': exact samples, public metadata and complete private history/coefficient/clock state');
  const serialized=load(source,true),serializedRows=rows.filter(row=>row.id.startsWith('controls/')||row.id==='32-frame-automation');
  for(const item of serializedRows)assert.deepEqual(render(serialized,item),frozen.cases[item.id],'serialized/' + item.id);
  for(const item of rows.filter(row=>row.id.startsWith('controls/'))) {
    const regular=render(factory,item,[128]),irregular=render(factory,item);
    for(const key of ['pcm','state','public'])assert.equal(regular[key],irregular[key],item.id + ': block-independent ' + key);
  }
  const report={baseline:BASELINE,sourceHashes:{baseline:frozen.baselineSourceSHA256,working:createHash('sha256').update(source).digest('hex')},exactCases:rows.length,serializedCases:serializedRows.length,partitionCases:5};
  if(process.env.CELLAR_PERFORMANCE_REPORT)fs.writeFileSync(process.env.CELLAR_PERFORMANCE_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log('PASS ' + rows.length + ' immutable CELLAR PCM/private-state/public-metadata cases, ' + serializedRows.length + ' serialized cases and 5 partition comparisons.');
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error);process.exitCode=1;}}
module.exports={load,digest,signal,scenarios,render,BASELINE};
