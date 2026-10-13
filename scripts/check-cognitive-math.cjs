const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const baseUrl=process.env.CLEAR_QA_URL||'http://127.0.0.1:8765/cognitive/';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'UTC'});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const epoch=new Date('2026-10-12T12:00:00Z');await page.clock.install({time:epoch});await page.clock.pauseAt(new Date(epoch.getTime()+1));
 await page.goto(baseUrl);await page.evaluate(()=>navigate('math'));
 assert.equal(await page.evaluate(()=>MATH.families.length),166);
 assert.equal(await page.evaluate(()=>new Set(MATH.families.map(f=>f.group)).size),14);
 assert.equal(await page.locator('.math-family').count(),12);
 await page.locator('#math-search').fill('eigen');assert.ok(await page.locator('.math-family').count()>0);
 await page.locator('#math-search').fill('');await page.locator('[data-math-favorite]').first().click();
 assert.equal(await page.evaluate(()=>state.taskData.math.favorites.length),1);
 await page.locator('#math-favorites-filter').click();assert.equal(await page.locator('.math-family').count(),1);
 await page.locator('#math-favorites-filter').click();
 await page.evaluate(()=>{
  for(const f of MATH.families)for(const level of [1,8])for(let seed=0;seed<30;seed++){
   const q=MATH.generate(f.id,level,MATH.seeded(seed+level*1000));
   if(!MATH.checkAnswer(q,q.answer).correct)throw Error(f.id+' rejects its answer');
  }
  for(const bad of ['1/0','constructor(1)+1','process.exit()','sqrt(-1)','1;2','1 2','1.2.3'])if(MATH.parseNumber(bad).valid)throw Error('Unsafe parser acceptance');
  if(MATH.checkAnswer(MATH.numeric('q',1000000000,'e'),'1000000001').correct)throw Error('Large integer near miss accepted');
  const generate=MATH.generate;MATH.generate=(id,level,rng)=>{const q=generate(id,level,rng);window.qaMathQuestion=q;return q};
 });
 console.log('166 types, 14 groups, 9,960 seeded questions, safe parser, search and favorites pass.');
 const arithmetic='arith_addition';
 async function launch(config){await page.evaluate(config=>MATH.launch(config),config);await page.getByRole('button',{name:config.mode==='sprint'?'Begin sprint':config.mode==='daily'?(await page.locator('.math-replay-note').count()?'Begin replay':'Begin daily set'):'Begin practice',exact:true}).click()}
 async function answerCurrent(){const q=await page.evaluate(()=>qaMathQuestion);if(await page.locator('#math-answer').count()){await page.locator('#math-answer').fill(q.answer);await page.locator('#math-answer').press('Enter')}else{const choices=page.locator('[data-math-choice]');const index=await choices.evaluateAll(nodes=>nodes.findIndex(n=>MATH.checkAnswer(qaMathQuestion,n.textContent).correct));assert.ok(index>=0);await choices.nth(index).click()}}
 async function fixedSession(config,{hint=false,invalid=false}={}){
  await launch(config);const prompts=[];
  for(let i=0;i<config.count;i++){
   prompts.push(await page.locator('#math-question').innerText());
   if(i===0&&invalid){await page.locator('#math-answer').fill('1/0');await page.locator('#math-check').click();assert.match(await page.locator('#math-feedback').innerText(),/Try that answer again/);assert.equal(await page.locator('#math-live-correct').innerText(),'0 / 0')}
   if(i===0&&hint)await page.locator('#math-hint').click();
   await answerCurrent();if(await page.locator('#math-answer').count())assert.equal(await page.locator('#math-answer').getAttribute('aria-invalid'),null);assert.equal(await page.locator('#math-live-correct').innerText(),`${i+1} / ${i+1}`);
   await page.locator('#math-next').click();
  }
  assert.match(await page.locator('.big-score').innerText(),/^100/);
  const record=await page.evaluate(()=>state.history.at(-1));assert.equal(record.correct,config.count);assert.equal(record.total,config.count);
  return {record,prompts};
 }
 const config={ids:[arithmetic],level:1,count:5,mode:'practice',answerStyle:'typed',seed:112};
 const assisted=await fixedSession(config,{hint:true,invalid:true});assert.equal(assisted.record.metrics.math.assisted,1);assert.equal(assisted.record.metrics.rtCount,4);
 assert.equal(await page.evaluate(()=>state.tasks.math_arith_addition.level),1);
 await fixedSession(config);await fixedSession(config);assert.equal(await page.evaluate(()=>state.tasks.math_arith_addition.level),2);
 await fixedSession({...config,answerStyle:'choice'});
 console.log('Typed/choice sessions, invalid retry, assistance exclusion and unassisted promotion pass.');

 await launch({...config,ids:['vis_fraction']});const needed=Number(await page.evaluate(()=>qaMathQuestion.answer));
 for(let i=0;i<needed;i++)await page.locator('.mv-tile').nth(i).click();
 assert.equal(await page.locator('#math-answer').inputValue(),String(needed));await page.locator('#math-check').click();
 assert.equal(await page.locator('#math-live-correct').innerText(),'1 / 1');assert.ok(await page.locator('#math-visual button').evaluateAll(nodes=>nodes.every(n=>n.disabled)));
 await page.evaluate(()=>navigate('math'));
 const mix=await fixedSession({...config,ids:await page.evaluate(()=>MATH.families.filter(f=>!f.id.startsWith('vis_')).slice(0,40).map(f=>f.id))});
 assert.equal(mix.record.metrics.math.topics.length,5);
 assert.match(mix.record.profile.label,/Addition sprints/);assert.match(mix.record.profile.label,/\(\+38\)/);
 console.log('Interactive visual scoring works; mixed sessions count only presented topics.');

 const dailyConfig={...config,mode:'daily'};
 const firstDaily=await fixedSession(dailyConfig);const dailyBefore=await page.evaluate(()=>JSON.stringify(state.taskData.math.daily));
 const replay=await fixedSession(dailyConfig);assert.deepEqual(replay.prompts,firstDaily.prompts);assert.equal(replay.record.practice,true);assert.equal(replay.record.metrics.math.dailyReplay,true);
 await fixedSession(dailyConfig);assert.equal(await page.evaluate(()=>state.tasks.math_arith_addition.level),1);
 assert.equal(await page.evaluate(()=>JSON.stringify(state.taskData.math.daily)),dailyBefore);
 await launch({...config,mode:'sprint',seconds:60});await page.clock.runFor(59999);assert.equal(await page.locator('#math-question').count(),1);await page.clock.runFor(1);
 const sprint=await page.evaluate(()=>state.history.at(-1));assert.equal(sprint.correct,0);assert.equal(sprint.total,1);assert.equal(sprint.metrics.math.skips,1);
 console.log('Daily sets are deterministic, replay cannot promote, and sprint deadline counts the unfinished question.');

 await page.evaluate(()=>navigate('math'));const before=await page.evaluate(()=>JSON.parse(JSON.stringify(state)));await page.reload();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(state))),before);
 assert.equal(await page.locator('.math-page').count(),1);
 await page.evaluate(()=>navigate('progress'));await page.locator('#chart-task').selectOption('math_'+arithmetic);
 assert.ok(await page.locator('#progress-accuracy-chart svg').count());
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export progress',exact:true}).click();const file=await downloadEvent;const backupPath='/tmp/clear-math-backup.json';await file.saveAs(backupPath);
 await page.locator('#import-file').setInputFiles(backupPath);await page.getByRole('button',{name:'Replace with backup',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(state))),before);
 console.log('Math IDs, favorites, settings, daily records and profile metrics survive reload and backup import.');

 await page.evaluate(()=>navigate('math'));for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.locator('.math-page button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).every(n=>n.getBoundingClientRect().height>=44)));
  if(process.env.CLEAR_SCREENSHOTS)await page.screenshot({path:process.env.CLEAR_SCREENSHOTS+'/mental-math-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await launch({...config,mode:'sprint',seconds:60});const count=await page.evaluate(()=>state.history.length);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await page.clock.runFor(120000);assert.equal(await page.evaluate(()=>state.history.length),count);
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(new URL(baseUrl).origin)));
 await browser.close();console.log('320/390/1280px layouts, 44px controls, foreground interruption and no external requests pass.');
})().catch(error=>{console.error(error);process.exit(1)});
