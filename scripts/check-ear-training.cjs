const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const baseURL = process.env.OVERTONE_QA_URL || 'http://127.0.0.1:8765/ear-training/';
const STORE = 'overtone.practice.v1';

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
    await page.waitForFunction(() => document.querySelectorAll('.mode-button').length === 6);
    const record = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"attempts":[]}'), STORE);
    const count = async () => (await record()).attempts.length;
    async function mode(id, level='beginner') {
      await page.locator(`#mode-nav [data-mode="${id}"]`).click();
      await page.locator('#level').selectOption(level);
    }
    async function question(id, level='beginner') {
      return page.evaluate(async ({id,level}) => {
        const {generateQuestion} = await import('./music.js');
        return generateQuestion(id,level,()=>.25);
      }, {id,level});
    }
    async function listen() {
      await page.locator('#play').click();
      await page.waitForFunction(() => !document.querySelector('#play').disabled && /READY FOR YOUR ANSWER/.test(document.querySelector('#audio-status').textContent), {timeout:15000});
    }
    async function revealed() {
      await page.locator('#reveal').click();
      assert.match(await page.locator('#feedback').getAttribute('class'), /revealed/);
    }
    assert.equal(await page.locator('.mode-button').count(),6);
    assert.ok(await page.locator('.answer-choice').first().isDisabled());

    // Every difficulty/mode must render, reveal the generated answer, and keep skips outside accuracy.
    for (const id of ['intervals','chords','progressions','melody','scales','rhythm']) {
      for (const level of ['beginner','intermediate','advanced']) {
        await mode(id,level);
        const q = await question(id,level);
        if (id === 'melody') assert.equal(await page.locator('.note-slot').count(),q.inputLength);
        else if (id === 'rhythm') assert.equal(await page.locator('[data-step]').count(),q.rhythmSteps);
        else assert.equal(await page.locator('.answer-choice').count(),q.choices.length);
        await revealed();
        assert.equal(await page.locator('.feedback-answer').textContent(),q.answerLabel);
        assert.equal(await page.locator('#session-accuracy').textContent(),'—');
      }
    }
    assert.equal(await count(),18);
    assert.ok((await record()).attempts.every(a => a.outcome === 'revealed'));
    console.log('PASS: six exercises × three levels render; reveal is an unscored skip.');

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

    await mode('melody','advanced');
    const melody = await question('melody','advanced');
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

    await mode('rhythm','advanced');
    const rhythm = await question('rhythm','advanced');
    await page.evaluate(()=>{window.__startedNotes=[];});
    await listen();
    const rhythmStarts = await page.evaluate(()=>window.__startedNotes);
    const firstCount = rhythmStarts.find(n=>Math.abs(n.frequency-440*2**((88-69)/12))<.01);
    const firstHit = rhythmStarts.find(n=>Math.abs(n.frequency-440*2**((76-69)/12))<.01);
    assert.ok(firstCount && firstHit,'The count-in and pattern each schedule a real oscillator.');
    assert.ok(Math.abs(firstHit.at-firstCount.at-rhythm.stepDuration*rhythm.rhythmSteps)<.000001,'The bar begins on beat five, with no arbitrary pause after the count-in.');
    for (let i=0;i<rhythm.answer.length;i++) if (rhythm.answer[i]) await page.locator(`[data-step="${i}"]`).click();
    await page.locator('[data-action="check"]').click();
    assert.equal((await record()).attempts.at(-1).outcome,'correct');
    assert.equal(await page.locator('.rhythm-solution .hit').count(),rhythm.answer.filter(Boolean).length);
    console.log('PASS: exact sixteen-cell rhythm reconstruction and revealed solution.');

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
    await page.locator('#level').selectOption('advanced');
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

    const snapshot = await record();
    await page.reload();
    assert.deepEqual(await record(),snapshot);
    await page.locator('.top-nav [data-page="progress"]').click();
    assert.equal(await page.locator('.metric').count(),4);
    assert.equal(await page.locator('.day-bar').count(),28);
    await page.locator('#progress-mode').selectOption('melody');
    await page.locator('#progress-level').selectOption('advanced');
    assert.match(await page.locator('#progress-summary').innerText(),/100%/);
    await page.locator('#progress-mode').selectOption('all');
    await page.locator('#progress-level').selectOption('all');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export-progress').click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(),/^overtone-progress-.*\.json$/);
    const backup = await fs.readFile(await download.path());
    assert.deepEqual(JSON.parse(backup).attempts,snapshot.attempts);
    await page.locator('#import-progress').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
    assert.equal(await count(),snapshot.attempts.length);
    await page.locator('#import-progress').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"attempts":[{"mode":"bad"}]}')});
    assert.match(await page.locator('#toast').innerText(),/Import failed/);
    assert.equal(await count(),snapshot.attempts.length);
    console.log('PASS: persistence, filtered progress, export, idempotent import, invalid-backup rejection.');

    for (const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      await page.locator('.top-nav [data-page="practice"]').click();
      for (const id of ['intervals','chords','progressions','melody','scales','rhythm']) {
        await mode(id,'advanced');
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
