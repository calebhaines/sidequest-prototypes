'use strict';
// Exercise actual parent transport dispatch without a browser or native synth.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scope={window:null,console,DOMException,setInterval:()=>1,clearInterval(){}};scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'note-playback.js'),'utf8'),scope);
const clock={playing:true,tempo:120,beat:3.9,absoluteBeat:3.9,contextTime:1,cycle:0,revision:7,countInBeatsRemaining:0,loopEnabled:true,loopStart:0,loopEnd:4,endBeat:64};
const calls=[],state={tracks:[{id:'fx',instrumentLive:false,clips:[]},{id:'plain',instrumentLive:false,clips:[]},{id:'continuous',instrumentLive:true,clips:[]}]};
let subscriber;const audio={getTransport:()=>({...clock}),subscribeTransport:fn=>(subscriber=fn,()=>{})},host={cancelNotes(){},setClockDriven(){},transportInstrument:(id,value)=>calls.push({id,...value}),command:()=>Promise.resolve()};
const playback=new scope.LoomNotePlayback({audio,host,getState:()=>state});
for(const [id,fx,continuous]of[['fx',true,false],['plain',false,false],['continuous',false,true]])playback.tracks.set(id,{id,adapter:{voiceEffectsClock:fx,transport(){}},continuous,sources:new Set(),pending:null,live:null,retired:new Map()});
playback.active=true;playback._reset({...clock});
assert.deepEqual(calls.map(c=>c.id),['fx','continuous']);assert(calls.every(c=>c.playing&&c.revision===7));
calls.length=0;playback.revision=clock.revision;playback.lastRefresh=clock.contextTime;playback._tick();
const loop=calls.find(c=>c.id==='fx');assert(loop&&loop.beat===0&&Math.abs(loop.when-1.05)<1e-9,'opt-in note-only FX must receive the future loop boundary');assert(!calls.some(c=>c.id==='plain'));
calls.length=0;clock.revision++;clock.beat=1;clock.absoluteBeat=1;subscriber({...clock},'seek');assert(calls.some(c=>c.id==='fx'&&c.revision===8&&c.playing));
calls.length=0;subscriber({...clock,playing:false},'stop');assert(calls.some(c=>c.id==='fx'&&!c.playing));assert.equal(playback.active,false);playback.dispose();
console.log('PASS voice-effects transport opt-in receives seek revisions, future loop anchors and Stop on note-only tracks; legacy continuous dispatch stays intact');
