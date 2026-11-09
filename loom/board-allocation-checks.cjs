'use strict';
/* Exact BOARD PCM, physical histories and public circuit wrappers. Normal runs
 * require no Git/browser; --record-baseline reads only immutable5df579e. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const BASELINE='5df579ee99caa7a73222f8d6a52268be4cab3c75';
const FROZEN=/* FROZEN-BEGIN */ {
  "baseline": "5df579ee99caa7a73222f8d6a52268be4cab3c75",
  "sourceSHA256": "3c3ff9e585a3e1dab85d21fe5c65c8aa718597e186de050a2fa522f7be00333e",
  "definitionsSHA256": "8a8e165819bcc2fd06dee8432a1d541f357e374e4ec14cb699dd789dfe6d4df6",
  "rows": {
    "network/1/32000/public": "6615a3433784f27759660c4cb57e4527fcb3c3d349088c734ae3a8ec9595f19a",
    "network/1/32000/carrier": "6615a3433784f27759660c4cb57e4527fcb3c3d349088c734ae3a8ec9595f19a",
    "network/5/32000/public": "82cb751f09ee5203773ce6bdf0e52fed9cb846d87e3dc19941b0bd0e4e6d562d",
    "network/5/32000/carrier": "82cb751f09ee5203773ce6bdf0e52fed9cb846d87e3dc19941b0bd0e4e6d562d",
    "network/6/32000/public": "feb3bb98aed642fafb73b918077c26f17ef626155d6fdf81f0e391fe6695b85b",
    "network/6/32000/carrier": "feb3bb98aed642fafb73b918077c26f17ef626155d6fdf81f0e391fe6695b85b",
    "network/1/192000/public": "6615a3433784f27759660c4cb57e4527fcb3c3d349088c734ae3a8ec9595f19a",
    "network/1/192000/carrier": "6615a3433784f27759660c4cb57e4527fcb3c3d349088c734ae3a8ec9595f19a",
    "network/5/192000/public": "0cda80880f8ce1f121a2bc6ef448fc692c62a94ba894f361b6197206324362fb",
    "network/5/192000/carrier": "0cda80880f8ce1f121a2bc6ef448fc692c62a94ba894f361b6197206324362fb",
    "network/6/192000/public": "3c0f3bc50f1ed6beeebafd20fd28980910d543a83e4a9a7606a6a231c7b03191",
    "network/6/192000/carrier": "3c0f3bc50f1ed6beeebafd20fd28980910d543a83e4a9a7606a6a231c7b03191",
    "stage/32000/public": "66e3f0627a2f03535a8638b26736feded0a2372f12730027e34303d3e5eb3238",
    "blue/32000/public": "03377abc76d8d3420c33e7581fb2535572ac9bdbbff71dafcd55a44258b60f9d",
    "stage/32000/carrier": "66e3f0627a2f03535a8638b26736feded0a2372f12730027e34303d3e5eb3238",
    "blue/32000/carrier": "03377abc76d8d3420c33e7581fb2535572ac9bdbbff71dafcd55a44258b60f9d",
    "stage/192000/public": "f56340fe191c320a1ab7750033e0b7650dd710316ee83a437feb78fe8e69153d",
    "blue/192000/public": "466aab901706182ce1921837632ba7be126b94e55cf65258cda2da767d7e9851",
    "stage/192000/carrier": "f56340fe191c320a1ab7750033e0b7650dd710316ee83a437feb78fe8e69153d",
    "blue/192000/carrier": "466aab901706182ce1921837632ba7be126b94e55cf65258cda2da767d7e9851",
    "stage/384000/public": "f4cdcb2b342b683550a256612596beedc9fdb479d2c30377eeb67cf488ec4b8a",
    "blue/384000/public": "0548c2989bbcefd63b42b6c9a896428cae272b8b29589581458d9a4290d3a8f3",
    "stage/384000/carrier": "f4cdcb2b342b683550a256612596beedc9fdb479d2c30377eeb67cf488ec4b8a",
    "blue/384000/carrier": "0548c2989bbcefd63b42b6c9a896428cae272b8b29589581458d9a4290d3a8f3",
    "effect/bluesdriver/high/8000": "501bfd49413d268249d1e216c342e098e6a68691b1b4fb305dcd6977304f29d8",
    "effect/screamer/high/8000": "0b85940b9a90a4fb8b061b18957793631d01795c656d9bbbb75b89461792c668",
    "effect/rodent/high/8000": "5a87ef55cb9d9672ad29c074988a6883e8ccb330b6bf6d4732a65af424a0bb4a",
    "effect/fuzz/high/8000": "aa16e4b68d820011178e406729385beba9316d6b7257d4286b09882cdb1e1ab5",
    "effect/double-blue/high/8000": "f658f46d9ad83cdec338d1475088f9aaf664d4a0bcb10128836967195a7469fb",
    "effect/bluesdriver/eco/8000": "6f43c33e285391d22f9bb5c78ed2431193f971da7fc635e3e49901c0590a4cca",
    "effect/screamer/eco/8000": "837b4c8f64ac355b6a65eadbe9a07247b7207b4c143f01371adf909b28428c8c",
    "effect/rodent/eco/8000": "a7852072b6a8537819539d69371ff8c80eff553537b3473a73df74e5cece8f4f",
    "effect/fuzz/eco/8000": "6e9c9c28bdc4061f724b65e6f1323c58f0dd0a6177683dfa10bfa94044adfb98",
    "effect/double-blue/eco/8000": "2266a635ce5e90d9a3cfc60a64993e5338556315df522ca37e275b56571d21ec",
    "effect/bluesdriver/high/48000": "e8b68ab2439fedde7c340dc343a0f495fbecbb0c22d4e7d59a88e6aa92a106ac",
    "effect/screamer/high/48000": "5b05c8d21302fce03d2b810955bb121306b8f338d10a3da23af8fa8b99558995",
    "effect/rodent/high/48000": "6dcbabe3fe4621f0478d6f99d1452cc067661c010d99da80e0ba910b2301ce32",
    "effect/fuzz/high/48000": "1e6d20a73db9d599ea79367ca9587fdd041273ed2a51c965105fd3c3f60a0043",
    "effect/double-blue/high/48000": "b7b3b0d0e6e644b95c2234679d4fe4140fb531798564688085835fd15280b6f8",
    "effect/bluesdriver/eco/48000": "5a5936cff1dd7242c0cd1dcd036b041f8685db9d3a2f10df98fc2883f0727b56",
    "effect/screamer/eco/48000": "5a8f17950df279be682d04c29d4596da8e4d72c42fc3cd3ae8e32ad626c32b50",
    "effect/rodent/eco/48000": "2fe2dddeb314383cefd39cdc1b9b52ee7933109218db6624291d71794cc31e56",
    "effect/fuzz/eco/48000": "b3101c3ea794d4a9f5dbd2d1a79a99c1cb0b6c9745f4c0a011d5ab4e8cc501f6",
    "effect/double-blue/eco/48000": "25ab979424867ede2d430230600a03250d1f31407f52e8dd38b4e53960586193",
    "effect/bluesdriver/high/96000": "4c62fc6bf9ca5cb232154d51507d6c065f49e104efff0aa1aac5f99588a61b6f",
    "effect/screamer/high/96000": "91b6f8591d33c6d96a6cf3cb9f62473de289aed7e698d27b6d611dee989e3427",
    "effect/rodent/high/96000": "1ed9157ad97df1f5169f153128613b36655c56bc7db2d3b6bfc7873806076ecf",
    "effect/fuzz/high/96000": "f395b5c1fbbc45c3acf07fab2eae61a4e55a4c5e816d3210f1755b4f41570367",
    "effect/double-blue/high/96000": "c45f0692dda1571a0e3c4bca2d37c563dcfaaad977047b7d9ae4eb259ceb1c02",
    "effect/bluesdriver/eco/96000": "1354c72bf361deefc71fc76905e06b3ff93ddf99d736d1eaee84e26847ec03c8",
    "effect/screamer/eco/96000": "985094a16b00019391a76be61ea87abfa09fa6a7fc937b908a1d49716dee974e",
    "effect/rodent/eco/96000": "517cd6f68e61cde299a43459ae5f0d975794b57199d4bab522ad29837ee2abb0",
    "effect/fuzz/eco/96000": "ddaae557a000d08afb3aa6767a131b44647c1f72052f01ae4af67beb5b64f872",
    "effect/double-blue/eco/96000": "fc13ffb6e69e8233a7b544c07c4124a2d5d54241e996485e7a0b0e01786f1a78"
  }
} /* FROZEN-END */;
const canonical=fs.existsSync(path.join(__dirname,'guitar-pedals-dsp.js'))?path.join(__dirname,'guitar-pedals-dsp.js'):'/workspace/sidequest-prototypes/loom/guitar-pedals-dsp.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
function factory(source){return new Function(source+'\nreturn globalThis.createLoomGuitarPedalsDSP;')()();}
function definitions(){return [...[32000,192000].flatMap(rate=>[1,5,6].flatMap(count=>['public','carrier'].map(mode=>({kind:'network',id:`network/${count}/${rate}/${mode}`,count,rate,mode})))),...[32000,192000,384000].flatMap(rate=>['public','carrier'].flatMap(mode=>['stage','blue'].map(kind=>({kind,id:`${kind}/${rate}/${mode}`,rate,mode})))),...[8000,48000,96000].flatMap(rate=>['high','eco'].flatMap(quality=>['bluesdriver','screamer','rodent','fuzz','double-blue'].map(type=>({kind:'effect',id:`effect/${type}/${quality}/${rate}`,rate,quality,type}))))];}
function physicalStage(s){return ['hf','hg','rf','targetRf','remaining','rfStep','alpha','scale','yg','rate','base','ground','cg','cf','groundCap'].map(k=>s[k]??0);}
function physicalNetwork(n,s){return [n.count,n.rampRemaining||0,n.resistance||0,...['inv','source','matrix','invTarget','invStep'].flatMap(k=>[n[k]?.length||0,...n[k]||[]]),...s.h,...s.rhs,...s.volts];}
function physicalBlue(b){const a=[b.volumeZero?1:0,...b.bass.a,...b.bass.b];for(const s of b.states){for(const k of['input','couple','out'])for(const f of['z','g','targetG','slew'])a.push(s[k][f]);a.push(...physicalStage(s.first),...physicalStage(s.second),...physicalNetwork(b.inter,s.inter),...physicalNetwork(b.tone,s.tone),...s.bass);}return a;}
function signal(i,right=false){return .24*Math.sin(i*(right?.067:.071))+.071*Math.sin(i*(right?.139:.179));}
function circuit(F,d){const C=F.circuits,io=new Float64Array(1),h=createHash('sha256'),outputs=new Float64Array(4096),state=[];let object,s,output,R;
 if(d.kind==='network'){if(d.count===1){R=[[-2,0,1800]];object=new C.PassiveNetwork(d.rate,1,R,[],0);output=0;}else if(d.count===5){R=[[-2,0,100000],[4,1,330000],[1,2,1e6],[2,-1,15000],[3,-1,1e6]];object=new C.PassiveNetwork(d.rate,5,R,[[-2,4,220e-12],[0,1,100e-9],[0,2,47e-9],[1,3,2.2e-9]],1);output=3;}else{R=[[-2,0,5600],[1,3,5000],[3,2,5000],[3,4,90000],[4,-1,10000],[5,-1,470000]];object=new C.PassiveNetwork(d.rate,6,R,[[-2,0,6.8e-9],[0,-1,5.6e-9],[0,1,18e-9],[2,-1,18e-9],[4,5,47e-9]]);output=5;}s=object.state();}
 else if(d.kind==='stage')object=new C.DiscreteStage(d.rate,22000,1500,150e-9,47e-12);
 else object=new C.BlueDriver(d.rate,{Drive:.4,Tone:.5,Volume:.5});
 for(let i=0;i<2048;i++){
  if(i===257||i===333||i===1101){if(d.kind==='stage')object.set(i===333?.17:.83);else if(d.kind==='blue')object.set({Drive:i===333?.17:.83,Tone:i===333?.78:.23,Volume:i===1101?0:.67});else object.configure(R.map(([a,b,r])=>[a,b,r*(i===333?.97:1.03)]),19);}
  if(d.kind==='network'){object.advance();const x=signal(i)*.13;if(d.mode==='carrier'&&object.tickBuffer){io[0]=x;object.tickBuffer(io,s,output);outputs[i*2]=io[0];}else outputs[i*2]=object.process(x,s,output);if(i%37===0)state.push(...physicalNetwork(object,s));}
  else if(d.kind==='stage'){const x=signal(i)*.7;if(d.mode==='carrier'&&object.tickBuffer){io[0]=x;object.tickBuffer(io);outputs[i*2]=io[0];}else outputs[i*2]=object.process(x);if(i%37===0)state.push(...physicalStage(object));}
  else{object.tone.advance();for(let ch=0;ch<2;ch++){const x=signal(i,ch===1&&i>777);if(d.mode==='carrier'&&object.tickBuffer){io[0]=x;object.tickBuffer(io,ch);outputs[i*2+ch]=io[0];}else outputs[i*2+ch]=object.sample(x,ch);}if(i%37===0)state.push(...physicalBlue(object));}
 }
 assert(outputs.every(Number.isFinite),d.id+' finite circuit output');h.update(Buffer.from(outputs.buffer));h.update(Buffer.from(Float64Array.from(state).buffer));return h.digest('hex');}
