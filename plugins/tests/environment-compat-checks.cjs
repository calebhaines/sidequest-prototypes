'use strict';
// Simulate only the two ES2022 helpers missing in macOS12.0 JavaScriptCore.
// Canonical instrument files and all numerical DSP remain untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function realm(missing) {
  const g = {}; vm.createContext(g);
  vm.runInContext('globalThis.originalAt=Array.prototype.at;globalThis.originalHasOwn=Object.hasOwn;', g);
  if (missing) vm.runInContext('Array.prototype.at=undefined;Object.hasOwn=undefined;delete Array.prototype[Symbol.unscopables].at;', g);
  vm.runInContext(read('plugins/js/environment.js'), g, {filename:'environment.js'}); return g;
}
const g=realm(true), run=code=>vm.runInContext(code,g);
const throwsType=code=>assert.throws(()=>run(code),error=>error.name==='TypeError');
assert.equal(run('["a","b","c"].at(-1)'), 'c');assert.equal(run('["a","b","c"].at(-1.9)'), 'c');assert.equal(run('["a","b"].at()'), 'a');assert.equal(run('["a","b"].at(NaN)'), 'a');
assert.equal(run('[1].at(Infinity)'),undefined);assert.equal(run('[1].at(-Infinity)'),undefined);assert.equal(run('[1].at(-2)'),undefined);assert.equal(run('[,].at(0)'),undefined);
assert.equal(run('Array.prototype.at.call("abc",-1)'),'c');assert.equal(run('Array.prototype.at.call({0:"a",1:"b",length:2.8},-1)'),'b');
assert.equal(run('Array.prototype.at.call({9007199254740990:"last",length:Infinity},-1)'),'last');
assert.equal(run('Array.prototype.at.call(Object.assign(Object.create({1:"inherited"}),{length:2}),-1)'),'inherited');
throwsType('Array.prototype.at.call(null,0)');throwsType('Array.prototype.at.call(undefined,0)');throwsType('[1].at(0n)');throwsType('[1].at(Symbol())');throwsType('Array.prototype.at.call({length:1n},0)');
assert.equal(run(`(()=>{const log=[];const object=new Proxy({length:2,1:'value'},{get(o,key){log.push(String(key));return o[key];}});const index={valueOf(){log.push('index');return -1;}};const result=Array.prototype.at.call(object,index);return JSON.stringify([result,log]);})()`),'["value",["length","index","1"]]');
assert.equal(run(`(()=>{const log=[];Array.prototype.at.call(new Proxy({length:1},{get(o,key){log.push(String(key));return o[key];}}),2);return log.join(',');})()`),'length');
assert.equal(run('Array.prototype[Symbol.unscopables].at'),true);
assert.equal(run('Object.hasOwn(Object.create({inherited:true}),"inherited")'),false);assert.equal(run('Object.hasOwn({hasOwnProperty:null,own:undefined},"own")'),true);
assert.equal(run('Object.hasOwn("abc",1)'),true);assert.equal(run('Object.hasOwn(7,"toString")'),false);assert.equal(run('Object.hasOwn(7n,"x")'),false);
assert.equal(run('(()=>{const key=Symbol();return Object.hasOwn({[key]:1},key)})()'),true);
throwsType('Object.hasOwn(null,{toString(){throw Error("key coerced too early")}})');throwsType('Object.hasOwn(undefined,"x")');
assert.equal(run(`(()=>{const log=[];const object=new Proxy({x:1},{getOwnPropertyDescriptor(o,key){log.push('own:'+key);return Object.getOwnPropertyDescriptor(o,key);}});const key={[Symbol.toPrimitive](hint){log.push('key:'+hint);return 'x';}};return JSON.stringify([Object.hasOwn(object,key),log]);})()`),'[true,["key:string","own:x"]]');
for(const expression of ['Array.prototype.at','Object.hasOwn']) {
  assert.equal(run(`Object.getOwnPropertyDescriptor(${expression.startsWith('Array')?'Array.prototype':'Object'},'${expression.endsWith('.at')?'at':'hasOwn'}').enumerable`),false);
  assert.equal(run(`Object.getOwnPropertyDescriptor(${expression.startsWith('Array')?'Array.prototype':'Object'},'${expression.endsWith('.at')?'at':'hasOwn'}').writable`),true);
  assert.equal(run(`Object.getOwnPropertyDescriptor(${expression.startsWith('Array')?'Array.prototype':'Object'},'${expression.endsWith('.at')?'at':'hasOwn'}').configurable`),true);
  throwsType(`Reflect.construct(${expression},[])`);
}
assert.equal(run('Array.prototype.at.name'),'at');assert.equal(run('Array.prototype.at.length'),1);assert.equal(run('Object.hasOwn.name'),'hasOwn');assert.equal(run('Object.hasOwn.length'),2);
const modern=realm(false);assert.equal(vm.runInContext('Array.prototype.at===originalAt&&Object.hasOwn===originalHasOwn',modern),true,'Existing built-ins were replaced');
console.log('PASS missing-only macOS12.0 helpers: generic/coercion/Infinity/BigInt/Symbol/proxy behavior and native descriptors');
for(const file of ['shared/pattern-schema.js','batter/engine.js'])vm.runInContext(read(file),g,{filename:file});
// Use the actual factory library too, without creating a browser audio device.
vm.runInContext('globalThis.BatterLibrary='+read('batter/factory-samples.json')+';',g,{filename:'batter-factory.json'});
const proof=run(`(()=>{const engine=new BatterEngine(),raw=engine.getState();raw.chainEnabled=true;raw.chain=['A','A','B'];raw.chainLoop=false;const step=raw.patterns[0].lanes[0].steps[0];step.on=true;step.probability=1;step.locks={lowpass:370,drive:.21,volume:.64};engine.setState(raw);const state=engine.getState(),score=BatterSchema.compile(state);return{lanes:state.lanes.length,chain:state.chain,loop:state.chainLoop,locks:state.patterns[0].lanes[0].steps[0].locks,lockedEvents:score.events.filter(e=>e.laneIndex===0&&e.locks.lowpass===370).length,hasLock:Object.hasOwn(state.patterns[0].lanes[0].steps[0].locks,'drive')};})()`);
assert.equal(proof.lanes,12);assert.equal(proof.loop,false);assert.deepEqual(JSON.parse(JSON.stringify(proof.chain)),[{pattern:'A',repeats:2},{pattern:'B',repeats:1}]);assert.equal(proof.locks.lowpass,370);assert.equal(proof.locks.drive,.21);assert.equal(proof.locks.volume,.64);assert(proof.lockedEvents>=2);assert.equal(proof.hasLock,true);
console.log('PASS actual BATTER factory construction,12-lane normalization, repeated pattern chain and per-hit filter/drive/volume locks with both helpers initially absent');
