const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const baseUrl=process.env.CLEAR_QA_URL||'http://127.0.0.1:8765/cognitive/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.clock.install();await page.goto(baseUrl);
 assert.equal(await page.locator('.exercise-card').count(),14);
 if(process.env.CLEAR_SCREENSHOTS)await page.screenshot({path:process.env.CLEAR_SCREENSHOTS+'/mobile.png',fullPage:true});
 await page.evaluate(()=>{window.heard=[];audio=function(letter,mode){window.heard.push(letter);return true}});
 await page.locator('.featured button').click();await page.locator('#nback-sound-mode').selectOption('tone');await page.getByRole('button',{name:'Begin 2-back',exact:true}).click();
 const positions=[];
 for(let i=0;i<22;i++){
  positions.push(await page.locator('.task-grid .tile').evaluateAll(ns=>ns.findIndex(n=>n.classList.contains('lit'))));
  const sounds=await page.evaluate(()=>window.heard);
  if(i>=2){if(positions[i]===positions[i-2])await page.getByRole('button',{name:'Position · F',exact:true}).click();if(sounds[i]===sounds[i-2])await page.getByRole('button',{name:'Sound · J',exact:true}).click()}
  await page.clock.runFor(2500);
 }
 assert.match(await page.locator('.big-score').innerText(),/^100/);
 assert.equal(await page.evaluate(()=>state.history.length),1);
 assert.equal(await page.evaluate(()=>state.history[0].correct),40);
 console.log('Actual dual n-back sequence: 100%, 40/40 decisions, completed and saved.');
 async function searchRound(level,correct){await page.evaluate(l=>startTask('search',l),level);await page.getByRole('button',{name:'Begin',exact:true}).click();for(let i=0;i<12;i++){await page.locator('#task-stage .tile').filter({hasText:correct?'T':'L'}).first().click();await page.clock.runFor(450)}assert.match(await page.locator('.big-score').innerText(),correct?/^100/:/^0/)}
 await searchRound(1,true);await searchRound(1,true);assert.equal(await page.evaluate(()=>state.tasks.search.level),2);
 await searchRound(2,false);await searchRound(2,false);assert.equal(await page.evaluate(()=>state.tasks.search.level),1);
 console.log('Two accurate sessions promote; two low-accuracy sessions reduce difficulty.');
 const saved=await page.evaluate(()=>JSON.stringify(state));await page.reload();assert.equal(await page.evaluate(()=>JSON.stringify(state)),saved);console.log('Progress survives reload.');
 await page.evaluate(()=>navigate('progress'));assert.equal(await page.locator('.history-row').count(),5);assert.equal(await page.locator('.progress-table tbody tr').count(),14);
 await page.locator('#chart-task').selectOption('search');assert.equal(await page.locator('#progress-accuracy-chart svg').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export progress',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^clear-progress-.*\.json$/);console.log('Progress view, chart, and JSON export work.');
 await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"history":null}')});assert.match(await page.locator('#toast').innerText(),/valid Clear/);
 const localRecord=await page.evaluate(()=>localStorage.getItem(STORE));await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(localRecord)});await page.getByRole('button',{name:'Replace with backup',exact:true}).click();assert.equal(await page.evaluate(()=>state.history.length),5);
 await page.getByRole('button',{name:'Reset progress',exact:true}).click();await page.getByRole('button',{name:'Keep progress',exact:true}).click();assert.equal(await page.evaluate(()=>state.history.length),5);
 console.log('Import validation/replacement and reset cancellation work.');
 await page.evaluate(()=>startTask('nback'));await page.getByRole('button',{name:'Begin 2-back',exact:true}).click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});assert.match(await page.locator('h1').innerText(),/paused/);await page.clock.runFor(100000);assert.equal(await page.evaluate(()=>state.history.length),5);console.log('Backgrounding cancels timing and discards unfinished score.');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});navigate('evidence')});assert.equal(await page.locator('.reference-list li').count(),10);if(process.env.CLEAR_SCREENSHOTS)await page.screenshot({path:process.env.CLEAR_SCREENSHOTS+'/evidence.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>navigate('practice'));if(process.env.CLEAR_SCREENSHOTS)await page.screenshot({path:process.env.CLEAR_SCREENSHOTS+'/desktop.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.equal(errors.length,0,errors.join('\n'));assert.ok(requests.every(url=>url.startsWith(new URL(baseUrl).origin)));console.log('No page errors or external resource requests.');
 await page.setViewportSize({width:320,height:740});await page.evaluate(()=>startTask('search',8));await page.getByRole('button',{name:'Begin',exact:true}).click();assert.ok(await page.locator('#task-stage .task-grid').evaluate(n=>n.scrollWidth<=n.clientWidth));assert.ok(await page.locator('#task-stage .tile').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().width>=44&&n.getBoundingClientRect().height>=44)));
 await page.evaluate(()=>startTask('pairs',8));await page.getByRole('button',{name:'Study word pairs',exact:true}).click();await page.getByRole('button',{name:'Ready to recall',exact:true}).click();await page.locator('.stimulus').evaluate(n=>n.textContent='Notebook');assert.ok(await page.locator('.stimulus').evaluate(n=>n.scrollWidth<=n.clientWidth));
 await page.evaluate(()=>startTask('nback'));await page.locator('#run-level').selectOption('4');assert.equal(await page.evaluate(()=>state.tasks.nback.level),4);await page.evaluate(()=>navigate('practice'));await page.locator('.featured button').click();assert.equal(await page.locator('#run-level').inputValue(),'4');console.log('320px high-level touch targets fit; manual n-back level persists.');
 await page.evaluate(()=>navigate('practice'));const htmlDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Download single HTML',exact:true}).click();const file=await htmlDownload;const offlinePath='/tmp/clear-cognitive-qa.html';await file.saveAs(offlinePath);const offline=await browser.newPage();const offlineErrors=[];offline.on('pageerror',e=>offlineErrors.push(e.message));await offline.context().setOffline(true);await offline.setContent(require('node:fs').readFileSync(offlinePath,'utf8'));assert.equal(await offline.locator('.exercise-card').count(),14);assert.equal(offlineErrors.length,0);await offline.close();console.log('Downloaded standalone HTML runs with networking disabled.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