function effect(F,d){const fx=F.create(d.rate,{quality:d.quality,pedal1Type:d.type==='double-blue'?'bluesdriver':d.type,pedal1Drive:.4,pedal1Level:-6,...(d.type==='double-blue'?{pedal2Type:'bluesdriver',pedal2Drive:.31,pedal2Level:-3}:{})}),l=new Float32Array(8192),r=new Float32Array(8192),h=createHash('sha256'),meters=[];
 for(let i=0;i<8192;i++){l[i]=signal(i);r[i]=i<4001?l[i]:signal(i,true);}l[1001]=0;r[1001]=-0;r[3073]+=.00001;
 const events=[{at:257,p:{pedal1Drive:.71}},{at:513,p:{pedal1Tone:.23}},{at:1024,p:{pedal1Volume:.67}},{at:1537,p:{quality:d.quality==='high'?'eco':'high'}},{at:2049,p:{input:6,output:-6}},{at:4501,p:{pedal1Drive:.19,pedal1Tone:.83}},{at:5003,p:{bypass:true}},{at:5507,p:{bypass:false}},{at:5903,reset:true},{at:7001,p:{quality:d.quality,pedal1Drive:.53}}];
 let at=0,index=0,event=0;while(at<8192){while(events[event]?.at===at){const e=events[event++];if(e.reset)fx.reset();else fx.setParams(e.p);}const end=Math.min(8192,at+[1,17,137,251][index++%4],events[event]?.at??Infinity);fx.process(l.subarray(at,end),r.subarray(at,end),{tempo:120});meters.push(fx.getMeters());at=end;}assert(l.every(Number.isFinite)&&r.every(Number.isFinite),d.id+' finite PCM');h.update(Buffer.from(l.buffer));h.update(Buffer.from(r.buffer));h.update(JSON.stringify(meters));return h.digest('hex');}
