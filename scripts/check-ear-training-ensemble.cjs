const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const baseURL = process.env.OVERTONE_QA_URL || 'http://127.0.0.1:8765/ear-training/';
const STORE = 'overtone.practice.v1';

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}});
    const errors = [], external = [];
    page.on('pageerror',e => errors.push(e.message));
    page.on('request',r => {if (!r.url().startsWith(new URL(baseURL).origin)) external.push(r.url());});
    await page.addInitScript(() => {
      Math.random = () => .25;
      window.__notes = []; window.__oscillators = [];
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const context = this, oscillator = create.call(context);
        const node = {id:window.__oscillators.length,stops:[]};
        window.__oscillators.push(node);
        const start = oscillator.start.bind(oscillator), stop = oscillator.stop.bind(oscillator);
        oscillator.start = at => {window.__notes.push({id:node.id,at,now:context.currentTime,frequency:oscillator.frequency.value});return start(at);};
        oscillator.stop = at => {node.stops.push({at,now:context.currentTime});return stop(at);};
        return oscillator;
      };
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => document.querySelectorAll('.mode-button').length === 8);
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)),STORE);
    const count = async () => (await stored()).attempts.length;
    const root = i => page.locator(`[data-ensemble-root="${i}"]`);
    const quality = i => page.locator(`[data-ensemble-quality="${i}"]`);
    const slot = i => page.locator(`[data-ensemble-slot="${i}"]`);
    const pitch = midi => page.locator(`[data-ensemble-midi="${midi}"]`);
    let lastPlayElapsed = 0;
    async function question(level='level-1') {
      return page.evaluate(async level => {
        const {generateQuestion} = await import('./music.js');
        return generateQuestion('ensemble',level,()=>.25);
      },level);
    }
    async function newQuestion(level='level-1') {
      await page.locator('#mode-nav [data-mode="ensemble"]').click();
      await page.locator('#level').selectOption(level);
      await page.locator('#timbre').selectOption('sine');
      return question(level);
    }
    async function play(selector='#play') {
      await page.evaluate(() => {window.__notes = [];});
      const started = Date.now();
      await page.locator(selector).click();
      await page.waitForFunction(() => !document.querySelector('#play').disabled,null,{timeout:25000});
      lastPlayElapsed = Date.now()-started;
      return page.evaluate(() => window.__notes);
    }
    async function chord(i,value) {
      const [r,q] = value.split(':');
      await root(i).selectOption(r); await quality(i).selectOption(q);
    }
    async function note(i,midi) {await slot(i).click();await pitch(midi).click();}
    async function fill(q,response=q.answer) {
      for (let i=0;i<4;i++) await chord(i,response.chords[i]);
      for (let i=0;i<q.inputLength;i++) await note(i,response.melody[i]);
    }
    function expectedNotes(events) {
      return events.flatMap(e => e.notes.flatMap(midi => {
        const harmonics = e.voice === 'warm' || e.voice === 'piano' ? [1,2,3] : e.voice === 'click' ? [1,2.1] : [1];
        return harmonics.map(h => ({at:e.at,frequency:Math.fround(440*2**((midi-69)/12)*h)}));
      })).sort((a,b) => a.at-b.at || a.frequency-b.frequency);
    }
    function originalEvents(q) {
      if (!q.reference?.length) return q.events;
      const offset = Math.max(...q.reference.map(e=>e.at+e.duration))+.45;
      return [...q.reference,...q.events.map(e=>({...e,at:e.at+offset}))];
    }
    function assertAudio(actual,events,label) {
      const expected = expectedNotes(events);
      assert.equal(actual.length,expected.length,`${label}: oscillator count includes each track's voice partials.`);
      const sorted = actual.slice().sort((a,b) => a.at-b.at || a.frequency-b.frequency);
      assert.ok(sorted.length>0,`${label}: scheduled real audio.`);
      const base = sorted[0].at-expected[0].at;
      for (let i=0;i<expected.length;i++) {
        assert.ok(Math.abs(sorted[i].at-base-expected[i].at)<.00001,`${label}: event ${i} stays in its original time slot.`);
        assert.ok(Math.abs(sorted[i].frequency-expected[i].frequency)<.001,`${label}: event ${i} frequency is correct.`);
      }
      // The oscillator is scheduled from the current clock plus its original offset;
      // normalizing only by the first note would miss compressed leading empty slots.
      assert.ok(Math.abs(sorted[0].at-sorted[0].now-(expected[0].at+.06))<.04,`${label}: leading empty slots are preserved.`);
    }
    async function responseEvents(q,response,part='both') {
      return page.evaluate(async ({q,response,part}) => {
        const {ensembleResponseEvents} = await import('./ensemble.js');
        return ensembleResponseEvents(q,response,{part});
      },{q,response,part});
    }
    async function expectParts(chords,melody,total) {
      const text = await page.locator('#ensemble-feedback').innerText();
      assert.match(text,new RegExp(`chords?\\D*${chords}\\s*(?:/|of)\\s*4`,'i'));
      assert.match(text,new RegExp(`(?:melody|notes)\\D*${melody}\\s*(?:/|of)\\s*${total}`,'i'));
    }

    let q = await newQuestion();
    assert.equal(await page.locator('#ensemble-editor .ensemble-bar').count(),4);
    assert.deepEqual(await page.locator('[data-ensemble-midi]').evaluateAll(ns => ns.map(n=>Number(n.dataset.ensembleMidi))),Array.from({length:12},(_,i)=>72+i));
    for (let i=0;i<4;i++) {
      assert.deepEqual(await root(i).locator('option').evaluateAll(ns=>ns.map(n=>n.value).filter(Boolean)),Array.from({length:12},(_,n)=>String(n)));
      const qualities = await quality(i).locator('option').evaluateAll(ns=>ns.map(n=>n.value));
      assert.ok(qualities.includes('major') && qualities.includes('minor'));
      assert.equal(await root(i).isDisabled(),true);
    }
    assert.equal(await page.locator('#ensemble-check').isDisabled(),true);
    assert.equal(await page.locator('#ensemble-original-chords').isVisible(),false);
    assert.equal(await page.locator('#ensemble-original-melody').isVisible(),false);
    assert.equal(await page.locator('.ensemble-solution').count(),0);
    const original = await play();
    assertAudio(original,originalEvents(q),'original simultaneous phrase');
    assert.ok(q.chordEvents.some(c=>q.melodyEvents.some(m=>Math.abs(c.at-m.at)<.000001)),'The generated question genuinely starts the tracks together.');
    assert.equal(await page.locator('#ensemble-original-chords').isVisible(),false);
    assert.equal(await page.locator('#ensemble-original-melody').isVisible(),false);
    assert.equal(await page.locator('.ensemble-solution,.ensemble-bar.correct,.ensemble-bar.incorrect').count(),0);
    console.log('PASS: four chord editors, all twelve chromatic keys, required-input gate, hidden answers, and real simultaneous track audio.');

    const noAttempts = await count();
    await pitch(72).click(); await pitch(73).click();
    assert.equal(await page.locator('[data-ensemble-slot].is-filled').count(),2);
    await page.locator('#ensemble-undo-note').click();
    assert.equal(await page.locator('[data-ensemble-slot].is-filled').count(),1);
    assert.equal(await slot(0).getAttribute('data-note'),'72');
    assert.equal(await slot(1).getAttribute('data-note'),null);
    await note(1,74); await note(0,75);
    assert.equal(await slot(0).getAttribute('data-note'),'75');
    assert.equal(await slot(1).getAttribute('data-note'),'74');
    const edited = {chords:Array(4).fill(null),melody:Array(q.inputLength).fill(null)};
    edited.melody[0]=75;edited.melody[1]=74;
    assertAudio(await play('#ensemble-play-melody'),await responseEvents(q,edited,'melody'),'edited melody preview');
    await page.locator('#ensemble-clear-notes').click();
    assert.equal(await page.locator('[data-ensemble-slot].is-filled').count(),0);
    await chord(0,q.answer.chords[0]); await page.locator('#ensemble-clear-chords').click();
    for (let i=0;i<4;i++) {assert.equal(await root(i).inputValue(),'');assert.equal(await quality(i).inputValue(),'');}
    const shortcuts = 'awsedftgyhuj';
    for (let i=0;i<12;i++) {
      await slot(0).click();await page.locator('#main').focus();await page.keyboard.press(shortcuts[i]);
      assert.equal(await slot(0).getAttribute('data-note'),String(72+i),`Shortcut ${shortcuts[i]} reaches the full chromatic octave.`);
    }
    await page.locator('#ensemble-clear-notes').click();

    const secondBarIndex = q.notesPerChord;
    await note(secondBarIndex,83); await chord(1,q.answer.chords[1]);
    const partial = {chords:Array(4).fill(null),melody:Array(q.inputLength).fill(null)};
    partial.chords[1]=q.answer.chords[1];partial.melody[secondBarIndex]=83;
    assert.ok(q.melodyTimes[secondBarIndex]>0);
    for (const part of ['melody','chords','both']) {
      const selector = part==='both' ? '#ensemble-play-mix' : `#ensemble-play-${part}`;
      assertAudio(await play(selector),await responseEvents(q,partial,part),`partial ${part} preview`);
      assert.ok(lastPlayElapsed>=q.totalDuration*1000-30,`Partial ${part} preview keeps the full grid, including trailing empty bars.`);
    }
    assert.equal(await count(),noAttempts);
    assert.equal(await page.locator('#ensemble-check').isDisabled(),true);
    await page.locator('#ensemble-clear-notes').click();await page.locator('#ensemble-clear-chords').click();
    console.log('PASS: note editing/undo, independent clearing, and partial previews retain leading blank note/chord positions without scoring.');

    for (let i=0;i<q.inputLength;i++) await note(i,q.answer.melody[i]);
    assert.equal(await page.locator('#ensemble-check').isDisabled(),true,'A complete melody alone cannot submit.');
    for (let i=0;i<3;i++) await chord(i,q.answer.chords[i]);
    assert.equal(await page.locator('#ensemble-check').isDisabled(),true,'Three chords are insufficient.');
    await chord(3,q.answer.chords[3]);
    assert.equal(await page.locator('#ensemble-check').isEnabled(),true);
    const editorBefore = await page.locator('#ensemble-editor').innerText();
    const rootsBefore = await page.locator('[data-ensemble-root]').evaluateAll(ns=>ns.map(n=>n.value));
    const qualitiesBefore = await page.locator('[data-ensemble-quality]').evaluateAll(ns=>ns.map(n=>n.value));
    assertAudio(await play(),originalEvents(q),'replayed original');
    assert.equal(await page.locator('#ensemble-editor').innerText(),editorBefore);
    assert.deepEqual(await page.locator('[data-ensemble-root]').evaluateAll(ns=>ns.map(n=>n.value)),rootsBefore);
    assert.deepEqual(await page.locator('[data-ensemble-quality]').evaluateAll(ns=>ns.map(n=>n.value)),qualitiesBefore);
    assertAudio(await play('#ensemble-play-mix'),q.events,'complete reconstructed mix');
    const beforeCorrect = await count();
    await page.locator('#main').focus();await page.keyboard.press('Enter');
    assert.equal((await stored()).attempts.at(-1).outcome,'correct');
    assert.deepEqual((await stored()).attempts.at(-1).parts,{chordsCorrect:4,chordTotal:4,melodyCorrect:q.inputLength,melodyTotal:q.inputLength});
    assert.equal(await count(),beforeCorrect+1);
    await expectParts(4,q.inputLength,q.inputLength);
    assert.equal(await page.locator('#session-score').textContent(),'1 / 1');
    assert.equal(await page.locator('#session-accuracy').textContent(),'100%');
    await page.keyboard.press('1');
    await page.evaluate(()=>document.querySelector('#ensemble-check').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.equal(await count(),beforeCorrect+1);
    const graded = await stored();
    assertAudio(await play('#ensemble-original-chords'),q.chordEvents,'revealed original chord track');
    assertAudio(await play('#ensemble-original-melody'),q.melodyEvents,'revealed original melody track');
    assert.deepEqual(await stored(),graded);
    console.log('PASS: exact combined answer scores once; replay preserves entries; track comparisons unlock only after grading and keep stats unchanged.');

    for (const wrongPart of ['chords','melody']) {
      q = await newQuestion();await play();
      const response = {chords:[...q.answer.chords],melody:[...q.answer.melody]};
      if (wrongPart==='chords') {
        const [r,quality] = response.chords[0].split(':');
        response.chords[0]=`${r}:${quality==='major'?'minor':'major'}`;
      } else response.melody[0]=72+(response.melody[0]-72+1)%12;
      await fill(q,response);
      const before = await count();await page.locator('#ensemble-check').click();
      assert.equal((await stored()).attempts.at(-1).outcome,'incorrect');
      assert.deepEqual((await stored()).attempts.at(-1).parts,{chordsCorrect:wrongPart==='chords'?3:4,chordTotal:4,melodyCorrect:wrongPart==='melody'?q.inputLength-1:q.inputLength,melodyTotal:q.inputLength});
      assert.equal(await count(),before+1);
      await expectParts(wrongPart==='chords'?3:4,wrongPart==='melody'?q.inputLength-1:q.inputLength,q.inputLength);
      assert.equal(await page.locator('#session-accuracy').textContent(),'0%');
    }
    console.log('PASS: one wrong chord or one wrong melody note each fails the exact combined answer and reports separate part counts.');

    q = await newQuestion();await play();await chord(0,q.answer.chords[0]);await note(0,q.answer.melody[0]);
    const beforeInterrupt = await count();
    await page.evaluate(()=>{window.__notes=[];});await page.locator('#play').click();
    const ids = await page.evaluate(()=>window.__notes.map(n=>n.id));
    await page.locator('#mode-nav [data-mode="intervals"]').click();
    const stopped = await page.evaluate(ids=>ids.map(id=>window.__oscillators[id]),ids);
    assert.ok(stopped.every(n=>{const last=n.stops.at(-1);return last.at-last.now<=.026;}));
    assert.equal(await count(),beforeInterrupt);
    q = await newQuestion();await page.locator('#play').click();await page.locator('#level').selectOption('level-8');
    assert.equal(await page.locator('#ensemble-check').isDisabled(),true);
    assert.equal(await page.locator('[data-ensemble-slot].is-filled').count(),0);
    assert.equal(await count(),beforeInterrupt);
    console.log('PASS: switching mode or level cancels the mixed phrase, clears the new question, and never records an unfinished answer.');

    q = await question('level-8');
    await page.locator('#reveal').click();
    assert.equal(await page.locator('[data-ensemble-slot]').count(),q.inputLength);
    for (const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.locator('[data-ensemble-midi]').count(),12);
      assert.equal(await page.locator('.ensemble-bar').count(),4);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ensemble has no page overflow.`);
      assert.ok(await page.locator('#ensemble-editor').evaluate(n=>n.scrollWidth<=n.clientWidth));
      assert.ok(await page.locator('#feedback').evaluate(n=>n.scrollWidth<=n.clientWidth));
      assert.ok(await page.locator('[data-ensemble-midi]').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=44)));
      assert.ok(await root(0).evaluate(n=>n.getBoundingClientRect().height>=44));
    }
    const beforeReload = await stored();
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('.mode-button').length===8);
    assert.deepEqual(await stored(),beforeReload,'Saved per-part metrics survive reload unchanged.');
    await page.locator('.top-nav [data-page="progress"]').click();
    await page.locator('#progress-mode').selectOption('ensemble');
    assert.equal(await page.locator('.empty-state').count(),0);
    const downloadEvent = page.waitForEvent('download');await page.locator('#export-progress').click();
    const download = await downloadEvent;
    const backup = await fs.readFile(await download.path());
    assert.deepEqual(JSON.parse(backup).attempts,beforeReload.attempts);
    await page.locator('#import-progress').setInputFiles({name:'ensemble.json',mimeType:'application/json',buffer:backup});
    assert.deepEqual((await stored()).attempts,beforeReload.attempts);
    const invalid = JSON.parse(backup);invalid.attempts.find(a=>a.parts).parts.chordsCorrect=5;
    await page.locator('#import-progress').setInputFiles({name:'invalid-parts.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    assert.match(await page.locator('#toast').innerText(),/Import failed/);
    assert.deepEqual((await stored()).attempts,beforeReload.attempts);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: sixteen-slot mobile feedback, twelve keys/four bars, saved per-part metrics, export/import validation; no runtime errors/external requests.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
