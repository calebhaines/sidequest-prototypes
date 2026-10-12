const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const baseUrl=process.env.CLEAR_QA_URL||'http://127.0.0.1:8765/cognitive/';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'UTC'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const now=Date.parse('2026-10-12T12:00:00Z'),day=86400000;
 await page.clock.install({time:new Date(now)});await page.clock.pauseAt(new Date(now+1));await page.goto(baseUrl);
 const profile={protocol:'nback-v1',input:'mouse',device:'phone'};
 const base={id:'nback',level:2,variant:'tone',accuracy:80,correct:32,total:40,seconds:60,practice:false};
 const counts=(hit,miss,falseAlarm,correctRejection)=>({hit,miss,falseAlarm,correctRejection});
 const history=[
  {...base,at:now-4*day},
  {...base,at:now-2*3600000,accuracy:78,seconds:80,profile,metrics:{rtMs:400,rtCount:7,channels:{position:counts(3,3,0,14),sound:counts(4,2,1,13)}}},
  {...base,at:now-3600000,accuracy:74,seconds:60,profile,metrics:{rtMs:600,rtCount:8,channels:{position:counts(6,0,2,12),sound:counts(2,4,3,11)}}},
  {...base,at:now-1800000,accuracy:60,seconds:50,profile,metrics:{rtMs:null,rtCount:0}},
  {...base,at:now-2*day,variant:'voice',accuracy:100,profile,metrics:{rtMs:123,rtCount:12}},
  {...base,at:now-3*day,accuracy:90,profile:{...profile,input:'touch'},metrics:{rtMs:999,rtCount:10}},
  {...base,at:now-3*day,level:3,accuracy:100,profile,metrics:{rtMs:888,rtCount:12}},
  {id:'stroop',level:1,accuracy:60,correct:12,total:20,seconds:40,at:now-8*day},
  {id:'operation',level:1,accuracy:93,correct:14,total:15,seconds:100,at:now-3*3600000,profile:{...profile,protocol:'operation-v1'},metrics:{rtMs:250,rtCount:10,processing:{correct:10,total:15,timeouts:1},recall:{correct:14,total:15,complete:4,totalSequences:5}}},
  {id:'operation',level:1,accuracy:100,correct:15,total:15,seconds:100,at:now-600000,profile:{...profile,protocol:'operation-v1'},metrics:{rtMs:100,rtCount:15,processing:{correct:15,total:15,timeouts:0},recall:{correct:15,total:15,complete:5,totalSequences:5}}}
 ];
 const water={streak:2,due:now+day,lastReviewed:now-3*day};
 const fixture={version:1,tasks:{nback:{level:2},operation:{level:1},stroop:{level:1}},history,taskData:{retrieval:{cards:{water}}}};
 await page.evaluate(()=>navigate('progress'));
 await page.locator('#import-file').setInputFiles({name:'mixed-history.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await page.getByRole('button',{name:'Replace with backup',exact:true}).click();
 assert.equal(await page.evaluate(()=>state.history.length),10);
 assert.deepEqual(await page.evaluate(()=>state.taskData.retrieval.cards.water),water);
 assert.equal(await page.locator('#chart-task').inputValue(),'nback');
 assert.equal(await page.locator('#chart-mode').inputValue(),'tone');
 assert.equal(await page.locator('#chart-level').inputValue(),'2');
 assert.equal(await page.locator('#chart-profile').inputValue(),JSON.stringify(['nback-v1','mouse','phone']));
 assert.equal(await page.locator('#progress-accuracy-chart svg circle').count(),3);
 assert.equal(await page.locator('#progress-rt-chart svg circle').count(),2);
 assert.match(await page.locator('#progress-rolling-summary').innerText(),/70\.7% mean accuracy/);
 assert.match(await page.locator('#progress-week-summary').innerText(),/this week so far/);
 assert.equal(await page.locator('#progress-week-summary .progress-activity-stats strong').allTextContents().then(xs=>xs.join(',')),'5,6.5,1');
 await page.locator('#chart-view').selectOption('week');
 assert.equal(await page.locator('#progress-accuracy-chart svg circle').count(),1);
 assert.equal(await page.locator('#progress-rt-chart svg circle').count(),1);
 assert.match(await page.locator('#progress-rt-chart').innerText(),/500 ms/);
 await page.locator('.progress-channel-details > summary').click();
 assert.match(await page.locator('#progress-hit-chart').innerText(),/Position: latest 75%/);
 assert.match(await page.locator('#progress-hit-chart').innerText(),/Sound: latest 50%/);
 assert.match(await page.locator('#progress-false-alarm-chart').innerText(),/Position: latest 7\.1%/);
 assert.match(await page.locator('#progress-false-alarm-chart').innerText(),/Sound: latest 14\.3%/);
 await page.locator('#progress-hit-chart summary').click();
 assert.match(await page.locator('#progress-hit-chart').innerText(),/9 \/ 12 targets/);
 console.log('Actual Progress UI filters settings and sound; weekly rates use recorded counts; missing RT stays missing.');

 await page.locator('#chart-view').selectOption('session');
 await page.locator('#chart-profile').selectOption('earlier');
 assert.equal(await page.locator('#progress-accuracy-chart svg circle').count(),1);
 assert.equal(await page.locator('#progress-rt-chart svg').count(),0);
 assert.match(await page.locator('#progress-rt-chart').innerText(),/not recorded for earlier settings/);
 assert.equal(await page.evaluate(()=>state.history.find(h=>!h.profile&&h.id==='nback').accuracy),80);
 await page.locator('#chart-profile').selectOption(JSON.stringify(['nback-v1','touch','phone']));
 assert.match(await page.locator('#progress-rolling-summary').innerText(),/90% mean accuracy/);
 await page.locator('#chart-mode').selectOption('voice');
 assert.match(await page.locator('#progress-rolling-summary').innerText(),/100% mean accuracy/);
 await page.locator('#chart-task').selectOption('operation');await page.locator('#chart-view').selectOption('week');
 assert.match(await page.locator('#progress-processing-chart').innerText(),/83\.3%/);
 const before=await page.evaluate(()=>JSON.stringify(state));await page.reload();
 assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);
 console.log('Legacy scores and spaced-review schedules remain intact through import and reload.');

 await page.evaluate(()=>navigate('progress'));await page.locator('#chart-task').selectOption('nback');
 await page.locator('#chart-mode').selectOption('tone');await page.locator('#chart-profile').selectOption(JSON.stringify(['nback-v1','mouse','phone']));
 await page.locator('.progress-channel-details > summary').click();
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.locator('.progress-controls select').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).every(n=>n.getBoundingClientRect().height>=44)));
  if(process.env.CLEAR_SCREENSHOTS)await page.screenshot({path:process.env.CLEAR_SCREENSHOTS+'/progress-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
 await browser.close();console.log('Progress layouts at320/390/1280px passed without browser errors.');
})().catch(error=>{console.error(error);process.exit(1)});