function definitionHash(){return sha(JSON.stringify([definitions(),signal,circuit,effect,physicalStage,physicalNetwork,physicalBlue].map(x=>typeof x==='function'?x.toString():x)));}
function run(source){const F=factory(source),rows={};for(const d of definitions())rows[d.id]=d.kind==='effect'?effect(F,d):circuit(F,d);return rows;}
if(process.argv.includes('--record-baseline')){const source=execFileSync('git',['show',BASELINE+':loom/guitar-pedals-dsp.js'],{cwd:path.dirname(path.dirname(canonical)),encoding:'utf8'}),data={baseline:BASELINE,sourceSHA256:sha(source),definitionsSHA256:definitionHash(),rows:run(source)};fs.writeFileSync(__filename,fs.readFileSync(__filename,'utf8').replace(/\/\* FROZEN-BEGIN \*\/[\s\S]*?\/\* FROZEN-END \*\//,'/* FROZEN-BEGIN */ '+JSON.stringify(data,null,2)+' /* FROZEN-END */'));console.log('Captured '+Object.keys(data.rows).length+' BOARD PCM/physical-state fixtures only from '+BASELINE);}
else{assert(FROZEN&&FROZEN.baseline===BASELINE,'Capture immutable baseline first');assert.equal(definitionHash(),FROZEN.definitionsSHA256,'Fixture definitions remain frozen');const file=process.env.BOARD_CARRIER_SOURCE||canonical,source=fs.readFileSync(file,'utf8'),rows=run(source);for(const[id,value]of Object.entries(rows))assert.equal(value,FROZEN.rows[id],id+' exact5df PCM/physical state/public scalar API');const report={passed:true,baseline:BASELINE,cases:Object.keys(rows).length,circuitCases:definitions().filter(x=>x.kind!=='effect').length,effectCases:definitions().filter(x=>x.kind==='effect').length,source:file,sourceSHA256:sha(source),definitionsSHA256:FROZEN.definitionsSHA256};if(process.env.BOARD_CARRIER_REPORT)fs.writeFileSync(process.env.BOARD_CARRIER_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
