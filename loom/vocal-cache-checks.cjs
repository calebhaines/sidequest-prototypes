'use strict';
// GLAZE coefficient-cache verification. Immutable comparison source is 1.42.1.
// No timing thresholds: Math/typed-allocation counts are structural guards.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const BASELINE = '5df579ee99caa7a73222f8d6a52268be4cab3c75';
const file = path.join(__dirname, 'vocal-dsp.js'), fixtureFile = path.join(__dirname, 'vocal-cache-fixtures.json');
function load(source, instrument = false) {
  const scope = {}, counts = {}, hit = key => counts[key] = (counts[key] || 0) + 1;
  const math = instrument ? Object.create(Math) : Math;
  if (instrument) for (const key of ['pow','exp','sin','cos','sqrt','tan','log','log2','log10']) math[key] = (...values) => { hit('Math.' + key); return Math[key](...values); };
  const Float = instrument ? new Proxy(Float64Array, { construct(target, args) { hit('new Float64Array'); return Reflect.construct(target, args); } }) : Float64Array;
  const object = instrument ? new Proxy(Object, { get(target, key) { if (key === 'assign' || key === 'keys') return (...values) => { hit('Object.' + key); return target[key](...values); }; return Reflect.get(target, key); } }) : Object;
  Function('window', 'globalThis', 'Math', 'Float64Array', 'Object', source)(scope, scope, math, Float, object);
  return { factory: scope.createLoomVocalDSP(), counts, clear() { for (const key of Object.keys(counts)) delete counts[key]; }, serialize: () => scope.createLoomVocalDSP.toString() };
}
const FULL = {
  clean:'on', highpass:65, gate:-73, gateRange:38, deess:'on', deessAmount:.7, deessThreshold:-40,
  compressor:'on', threshold:-26, ratio:3.7, makeup:1.3, eq:'on', body:2.1, mud:-2.3, presence:1.7, air:2.2,
  saturation:'warm', drive:8, satMix:.4, pitch:'correct', semitones:3, fine:-11, key:'D#', scale:'minor', speed:.77, pitchWindow:41, pitchMix:.75,
  harmony:'on', harmonyA:7, harmonyB:-12, harmonyMix:.25, harmonyWidth:.8, doubler:'on', doubleAmount:.3, doubleSpread:.8, doubleTime:17, doubleDetune:9,
  vowel:'ah', formant:1, vowelMix:.3, robot:'vocoder', carrier:'saw', carrierChord:'minor', carrierNote:45, robotMix:.2,
  delay:'on', delayClock:'free', delayTime:35, delayFeedback:.3, delayTone:5700, delayWidth:.7, delayMix:.15, delayDuck:.4,
  reverb:'on', reverbSize:.38, reverbDecay:1.3, predelay:3, reverbTone:6000, reverbMix:.12, reverbWidth:.8,
  chop:'on', chopDivision:'1/8', chopDepth:.35, chopDuty:.4, chopSmooth:3, guard:'on', output:-9, mix:.9
};
function signal(frames, rate) {
  return [0,1].map(channel => Float32Array.from({length:frames}, (_,i) => {
    const t = i / rate, phase = 2 * Math.PI * (233.08 + channel * .017) * t;
    const envelope = .48 + .25 * Math.sin(2 * Math.PI * 1.3 * t);
    return envelope * (.12 * Math.sin(phase) + .037 * Math.sin(phase * 2) + .014 * Math.sin(phase * 3)) + (i % 1151 === 0 ? .02 : 0);
  }));
}
function pcm(audio) { const hash = createHash('sha256'); for (const channel of audio) hash.update(Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength)); return hash.digest('hex'); }
function snapshot(effect) { return { params:effect.getParams(), meters:effect.getMeters(), latency:effect.getLatency(), tail:effect.getTailTime({tempo:117}), propertyParams:effect.params }; }
function render(factory, item) {
  const rate = item.rate || 48000, frames = item.frames || 4096, effect = factory.create(rate, item.patch || FULL), audio = signal(frames, rate), events = item.events || [];
  audio[0][3] = -0; audio[1][7] = -0;
  let at = 0, index = 0, block = 0; const snapshots = [];
  while (at < frames) {
    while (events[index]?.at === at) {
      const event = events[index++];
      if (event.reset) effect.reset();
      else if (event.alias === 'setParam') effect.setParam(event.key, event.value);
      else if (event.alias === 'set') effect.set(event.patch);
      else effect.setParams(event.patch);
      snapshots.push(snapshot(effect));
    }
    const pattern = item.blocks || [1,17,137,251], length = pattern[block++ % pattern.length], end = Math.min(frames, at + length, events[index]?.at ?? Infinity);
    effect.process(audio[0].subarray(at,end), audio[1].subarray(at,end), {tempo:117,beat:at / rate * 117 / 60,playing:at < frames * .8}); at = end;
  }
  return { pcm:pcm(audio), snapshots, final:snapshot(effect) };
}
function cases(specifications) {
  const rows = [];
  for (const [key, rule] of Object.entries(specifications)) {
    const values = typeof rule[0] === 'number' ? [key === 'delayTime' ? 21 : rule[0] + (rule[1] - rule[0]) * .73] : rule;
    for (const value of values) rows.push({ id:'control/' + key + '/' + value, events:[{at:257,patch:{[key]:value}},{at:1217,patch:{output:-8.3,ceiling:-1.1}},{at:2049,patch:{[key]:FULL[key] ?? (typeof rule[0] === 'number' ? rule[2] : rule[0])}},{at:3073,patch:{}}] });
  }
  for (const rate of [8000,44100,48000,96000,192000]) {
    const frames = Math.max(8192, Math.ceil(rate * .2));
    rows.push({id:'combined/' + rate,rate,frames,events:[{at:257,patch:{body:4.1,bodyFreq:311,makeup:2.7,deessFreq:8100}},{at:1025,patch:{pitchWindow:68,harmonyA:-5,harmonyB:9,formant:-3,carrierNote:57,carrierChord:'major'}},{at:2051,patch:{reverbSize:.51,reverbDecay:.7,delayTone:3300,reverbTone:4800,chopSmooth:13}},{at:3077,patch:{pitch:'shift',semitones:-7,fine:23}},{at:4099,patch:{pitch:'off',harmony:'on'}},{at:5123,patch:{}},{at:6001,patch:{bypass:true}},{at:6503,patch:{bypass:false,pitch:'correct'}},{at:7001,reset:true},{at:7501,patch:{input:2.1,output:-10,mix:.67}}]});
    rows.push({id:'harmony-off-pitch-reset/' + rate,rate,frames,patch:{...FULL,pitch:'off',harmony:'on',semitones:7,fine:13,robot:'off',delay:'off',reverb:'off',doubler:'off',vowel:'off'},events:[{at:Math.floor(frames*.48),patch:{}},{at:Math.floor(frames*.56),patch:{output:-9}},{at:Math.floor(frames*.67),patch:{pitch:'shift'}},{at:Math.floor(frames*.8),patch:{pitch:'off'}},{at:Math.floor(frames*.85),reset:true},{at:Math.floor(frames*.9),patch:{pitch:'correct',fine:-27}}]});
  }
  rows.push({id:'deess-live-shelf',frames:16384,patch:{...FULL,deessThreshold:-60,deessAmount:1,robot:'off'},events:[{at:3073,patch:{ceiling:-1.7}},{at:4097,patch:{deessFreq:7300}},{at:6001,patch:{deessFreq:7300}},{at:7201,patch:{body:4.3}},{at:8193,reset:true},{at:10001,patch:{mix:.73}},{at:12003,patch:{deessFreq:6500}}]});
  rows.push({id:'same-rounded-reverb-length',frames:16384,patch:{...FULL,reverbSize:.38},events:[{at:3001,patch:{reverbSize:.38+1e-10}},{at:5003,patch:{reverbDecay:2.1}},{at:7001,patch:{reverbSize:.38}},{at:10001,patch:{reverb:'off'}},{at:11003,patch:{reverb:'on'}},{at:13001,patch:{reverbSize:.72}}]});
  rows.push({id:'normalization-and-aliases',frames:8192,events:[{at:257,patch:null},{at:513,patch:{notAControl:1}},{at:769,patch:{input:Infinity,output:NaN,highpass:undefined,pitch:'invalid',bypass:1}},{at:1025,patch:{input:-0,output:-0,mix:-0,formant:-0,fine:-0,semitones:-0,body:-0}},{at:1537,patch:{input:0,output:0,mix:0,formant:0,fine:0,semitones:0,body:0}},{at:2049,alias:'setParam',key:'mix',value:.81},{at:2561,alias:'set',patch:{carrier:'pulse',vowel:'oo'}},{at:3073,patch:Object.assign(Object.create({output:12}),{input:-3})},{at:4097,patch:{...FULL}},{at:6145,reset:true}]});
  rows.push({id:'all-controls-automation',frames:16384,blocks:[32],events:Array.from({length:511},(_,i)=>{const numeric=Object.entries(specifications).filter(([,r])=>typeof r[0]==='number'),[key,r]=numeric[i%numeric.length];return{at:(i+1)*32,patch:{[key]:r[0]+(r[1]-r[0])*(.5+.31*Math.sin(i*.173)),ceiling:-2+.7*Math.sin(i*.071),mix:.7+.1*Math.sin(i*.037)}};})});
  return rows;
}
function counters(source) {
  const loaded=load(source,true),effect=loaded.factory.create(48000,FULL),initial=effect.getParams();loaded.clear();
  for(let i=0;i<64;i++)effect.setParams({ceiling:initial.ceiling}); const unchanged={...loaded.counts};loaded.clear();
  for(let i=0;i<64;i++)effect.setParams({ceiling:i%2?-1.1:-2.3}); const ceiling={...loaded.counts};loaded.clear();
  for(const [key,rule]of Object.entries(loaded.factory.specifications))effect.setParams({[key]:typeof rule[0]==='number'?rule[0]+(rule[1]-rule[0])*.63:rule[rule.length-1]});
  return {unchanged,ceiling,allControls:{...loaded.counts}};
}
function canonical(value) {
  if(typeof value==='number'&&Object.is(value,-0))return {$number:'-0'};
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
const scenarioHash=()=>hash([FULL,signal.toString(),snapshot.toString(),render.toString(),cases.toString(),canonical.toString()]);
function recordBaseline() {
  // Only this explicitly requested path uses Git. Never capture working DSP.
  const source=execFileSync('git',['show',BASELINE+':loom/vocal-dsp.js'],{cwd:path.join(__dirname,'..'),maxBuffer:1024*1024}).toString(),baseline=load(source),rows=cases(baseline.factory.specifications);
  const fixture={baseline:BASELINE,baselineSourceSHA256:hash(source),scenarioSHA256:scenarioHash(),specifications:baseline.factory.specifications,cases:Object.fromEntries(rows.map(item=>[item.id,hash(render(baseline.factory,item))])),counters:counters(source)};
  fs.writeFileSync(fixtureFile,JSON.stringify(fixture,null,2)+'\n');console.log('Captured '+rows.length+' GLAZE cases only from immutable '+BASELINE+'.');
}
function main() {
  if(process.argv.includes('--record-baseline'))return recordBaseline();
  const frozen=JSON.parse(fs.readFileSync(fixtureFile,'utf8')),workingSource=fs.readFileSync(file,'utf8'),working=load(workingSource),rows=cases(working.factory.specifications),passed=[];
  assert.equal(frozen.baseline,BASELINE);assert.equal(frozen.scenarioSHA256,scenarioHash(),'Preservation scenarios changed; inspect and explicitly recapture the immutable baseline.');assert.deepEqual(working.factory.specifications,frozen.specifications);
  assert.deepEqual(Object.keys(frozen.cases).sort(),rows.map(row=>row.id).sort());
  for(const item of rows){assert.equal(hash(render(working.factory,item)),frozen.cases[item.id],item.id);passed.push(item.id);}
  const serialized=Function('return ('+working.serialize()+')')(),serializedFactory=serialized();for(const item of rows.filter(row=>row.id.startsWith('combined/')||row.id==='all-controls-automation'))assert.equal(hash(render(serializedFactory,item)),frozen.cases[item.id],'serialized/'+item.id);
  const before=frozen.counters,after=counters(workingSource);
  assert.equal(after.unchanged['new Float64Array']||0,0);assert.equal(after.unchanged['Object.assign']||0,0);assert.equal(after.unchanged['Object.keys']||0,0);assert.equal(Object.entries(after.unchanged).filter(([key])=>key.startsWith('Math.')).reduce((sum,[,value])=>sum+value,0),0);
  assert.equal(after.ceiling['new Float64Array']||0,0);for(const key of ['sin','cos','exp','sqrt'])assert.equal(after.ceiling['Math.'+key]||0,0,key+' redesign during ceiling-only updates');assert.equal(after.ceiling['Math.pow'],64);assert.equal(after.allControls['new Float64Array']||0,0);
  const report={baseline:BASELINE,sourceHashes:{baseline:frozen.baselineSourceSHA256,working:hash(workingSource)},exactCases:passed.length,serializedCases:6,passed,counters:{before,after}};
  if(process.env.GLAZE_CACHE_REPORT)fs.writeFileSync(process.env.GLAZE_CACHE_REPORT,JSON.stringify(report,null,2));console.log('GLAZE cache: '+passed.length+' exact frozen-baseline cases;6serialized cases;unchanged/unrelated coefficient allocation guards PASS.');
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error);process.exitCode=1;}}
module.exports={load,FULL,signal,render,cases,counters,canonical,scenarioHash,recordBaseline,main,BASELINE};
