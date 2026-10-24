const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const baseURL = process.env.OVERTONE_QA_URL || 'http://127.0.0.1:8765/ear-training/';
const STORE = 'overtone.practice.v1';
const MODES = ['intervals','chords','progressions','melody','scales','rhythm','pitch','ensemble'];
const LEVELS = Array.from({length:8},(_,i)=>`level-${i+1}`);

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (!r.url().startsWith(new URL(baseURL).origin)) external.push(r.url()); });
    await page.addInitScript(() => {
      Math.random = () => .25;
      window.__startedNotes = [];
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = create.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = function (at) { window.__startedNotes.push({at,frequency:oscillator.frequency.value}); return start(at); };
        return oscillator;
      };
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => document.querySelectorAll('.mode-button').length === 8);
    const record = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"attempts":[]}'), STORE);
    const count = async () => (await record()).attempts.length;
    async function mode(id, level='level-3') {
      await page.locator(`#mode-nav [data-mode="${id}"]`).click();
      await page.locator('#level').selectOption(level);
    }
    async function question(id, level='level-3') {
      return page.evaluate(async ({id,level}) => {
        const {generateQuestion} = await import('./music.js');
        return generateQuestion(id,level,()=>.25);
      }, {id,level});
    }
    async function listen() {
      await page.locator('#play').click();
      await page.waitForFunction(() => document.querySelector('.answer-choice:not(:disabled),[data-midi]:not(:disabled),[data-step]:not(:disabled)'), null, {timeout:15000});
    }
    async function revealed() {
      await page.locator('#reveal').click();
      assert.match(await page.locator('#feedback').getAttribute('class'), /revealed/);
    }
    assert.equal(await page.locator('.mode-button').count(),8);
    assert.equal(await page.locator('#level option').count(),8);
    assert.ok(await page.locator('.answer-choice').first().isDisabled());

    // Every difficulty/mode must render, reveal the generated answer, and keep skips outside accuracy.
    for (const id of MODES) {
      for (const level of LEVELS) {
        await mode(id,level);
        const q = await question(id,level);
        if (id === 'ensemble') {
          assert.equal(await page.locator('#answer-area [data-ensemble-midi]').count(),12);
          assert.equal(await page.locator('#answer-area select').count(),8);
          assert.equal(await page.locator('[data-ensemble-slot]').count(),q.inputLength);
          assert.equal(q.answer.chords.length,4);
          assert.equal(q.answer.melody.length,q.inputLength);
        }
        else if (id === 'melody') assert.equal(await page.locator('.note-slot').count(),q.inputLength);
        else if (id === 'rhythm') assert.equal(await page.locator('[data-step]').count(),q.rhythmSteps);
        else assert.equal(await page.locator('.answer-choice').count(),q.choices.length);
        await revealed();
        assert.equal(await page.locator('.feedback-answer').textContent(),q.answerLabel);
        assert.equal(await page.locator('#session-accuracy').textContent(),'—');
      }
    }
    assert.equal(await count(),64);
    assert.ok((await record()).attempts.every(a => a.outcome === 'revealed'));
    console.log('PASS: eight exercises × eight levels render; reveal is an unscored skip.');

    await mode('pitch','level-8');
    await page.evaluate(()=>{window.__startedNotes=[];});
    await listen();
    let pitchStarts = await page.evaluate(()=>window.__startedNotes);
    let firstPitch = pitchStarts[0];
    let secondPitch = pitchStarts.find(n=>n.at>firstPitch.at+.01);
    let measuredCents = 1200*Math.log2(secondPitch.frequency/firstPitch.frequency);
    assert.ok(Math.abs(Math.abs(measuredCents)-2)<.01,`The hardest fixed pitch exercise must synthesize a real 2-cent difference (got ${measuredCents}).`);
    await page.locator(`[data-answer="${measuredCents>0?'higher':'lower'}"]`).click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');
    assert.equal((await record()).attempts.at(-1).mode,'pitch');
    console.log('PASS: fixed pitch discrimination synthesizes and scores a fractional two-cent difference.');

    for (const [id,correct] of [['intervals',true],['chords',false],['progressions',true],['scales',true]]) {
      await mode(id);
      const q = await question(id);
      await listen();
      const choice = correct ? q.answer : q.choices.find(c=>c.value!==q.answer).value;
      const before = await count();
      await page.locator(`[data-answer="${choice}"]`).click();
      assert.equal((await record()).attempts.at(-1).outcome,correct?'correct':'incorrect');
      assert.equal(await count(),before+1);
      // Repeated answer keys after grading cannot create additional attempts.
      await page.keyboard.press('1'); await page.keyboard.press('2');
      assert.equal(await count(),before+1);
      assert.equal(await page.locator('.answer-choice.correct').count(),1);
      assert.equal(await page.locator('#session-accuracy').textContent(),correct?'100%':'0%');
    }
    assert.ok(await page.evaluate(()=>window.__startedNotes.length > 40));
    console.log('PASS: real Web Audio playback, correct/wrong identification, first-attempt scoring, double-grade guard.');

    await mode('melody','level-8');
    const melody = await question('melody','level-8');
    await listen();
    assert.ok(await page.locator('[data-action="check"]').isDisabled());
    await page.locator(`[data-midi="${melody.answer[0]}"]`).click();
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.locator('.note-slot.is-filled').count(),0);
    for (const midi of melody.answer) await page.locator(`[data-midi="${midi}"]`).click();
    assert.equal(await page.locator('.note-slot.is-filled').count(),melody.inputLength);
    await page.locator('[data-action="check"]').click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');
    assert.equal(await page.locator('.correct-sequence span').count(),melody.inputLength);
    console.log('PASS: melody exact reconstruction, note slots, undo, and full-length submission gate.');

    await mode('rhythm','level-8');
    const rhythm = await question('rhythm','level-8');
    await page.evaluate(()=>{window.__startedNotes=[];});
    await listen();
    const rhythmStarts = await page.evaluate(()=>window.__startedNotes);
    const firstCount = rhythmStarts.find(n=>Math.abs(n.frequency-440*2**((88-69)/12))<.01);
    const firstHit = rhythmStarts.find(n=>Math.abs(n.frequency-440*2**((76-69)/12))<.01);
    assert.ok(firstCount && firstHit,'The count-in and pattern each schedule a real oscillator.');
    const firstHitOffset = rhythm.answer.findIndex(Boolean)*rhythm.stepDuration;
    assert.ok(Math.abs(firstHit.at-firstCount.at-rhythm.stepDuration*rhythm.rhythmSteps-firstHitOffset)<.000001,'The bar begins on beat five, preserving any leading rests without an arbitrary pause after the count-in.');
    for (let i=0;i<rhythm.answer.length;i++) if (rhythm.answer[i]) await page.locator(`[data-step="${i}"]`).click();
    await page.locator('[data-action="check"]').click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');
    assert.equal(await page.locator('.rhythm-solution .hit').count(),rhythm.answer.filter(Boolean).length);
    console.log('PASS: exact high-level rhythm reconstruction and revealed solution.');

    // Interrupting audio must never unlock the new question or add a grade.
    await mode('intervals');
    let before = await count();
    await page.locator('#play').click(); await page.locator('#stop').click();
    assert.ok(await page.locator('.answer-choice').first().isDisabled());
    assert.match(await page.locator('#audio-status').innerText(),/AWAITING/);
    await page.locator('#play').click();
    await page.locator('#mode-nav [data-mode="chords"]').click();
    assert.ok(await page.locator('.answer-choice').first().isDisabled());
    assert.match(await page.locator('#audio-status').innerText(),/AWAITING/);
    await page.locator('#play').click();
    await page.locator('#level').selectOption('level-8');
    assert.ok(await page.locator('.answer-choice').first().isDisabled());
    await page.waitForTimeout(1700);
    assert.ok(await page.locator('.answer-choice').first().isDisabled());
    assert.equal(await count(),before);
    await page.locator('#play').click();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.ok(await page.locator('#stop').isDisabled());
    assert.equal(await count(),before);
    await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));
    console.log('PASS: stop, module/level changes, and background interruption cancel playback without scoring.');

    await mode('intervals');
    await listen();
    await page.locator('#play').click();
    await page.locator('.top-nav [data-page="progress"]').click();
    await page.locator('.top-nav [data-page="practice"]').click();
    assert.ok(await page.locator('.answer-choice').first().isEnabled(),'Returning from Progress after stopping a replay must restore answer controls.');
    assert.equal(await count(),before);
    await page.locator(`[data-answer="${(await question('intervals')).answer}"]`).click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');
    console.log('PASS: page-switch interruption restores the already-heard question and its answer controls.');

    // A completed set has a clear endpoint and can start again without deleting prior work.
    await mode('intervals');
    for (let i=0;i<10;i++) { await revealed(); await page.locator('#next').click(); }
    assert.equal(await page.locator('#set-summary').isVisible(),true);
    assert.match(await page.locator('#set-summary').innerText(),/10 revealed/);
    before = await count(); await page.locator('#another-set').click();
    assert.equal(await count(),before);
    assert.match(await page.locator('#question-counter').textContent(),/01 \/ 10/);
    console.log('PASS: ten-question completion and new-set behavior.');

    // Test trials form their own record and cannot inflate fixed-difficulty practice accuracy.
    await mode('pitch');
    const fixedAttempts = await count();
    const priorTests = (await record()).pitchTests?.length || 0;
    await page.locator('#start-pitch-test').click();
    assert.equal(await page.locator('#pitch-test-status').isVisible(),true);
    assert.equal(await page.locator('#reveal').isVisible(),false);
    await page.evaluate(()=>{window.__startedNotes=[];});
    await listen();
    assert.ok(await page.locator('#play').isDisabled(),'Adaptive trials permit one listen only.');
    const oneListenNotes = await page.evaluate(()=>window.__startedNotes.length);
    await page.locator('#main').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__startedNotes.length),oneListenNotes,'The Space shortcut cannot bypass the adaptive replay restriction.');
    pitchStarts = await page.evaluate(()=>window.__startedNotes);
    firstPitch = pitchStarts[0]; secondPitch = pitchStarts.find(n=>n.at>firstPitch.at+.01);
    await page.locator(`[data-answer="${secondPitch.frequency>firstPitch.frequency?'higher':'lower'}"]`).click();
    assert.equal(await count(),fixedAttempts);
    assert.equal((await record()).pitchTests?.length || 0,priorTests);
    await page.locator('#end-pitch-test').click();
    assert.equal((await record()).pitchTests?.length || 0,priorTests);
    assert.equal(await page.locator('#pitch-test-status').isVisible(),false);

    await page.locator('#start-pitch-test').click();
    for (let i=0;i<24;i++) {
      await page.evaluate(()=>{window.__startedNotes=[];});
      await listen();
      assert.ok(await page.locator('#play').isDisabled());
      assert.equal(await page.locator('#reveal').isVisible(),false);
      pitchStarts = await page.evaluate(()=>window.__startedNotes);
      firstPitch = pitchStarts[0]; secondPitch = pitchStarts.find(n=>n.at>firstPitch.at+.01);
      assert.equal(pitchStarts.length,2,'Adaptive test uses two pure sine tones, with no upper harmonics.');
      const heardCents = Math.abs(1200*Math.log2(secondPitch.frequency/firstPitch.frequency));
      const expectedCents = Math.max(2,100/1.5**Math.floor(i/2));
      assert.ok(Math.abs(heardCents-expectedCents)<.01,`Trial ${i+1}: the scheduled frequency gap follows the two-correct-down staircase.`);
      const answer = secondPitch.frequency>firstPitch.frequency?'higher':'lower';
      await page.locator(`[data-answer="${answer}"]`).click();
      assert.ok(await page.locator('#play').isDisabled(),'Grading does not unlock an adaptive replay.');
      assert.equal(await page.locator('#feedback.recorded').isVisible(),true);
      assert.equal(await page.locator('.answer-choice.correct,.answer-choice.incorrect,.feedback-answer').count(),0,'Adaptive trials reveal no answer or pitch gap before the result.');
      assert.equal(await page.locator('#session-accuracy').textContent(),'—');
      assert.equal(await count(),fixedAttempts);
      if (i<23) assert.equal((await record()).pitchTests?.length || 0,priorTests);
      if (await page.locator('#next').isVisible()) await page.locator('#next').click();
    }
    const pitchTests = (await record()).pitchTests;
    assert.equal(pitchTests.length,priorTests+1);
    const completedTest = pitchTests.at(-1);
    assert.equal(completedTest.protocol,'2d1u-v1');
    assert.equal(completedTest.trials.length,24);
    assert.ok(completedTest.trials.every(t=>t.correct));
    assert.equal(completedTest.trials[0].cents,100);
    assert.equal(completedTest.trials.at(-1).cents,2);
    assert.equal(await page.locator('#set-summary').isVisible(),true);
    assert.match(await page.locator('#set-summary').innerText(),/2\s*(?:cents|c)/i);
    console.log('PASS: a cancelled test saves nothing; 24 one-listen sine-tone trials save separately and report the floor bound.');

    const snapshot = await record();
    await page.reload();
    assert.deepEqual(await record(),snapshot);
    await page.locator('.top-nav [data-page="progress"]').click();
    assert.equal(await page.locator('.metric').count(),4);
    assert.equal(await page.locator('.day-bar').count(),28);
    await page.locator('#progress-mode').selectOption('melody');
    await page.locator('#progress-level').selectOption('level-8');
    assert.match(await page.locator('#progress-summary').innerText(),/100%/);
    await page.locator('#progress-mode').selectOption('all');
    await page.locator('#progress-level').selectOption('all');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export-progress').click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(),/^overtone-progress-.*\.json$/);
    const backup = await fs.readFile(await download.path());
    assert.deepEqual(JSON.parse(backup).attempts,snapshot.attempts);
    assert.deepEqual(JSON.parse(backup).pitchTests,snapshot.pitchTests);
    await page.locator('#import-progress').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
    assert.equal(await count(),snapshot.attempts.length);
    assert.deepEqual((await record()).pitchTests,snapshot.pitchTests);
    await page.locator('#import-progress').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"attempts":[{"mode":"bad"}]}')});
    assert.match(await page.locator('#toast').innerText(),/Import failed/);
    assert.equal(await count(),snapshot.attempts.length);
    const invalidTestBackup = JSON.parse(backup);
    invalidTestBackup.pitchTests[0].trials[0].cents = 17;
    await page.locator('#import-progress').setInputFiles({name:'invalid-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalidTestBackup))});
    assert.match(await page.locator('#toast').innerText(),/Import failed/);
    assert.deepEqual((await record()).pitchTests,snapshot.pitchTests);
    console.log('PASS: persistence, filtered progress, export, idempotent import, invalid-backup rejection.');

    const legacyData = {version:1,settings:{mode:'melody',level:'advanced',timbre:'warm',volume:.42},attempts:[
      {mode:'intervals',level:'beginner',outcome:'correct',timestamp:'2026-10-01T10:00:00.000Z'},
      {mode:'chords',level:'intermediate',outcome:'incorrect',timestamp:'2026-10-02T10:00:00.000Z'},
      {mode:'melody',level:'advanced',outcome:'revealed',timestamp:'2026-10-03T10:00:00.000Z'}
    ]};
    const legacyPage = await browser.newPage();
    const legacyErrors = [];
    legacyPage.on('pageerror',e=>legacyErrors.push(e.message));
    await legacyPage.addInitScript(({key,data})=>{
      if (!sessionStorage.getItem('overtone-qa-seeded')) {
        localStorage.setItem(key,JSON.stringify(data));
        sessionStorage.setItem('overtone-qa-seeded','yes');
      }
    },{key:STORE,data:legacyData});
    await legacyPage.goto(baseURL);
    await legacyPage.waitForFunction(()=>document.querySelectorAll('.mode-button').length===8);
    assert.equal(await legacyPage.locator('#level').inputValue(),'level-7');
    assert.equal(await legacyPage.locator('#volume').inputValue(),'42');
    assert.deepEqual(await legacyPage.evaluate(key=>JSON.parse(localStorage.getItem(key)).attempts,STORE),legacyData.attempts);
    await legacyPage.locator('.top-nav [data-page="progress"]').click();
    for (const level of ['beginner','intermediate','advanced']) {
      await legacyPage.locator('#progress-level').selectOption(level);
      assert.equal(await legacyPage.locator('#progress-level').inputValue(),level);
      assert.equal(await legacyPage.locator('.empty-state').count(),0);
    }
    const legacyImport = {...legacyData,attempts:[...legacyData.attempts,{mode:'rhythm',level:'beginner',outcome:'correct',timestamp:'2026-10-04T10:00:00.000Z'}]};
    await legacyPage.locator('#import-progress').setInputFiles({name:'old-overtone.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyImport))});
    assert.deepEqual(await legacyPage.evaluate(key=>JSON.parse(localStorage.getItem(key)).attempts,STORE),legacyImport.attempts);
    await legacyPage.locator('.top-nav [data-page="practice"]').click();
    await legacyPage.locator('#mode-nav [data-mode="pitch"]').click();
    const migrated = await legacyPage.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORE);
    assert.equal(migrated.settings.level,'level-7');
    assert.deepEqual(migrated.attempts,legacyImport.attempts);
    assert.deepEqual(legacyErrors,[]);
    await legacyPage.close();
    console.log('PASS: legacy settings migrate while old attempts, filters, imports, and saved difficulty history remain intact.');

    for (const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      await page.locator('.top-nav [data-page="practice"]').click();
      for (const id of MODES) {
        await mode(id,'level-8');
        const overflow = await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
        assert.ok(overflow.doc <= width && overflow.body <= width,`${width}px ${id}: ${JSON.stringify(overflow)}`);
      }
      for (const p of ['progress','guide']) {
        await page.locator(`.top-nav [data-page="${p}"]`).click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${p} overflow`);
      }
      assert.equal(await page.locator('#free-keyboard button').count(),13);
      await page.locator('#free-keyboard button').first().click();
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(external,[]);
    console.log('PASS: 390px/320px layouts, navigation, reference keyboard; no page errors or external requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
