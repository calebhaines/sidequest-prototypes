const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const baseUrl=process.env.CLEAR_QA_URL||'http://127.0.0.1:8765/cognitive/';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true,timezoneId:'UTC'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date('2026-10-12T12:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-12T12:00:01Z'));
 await page.goto(baseUrl);
 assert.equal(await page.locator('.exercise-card').count(),14);

 async function complexSession(id,processing='correct'){
  await page.evaluate(id=>startTask(id,1),id);
  await page.getByRole('button',{name:'Begin '+(id==='operation'?'operation':'symmetry')+' span',exact:true}).click();
  let judged=0;
  for(let set=0;set<5;set++){
   const sequence=[];
   for(let item=0;item<3;item++){
    let answer;
    if(id==='operation'){
     const expression=await page.locator('.stimulus').innerText();
     const [,a,b,c,value]=expression.match(/^\((\d+) × (\d+)\) \+ (\d+) = (-?\d+)$/).map(Number);
     answer=a*b+c===value;
    }else{
     const cells=await page.locator('#task-stage .tile').evaluateAll(nodes=>nodes.map(node=>node.classList.contains('lit')));
     answer=Array.from({length:4},(_,row)=>[0,1].every(col=>cells[4*row+col]===cells[4*row+3-col])).every(Boolean);
    }
    if(processing==='timeout'&&judged===0)await page.clock.runFor(6000);
    else{
     await page.clock.runFor(120);
     const response=processing==='wrong'?!answer:answer;
     await page.getByRole('button',{name:id==='operation'?(response?'True':'False'):(response?'Symmetric':'Not symmetric'),exact:true}).click();
    }
    sequence.push(id==='operation'?await page.locator('.stimulus').innerText():await page.locator('#task-stage .tile').evaluateAll(nodes=>nodes.findIndex(node=>node.classList.contains('lit'))));
    await page.clock.runFor(1150);judged++;
   }
   assert.match(await page.locator('#run-status').innerText(),/ordered recall/);
   assert.equal(await page.locator('#task-stage .lit').count(),0);
   assert.ok(await page.locator('#task-stage button').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().width>=44&&node.getBoundingClientRect().height>=44)));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const item of sequence){
    await page.getByRole('button',{name:id==='operation'?item:new RegExp('^Location '+(item+1)+','),exact:id==='operation'}).click();
   }
   await page.getByRole('button',{name:'Check recall',exact:true}).click();
   await page.clock.runFor(7000);
   assert.match(await page.locator('#run-status').innerText(),/complete/);
   await page.getByRole('button',{name:set===4?'See results':'Next set',exact:true}).click();
  }
  assert.match(await page.locator('.big-score').innerText(),/^100/);
  const record=await page.evaluate(()=>state.history.at(-1));
  assert.equal(record.correct,15);assert.equal(record.total,15);
  assert.deepEqual(record.metrics.recall,{correct:15,total:15,complete:5,totalSequences:5});
  assert.deepEqual(record.metrics.processing,{correct:processing==='wrong'?0:processing==='timeout'?14:15,total:15,timeouts:processing==='timeout'?1:0});
  assert.equal(record.metrics.rtMs,processing==='wrong'?null:120);
  assert.equal(record.metrics.rtCount,processing==='wrong'?0:processing==='timeout'?14:15);
  assert.deepEqual(record.profile,{protocol:id+'-v1',input:'mouse',device:'phone'});
  console.log(id+': serial recall 15/15; processing '+record.metrics.processing.correct+'/15; metrics saved.');
 }
 await complexSession('operation','wrong');await complexSession('operation','wrong');
 assert.equal(await page.evaluate(()=>state.tasks.operation.level),1);
 assert.match(await page.locator('.next-step').innerText(),/processing accuracy/);
 await complexSession('operation');await complexSession('operation');
 assert.equal(await page.evaluate(()=>state.tasks.operation.level),2);
 console.log('Complex-span promotion requires consistent recall and processing accuracy.');
 await complexSession('symmetry','timeout');
 const record=await page.evaluate(()=>JSON.stringify(state));await page.reload();
 assert.equal(await page.evaluate(()=>JSON.stringify(state)),record);
 console.log('Structured recall/processing metrics and settings survive reload.');

 await page.evaluate(()=>startTask('operation',8));
 await page.getByRole('button',{name:'Begin operation span',exact:true}).click();
 const before=await page.evaluate(()=>state.history.length);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>state.history.length),before);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});navigate('progress')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.CLEAR_SCREENSHOTS)await page.screenshot({path:process.env.CLEAR_SCREENSHOTS+'/progress-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('Background cleanup and 320px progress layout passed without browser errors.');
})().catch(error=>{console.error(error);process.exit(1)});
