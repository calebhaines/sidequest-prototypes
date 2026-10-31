const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const baseURL = process.env.OVERTONE_QA_URL || 'http://127.0.0.1:8765/ear-training/';
const STORE = 'overtone.practice.v1';
const IDS = ['12edo','pythagorean','meantone-quarter','meantone-sixth','werckmeister-iii','vallotti','kirnberger-iii','just-duodene'];

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const legacyAttempts = [
      {mode:'intervals',level:'beginner',outcome:'correct',timestamp:'2026-10-01T10:00:00.000Z'},
      {mode:'ensemble',level:'level-1',outcome:'correct',timestamp:'2026-10-02T10:00:00.000Z',parts:{chordsCorrect:4,chordTotal:4,melodyCorrect:4,melodyTotal:4}},
      {mode:'pitch',level:'level-8',outcome:'incorrect',timestamp:'2026-10-03T10:00:00.000Z'}
    ];
    const oldPitch = {protocol:'2d1u-v1',timestamp:'2026-10-04T10:00:00.000Z',trials:Array.from({length:24},(_,i)=>({cents:Math.max(2,100/1.5**Math.floor(i/2)),correct:true}))};
    const priorTests = Array.from({length:50},(_,i)=>({protocol:'temperament-abx-v1',tuningA:'12edo',tuningB:'meantone-quarter',level:'level-1',timbre:'sine',timestamp:new Date(Date.UTC(2026,7,1+i,10)).toISOString(),trials:Array.from({length:20},()=>({answer:'A',response:'A'}))}));
    const seed = {version:1,settings:{mode:'intervals',level:'advanced',timbre:'warm',volume:.65},attempts:legacyAttempts,pitchTests:[oldPitch],temperamentTests:priorTests};
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [], external = [];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith(new URL(baseURL).origin))external.push(r.url());});
    await page.addInitScript(({seed,key})=>{
      if(!sessionStorage.getItem('temperament-qa-seeded')){localStorage.setItem(key,JSON.stringify(seed));sessionStorage.setItem('temperament-qa-seeded','yes');}
      window.__rng=.25;Math.random=()=>window.__rng;window.__notes=[];window.__oscillators=[];
      const create=AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator=function(){
        const context=this,osc=create.call(context),node={id:window.__oscillators.length,stops:[]};window.__oscillators.push(node);
        const start=osc.start.bind(osc),stop=osc.stop.bind(osc);
        osc.start=at=>{window.__notes.push({id:node.id,at,now:context.currentTime,frequency:osc.frequency.value});return start(at);};
        osc.stop=at=>{node.stops.push({at,now:context.currentTime});return stop(at);};return osc;
      };
    },{seed,key:STORE});
    await page.goto(baseURL);
    await page.waitForFunction(()=>document.querySelectorAll('.mode-button').length===9);
    const record=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORE);
    const count=async()=>(await record()).attempts.length;
    let fastClock=false;
    async function play(selector='#play',duration=12000){
      await page.evaluate(()=>{window.__notes=[];});await page.locator(selector).click();
      await page.waitForFunction(()=>window.__notes.length>0);
      if(fastClock)await page.clock.fastForward(duration);
      await page.waitForFunction(()=>!document.querySelector('#play').disabled,null,{timeout:20000});
      return page.evaluate(()=>window.__notes.map(n=>({...n,stopAt:window.__oscillators[n.id].stops[0].at})));
    }
    const shape=notes=>notes.map(n=>({at:Number((n.at-notes[0].at).toFixed(6)),duration:Number((n.stopAt-n.at).toFixed(6))}));
    const sound=notes=>notes.map(n=>({at:Number((n.at-notes[0].at).toFixed(6)),frequency:n.frequency}));
    const key=notes=>JSON.stringify(sound(notes));
    const allDisabled=()=>page.locator('.answer-choice').evaluateAll(ns=>ns.length>0&&ns.every(n=>n.disabled));
    async function expected(level='level-1',task='abx',a='12edo',b='meantone-quarter'){
      return page.evaluate(async({level,task,a,b})=>{
        const {generateTemperamentQuestion}=await import('./temperaments.js');
        return generateTemperamentQuestion(level,()=>window.__rng,{task,...(task==='abx'?{tuningA:a,tuningB:b}:{})});
      },{level,task,a,b});
    }
    function assertAudio(notes,events,label){
      const wanted=events.flatMap(e=>e.notes.map(midi=>({at:e.at,frequency:Math.fround(440*2**((midi-69)/12))})));
      assert.equal(notes.length,wanted.length,`${label}: all score notes use the same pure-sine voice.`);
      const base=notes[0].at-wanted[0].at;
      for(let i=0;i<wanted.length;i++){
        assert.ok(Math.abs(notes[i].at-base-wanted[i].at)<.00001,`${label}: score timing ${i} is unchanged.`);
        assert.ok(Math.abs(notes[i].frequency-wanted[i].frequency)<.001,`${label}: fractional tuning of note ${i} survives the audio engine.`);
      }
    }
    function match(a,b,x){
      assert.notEqual(key(a),key(b),'References must be acoustically distinct for the chosen score.');
      assert.deepEqual(shape(a),shape(b),'A and B match in note count, timing, and articulation.');
      assert.deepEqual(shape(a),shape(x),'X has the same score timing and articulation as its references.');
      const result=key(x)===key(a)?'A':key(x)===key(b)?'B':null;
      assert.ok(result,'X exactly matches one fixed reference sample.');return result;
    }
    async function samples(){
      const a=await play('#temperament-play-a'),b=await play('#temperament-play-b'),x=await play();
      return {a,b,x,answer:match(a,b,x)};
    }
    async function setABX(a='12edo',b='meantone-quarter',level='level-1'){
      await page.locator('#temperament-task').selectOption('abx');
      // Set B first when needed, avoiding an accidental temporary same-pair choice.
      if(await page.locator('#temperament-a').inputValue()===b)await page.locator('#temperament-a').selectOption(a===b?'pythagorean':a);
      await page.locator('#temperament-b').selectOption(b);await page.locator('#temperament-a').selectOption(a);
      await page.locator('#level').selectOption(level);
    }
    function assertABXMetadata(attempt,a='12edo',b='meantone-quarter'){
      assert.equal(attempt.mode,'temperaments');assert.equal(attempt.task,'abx');assert.equal(attempt.tuningA,a);assert.equal(attempt.tuningB,b);assert.equal(Object.hasOwn(attempt,'alternatives'),false);
    }
    function assertIDMetadata(attempt,alternatives){
      assert.equal(attempt.mode,'temperaments');assert.equal(attempt.task,'identify');assert.equal(attempt.alternatives,alternatives);assert.equal(Object.hasOwn(attempt,'tuningA'),false);assert.equal(Object.hasOwn(attempt,'tuningB'),false);
    }

    assert.equal(await page.locator('#level').inputValue(),'level-7');
    await page.locator('#mode-nav [data-mode="temperaments"]').click();await setABX();await page.locator('#timbre').selectOption('sine');
    assert.deepEqual(await page.locator('#temperament-a option').evaluateAll(ns=>ns.map(n=>n.value)),IDS);
    assert.deepEqual(await page.locator('#temperament-b option').evaluateAll(ns=>ns.map(n=>n.value)),IDS);
    assert.match(await page.locator('#play').innerText(),/Play X/);
    assert.equal(await allDisabled(),true);
    const q=await expected();
    const a=await play('#temperament-play-a',2700);assertAudio(a,q.referenceA,'reference A');assert.equal(await allDisabled(),true);
    assert.match(await page.locator('#temperament-heard-a').innerText(),/A\s*:?\s+heard/i);
    const x=await play('#play',2700);assertAudio(x,q.events,'X');assert.equal(await allDisabled(),true);assert.match(await page.locator('#play').innerText(),/Replay X/);
    await page.locator('#temperament-play-b').click();await page.locator('#stop').click();
    assert.equal(await allDisabled(),true,'Stopping B does not grant a completed listen.');
    assert.doesNotMatch(await page.locator('#temperament-heard-b').innerText(),/B\s*:?\s+heard/i);
    const b=await play('#temperament-play-b',2700);assertAudio(b,q.referenceB,'reference B');
    assert.equal(await page.locator('.answer-choice').first().isEnabled(),true);
    const answer=match(a,b,x);const replayA=await play('#temperament-play-a',2700);assert.deepEqual(sound(replayA),sound(a));
    assert.ok(a.some((n,i)=>Math.abs(1200*Math.log2(n.frequency/b[i].frequency))>1),'The compared tunings are not rounded to the same MIDI notes.');
    const beforeCorrect=await count();await page.locator(`[data-answer="${answer}"]`).click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');assertABXMetadata((await record()).attempts.at(-1));
    await page.keyboard.press('1');await page.keyboard.press('2');assert.equal(await count(),beforeCorrect+1);
    console.log('PASS: real A/B/X audio has matched timing, distinct fractional pitches, fixed replay, all-three listening gate, and first-attempt ABX scoring.');

    // Actual tone frequencies/timing have been checked above. Accelerate only the
    // remaining UI timers; every subsequent sample still schedules real oscillators.
    await page.clock.install();fastClock=true;
    const afterGrade=await record();await play('#temperament-play-b');await play();assert.deepEqual(await record(),afterGrade);
    await page.evaluate(()=>{window.__rng=.75;});await page.locator('#next').click();assert.equal(await allDisabled(),true);
    const wrongSamples=await samples();const wrong=wrongSamples.answer==='A'?'B':'A';await page.locator(`[data-answer="${wrong}"]`).click();
    assert.equal((await record()).attempts.at(-1).outcome,'incorrect');assertABXMetadata((await record()).attempts.at(-1));

    await page.evaluate(()=>{window.__rng=.25;});await page.locator('#level').selectOption('level-8');await page.locator('#temperament-task').selectOption('identify');
    assert.equal(await page.locator('#temperament-play-a').isVisible(),false);assert.equal(await page.locator('#temperament-play-b').isVisible(),false);
    assert.equal(await page.locator('.answer-choice').count(),8);assert.equal(await allDisabled(),true);
    const identify=await expected('level-8','identify');assertAudio(await play(),identify.events,'named identification');
    assert.equal(await page.locator('.answer-choice').first().isEnabled(),true);await page.locator(`[data-answer="${identify.answer}"]`).click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');assertIDMetadata((await record()).attempts.at(-1),8);
    await page.locator('#level').selectOption('level-1');const identifyLow=await expected('level-1','identify');await play();
    await page.locator(`[data-answer="${identifyLow.choices.find(c=>c.value!==identifyLow.answer).value}"]`).click();
    assert.equal((await record()).attempts.at(-1).outcome,'incorrect');assertIDMetadata((await record()).attempts.at(-1),2);
    console.log('PASS: ABX and named identification score independently and retain task/pair/alternative-count metadata.');

    await setABX();const priorB=await page.locator('#temperament-b').inputValue();await page.locator('#temperament-b').selectOption('12edo');
    assert.equal(await page.locator('#temperament-b').inputValue(),priorB);assert.match(await page.locator('#toast').innerText(),/different|distinct|same/i);
    await setABX('12edo','vallotti');const diagnostic=await expected('level-1','abx','12edo','vallotti');assert.equal(diagnostic.diagnostic,true);
    const diagnosticSounds=await samples();assertAudio(diagnosticSounds.a,diagnostic.referenceA,'diagnostic A');assertAudio(diagnosticSounds.b,diagnostic.referenceB,'diagnostic B');
    assert.notEqual(key(diagnosticSounds.a),key(diagnosticSounds.b));
    const beforeCancel=await count();
    await page.locator('#temperament-play-a').click();await page.locator('#level').selectOption('level-2');assert.equal(await allDisabled(),true);
    await page.locator('#temperament-play-b').click();await page.locator('#mode-nav [data-mode="intervals"]').click();
    assert.equal(await count(),beforeCancel);await page.locator('#mode-nav [data-mode="temperaments"]').click();assert.equal(await allDisabled(),true);
    console.log('PASS: same-pair rejection, diagnostic replacement of an identical probe, and level/mode interruption without granting listens or scores.');

    await setABX();await page.locator('#timbre').selectOption('sine');const fixedCount=await count();
    await page.locator('#start-temperament-test').click();
    for(const selector of ['#level','#timbre','#temperament-task','#temperament-a','#temperament-b'])assert.equal(await page.locator(selector).isDisabled(),true);
    assert.equal(await page.locator('#reveal').isVisible(),false);assert.equal(await allDisabled(),true);
    const cancelled=await samples();await page.locator(`[data-answer="${cancelled.answer}"]`).click();
    assert.equal(await count(),fixedCount);assert.deepEqual((await record()).temperamentTests,priorTests);
    await page.locator('#end-temperament-test').click();assert.deepEqual((await record()).temperamentTests,priorTests);
    await page.locator('#start-temperament-test').click();await page.locator('#temperament-play-a').click();
    await page.locator('.top-nav [data-page="progress"]').click();await page.locator('.top-nav [data-page="practice"]').click();
    assert.equal(await page.locator('#temperament-test-status').isVisible(),false);assert.deepEqual((await record()).temperamentTests,priorTests);

    await page.locator('#start-temperament-test').click();
    const expectedTrials=[];
    for(let i=0;i<20;i++){
      assert.equal(await allDisabled(),true,`Trial ${i+1} starts without inherited hearing flags.`);
      const sa=await play('#temperament-play-a');assert.equal(await allDisabled(),true);
      const sb=await play('#temperament-play-b');assert.equal(await allDisabled(),true);
      const sx=await play();const truth=match(sa,sb,sx);
      if(i===0){assert.deepEqual(sound(await play('#temperament-play-a')),sound(sa));assert.deepEqual(sound(await play('#temperament-play-b')),sound(sb));assert.deepEqual(sound(await play()),sound(sx));}
      const response=i<15?truth:truth==='A'?'B':'A';expectedTrials.push({answer:truth,response});
      await page.locator(`[data-answer="${response}"]`).click();
      assert.equal(await page.locator('#feedback.recorded').isVisible(),true);
      assert.equal(await page.locator('.feedback-answer,.answer-choice.correct,.answer-choice.incorrect').count(),0);
      assert.equal(await page.locator('#session-accuracy').textContent(),'—');assert.equal(await page.locator('#reveal').isVisible(),false);
      assert.equal(await count(),fixedCount);
      if(i<19)assert.deepEqual((await record()).temperamentTests,priorTests);
      await page.locator('#next').click();
    }
    const tests=(await record()).temperamentTests;assert.equal(tests.length,50,'Completed tests retain the newest fifty runs.');
    assert.equal(tests.some(t=>t.timestamp===priorTests[0].timestamp),false);assert.deepEqual(tests.slice(0,-1),priorTests.slice(1));
    const completed=tests.at(-1);assert.equal(completed.protocol,'temperament-abx-v1');assert.equal(completed.tuningA,'12edo');assert.equal(completed.tuningB,'meantone-quarter');assert.equal(completed.level,'level-1');assert.equal(completed.timbre,'sine');assert.deepEqual(completed.trials,expectedTrials);
    assert.equal(completed.trials.filter(t=>t.answer===t.response).length,15);
    assert.equal(await page.locator('#set-summary .temperament-result').isVisible(),true);
    const resultText=await page.locator('#set-summary').innerText();assert.match(resultText,/15\s*(?:\/|of)\s*20/);assert.match(resultText,/75%/);assert.match(resultText,/50%/);assert.match(resultText,/0\.020(?:6|7)/);
    const numerator=Array.from({length:6},(_,i)=>[15504,4845,1140,190,20,1][i]).reduce((a,b)=>a+b,0);assert.equal(numerator/2**20,21700/1048576);
    console.log('PASS: cancelled tests save nothing; twenty neutral, fully heard/replayable trials save separately, retain fifty histories, and report15/20 with the exact-binomial chance comparison.');

    await page.locator('.top-nav [data-page="progress"]').click();await page.locator('#progress-mode').selectOption('temperaments');
    for(const task of ['abx','identify']){await page.locator('#progress-task').selectOption(task);assert.match(await page.locator('#progress-summary').innerText(),/50%/);}
    await page.locator('#progress-task').selectOption('identify');await page.locator('#progress-level').selectOption('level-8');assert.match(await page.locator('#progress-summary').innerText(),/100%/);
    await page.locator('#progress-level').selectOption('level-1');assert.match(await page.locator('#progress-summary').innerText(),/0%/);
    assert.equal(await page.locator('#temperament-test-history').isVisible(),true);
    const beforeBackup=await record();const downloadEvent=page.waitForEvent('download');await page.locator('#export-progress').click();const download=await downloadEvent;const backup=await fs.readFile(await download.path());assert.deepEqual(JSON.parse(backup),beforeBackup);
    await page.locator('#import-progress').setInputFiles({name:'temperaments.json',mimeType:'application/json',buffer:backup});assert.deepEqual(await record(),beforeBackup);
    const oldBackup={version:1,settings:seed.settings,attempts:legacyAttempts,pitchTests:[oldPitch]};
    await page.locator('#import-progress').setInputFiles({name:'old-overtone.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});assert.deepEqual((await record()).attempts,beforeBackup.attempts);assert.deepEqual((await record()).pitchTests,beforeBackup.pitchTests);
    for(const mutate of [data=>{data.attempts.find(a=>a.task==='abx').tuningB='12edo';},data=>{data.attempts.find(a=>a.task==='identify').alternatives=99;},data=>{data.temperamentTests.at(-1).trials[0].response='C';}]){
      const invalid=JSON.parse(backup);mutate(invalid);await page.locator('#import-progress').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});assert.match(await page.locator('#toast').innerText(),/Import failed/);assert.deepEqual(await record(),beforeBackup);
    }
    assert.deepEqual((await record()).attempts.slice(0,legacyAttempts.length),legacyAttempts);assert.deepEqual((await record()).pitchTests,[oldPitch]);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.mode-button').length===9);assert.deepEqual(await record(),beforeBackup);
    console.log('PASS: subtype/level progress filters, separate test history, legacy pitch/ensemble data, metadata backups, idempotent merging, invalid-record rejection, and reload persistence.');

    await page.locator('.top-nav [data-page="guide"]').click();assert.equal(await page.locator('#temperament-guide').isVisible(),true);
    assert.deepEqual(await page.locator('#temperament-reference-tuning option').evaluateAll(ns=>ns.map(n=>n.value)),IDS);
    const benchScore=await page.evaluate(async()=>{const {temperamentReferenceScore}=await import('./temperament-ui.js');return temperamentReferenceScore();});
    const bench=[];
    for(const id of IDS){
      await page.locator('#temperament-reference-tuning').selectOption(id);const tones=await play('#temperament-reference-play');assert.ok(tones.length>0);
      const wanted=await page.evaluate(async({score,id})=>{const {applyTuning}=await import('./temperaments.js');return applyTuning(score,id);},{score:benchScore,id});
      assertAudio(tones,wanted,`${id} reference bench`);assert.ok(Math.abs(tones[0].frequency-440)<.001,'All eight presets share the actual A4=440Hz anchor.');bench.push(tones);
    }
    for(const tones of bench)assert.deepEqual(shape(tones),shape(bench[0]));
    assert.equal(new Set(bench.map(key)).size,8,'All eight full reference probes synthesize distinct tuning layouts.');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('.top-nav [data-page="practice"]').click();await page.locator('#mode-nav [data-mode="temperaments"]').click();
      for(const selector of ['#temperament-play-a','#temperament-play-b','#play']){assert.equal(await page.locator(selector).isVisible(),true);assert.ok((await page.locator(selector).boundingBox()).height>=44);}
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('.top-nav [data-page="guide"]').click();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: all eight reference presets play; matched benchmark timing, responsive320/390px controls, no runtime errors or external asset requests.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
