const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.OVERTONE_QA_URL || 'http://127.0.0.1:8765/ear-training/';
const STORE = 'overtone.practice.v1';

(async () => {
  let proxy;
  const address = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (address && new URL(baseURL).hostname !== '127.0.0.1' && new URL(baseURL).hostname !== 'localhost') {
    const u = new URL(address);
    proxy = {server:`${u.protocol}//${u.hostname}:${u.port}`};
    if (u.username) proxy.username = decodeURIComponent(u.username);
    if (u.password) proxy.password = decodeURIComponent(u.password);
  }
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox'],proxy});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:1000},ignoreHTTPSErrors:Boolean(proxy)});
    const errors = [];
    page.on('pageerror',e => errors.push(e.message));
    await page.addInitScript(() => {
      window.__notes = []; window.__oscillators = []; window.__randoms = []; window.__randomIndex = 0;
      Math.random = () => window.__randoms[window.__randomIndex++] ?? .4;
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const context = this, oscillator = create.call(context);
        const node = {id:window.__oscillators.length,stops:[],ended:false};
        window.__oscillators.push(node);
        const start = oscillator.start.bind(oscillator), stop = oscillator.stop.bind(oscillator);
        oscillator.start = at => {window.__notes.push({id:node.id,at,frequency:oscillator.frequency.value});return start(at);};
        oscillator.stop = at => {node.stops.push({at,now:context.currentTime});return stop(at);};
        oscillator.addEventListener('ended',() => {node.ended = true;});
        return oscillator;
      };
    });
    const response = await page.goto(baseURL,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    await page.waitForFunction(() => document.querySelectorAll('.mode-button').length === 7);
    await page.locator('#mode-nav [data-mode="intervals"]').click();
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)),STORE);
    async function force(level,randoms) {
      await page.evaluate(values => {window.__randoms = values;window.__randomIndex = 0;},randoms);
      await page.locator('#level').selectOption(level);
    }
    async function play(selector) {
      await page.evaluate(() => {window.__notes = [];});
      await page.locator(selector).click();
      await page.waitForFunction(() => !document.querySelector('#play').disabled);
      return page.evaluate(() => window.__notes);
    }
    function fundamentals(notes,simultaneous=false) {
      if (simultaneous) return [...new Set(notes.map(n => n.frequency))].sort((a,b) => a-b).slice(0,2);
      return [...new Set(notes.map(n => n.at))].sort((a,b) => a-b)
        .map(at => Math.min(...notes.filter(n => n.at === at).map(n => n.frequency)));
    }
    const cases = [
      {name:'ascending',level:'level-3',randoms:[.01,.01,.4],voice:'warm',answer:'m3'},
      {name:'descending',level:'level-6',randoms:[.21,.8,.4],voice:'sine',answer:'m3',descending:true},
      {name:'simultaneous',level:'level-8',randoms:[.21,.1,.5],voice:'piano',answer:'m3',simultaneous:true},
      {name:'revealed non-third',level:'level-1',randoms:[.01,.01,.4],voice:'warm',answer:'P5',reveal:true}
    ];
    for (const c of cases) {
      await page.locator('#timbre').selectOption(c.voice);
      await force(c.level,c.randoms);
      assert.equal(await page.locator('#compare-minor-third').isVisible(),false);
      assert.equal(await page.locator('#compare-major-third').isVisible(),false);
      let originalFirst = 440*2**((60-69)/12);
      if (c.reveal) await page.locator('#reveal').click();
      else {
        const originalNotes = await play('#play');
        originalFirst = fundamentals(originalNotes,c.simultaneous)[0];
        // The upper-case and lower-case third values remain distinct in the DOM.
        assert.equal(await page.locator('[data-answer="m3"]').count(),1);
        assert.equal(await page.locator('[data-answer="M3"]').count(),1);
        assert.match(await page.locator('[data-answer="m3"] .label').textContent(),/Minor/);
        assert.match(await page.locator('[data-answer="M3"] .label').textContent(),/Major/);
        await page.locator(`[data-answer="${c.answer}"]`).click();
        assert.equal(await page.locator('.feedback.correct').isVisible(),true);
        if (c.name === 'ascending') {
          assert.match(await page.locator('#feedback').innerText(),/C4.*E♭4/s,'The minor third is spelled C–E-flat in the visible explanation.');
        }
      }
      assert.equal(await page.locator('#compare-minor-third').isVisible(),true);
      assert.equal(await page.locator('#compare-major-third').isVisible(),true);
      const before = await stored();
      const score = await page.locator('#session-score').textContent();
      const accuracy = await page.locator('#session-accuracy').textContent();
      const replayCount = await page.locator('#replay-count').textContent();
      const heard = [];
      for (const [quality,steps] of [['minor',3],['major',4]]) {
        const notes = await play(`#compare-${quality}-third`);
        const pitches = fundamentals(notes,c.simultaneous);
        assert.equal(pitches.length,2,`${c.name} ${quality} comparison contains two pitches.`);
        assert.ok(Math.abs(pitches[0]-originalFirst)<.001,`${c.name} comparisons keep the original starting pitch.`);
        const measured = 12*Math.log2(pitches[1]/pitches[0]);
        assert.ok(Math.abs(measured-(c.descending ? -steps : steps))<.00001,`${c.name} ${quality}: ${measured} semitones`);
        if (c.simultaneous) assert.equal(new Set(notes.map(n => n.at)).size,1);
        else assert.equal(new Set(notes.map(n => n.at)).size,2);
        heard.push({quality,firstHz:pitches[0],secondHz:pitches[1],semitones:measured});
      }
      assert.deepEqual(await stored(),before,'Comparing references never adds or changes a scored attempt.');
      assert.equal(await page.locator('#session-score').textContent(),score);
      assert.equal(await page.locator('#session-accuracy').textContent(),accuracy);
      assert.equal(await page.locator('#replay-count').textContent(),replayCount,'Reference comparisons are not counted as question replays.');
      console.log(`PASS: ${c.name} comparisons share the original starting pitch, play true 3/4-semitone thirds, and preserve score/replays. ${JSON.stringify(heard)}`);
    }

    await force('level-3',[.01,.01,.4]);
    await play('#play');
    await page.locator('[data-answer="m3"]').click();
    await page.evaluate(() => {window.__notes = [];window.__randoms = [.25,.01,.4];window.__randomIndex = 0;});
    await page.locator('#compare-minor-third').click();
    const ids = await page.evaluate(() => window.__notes.map(n => n.id));
    assert.ok(ids.length>0);
    await page.locator('#next').click();
    assert.equal(await page.locator('#compare-minor-third').isVisible(),false);
    assert.equal(await page.locator('#compare-major-third').isVisible(),false);
    const stopped = await page.evaluate(ids => ids.map(id => window.__oscillators[id]),ids);
    assert.ok(stopped.every(n => {const last = n.stops.at(-1);return last.at-last.now <= .026;}),'Next cancels an in-progress comparison.');
    assert.equal(await page.locator('.answer-choice').first().isDisabled(),true);
    const nextPitches = fundamentals(await play('#play'));
    assert.ok(Math.abs(12*Math.log2(nextPitches[1]/nextPitches[0])-4)<.00001);
    await page.locator('[data-answer="M3"]').click();
    assert.equal(await page.locator('.feedback.correct').isVisible(),true);
    console.log('PASS: Next cancels comparison audio and the next question plays/grades its own pitches.');

    for (const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.locator('#feedback').isVisible(),true);
      for (const quality of ['minor','major']) {
        const button = page.locator(`#compare-${quality}-third`);
        assert.equal(await button.isVisible(),true);
        assert.ok((await button.boundingBox()).height >= 44,`${width}px ${quality} comparison retains a usable touch target.`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`${width}px interval feedback does not overflow the page.`);
      assert.ok(await page.locator('#feedback').evaluate(n => n.scrollWidth <= n.clientWidth),`${width}px comparison text and buttons wrap inside feedback.`);
    }
    console.log('PASS: feedback and comparison controls wrap at 390px/320px with 44px touch targets and no horizontal overflow.');

    await page.locator('#mode-nav [data-mode="chords"]').click();
    assert.equal(await page.locator('#compare-minor-third').isVisible(),false);
    await page.locator('#reveal').click();
    assert.equal(await page.locator('#compare-major-third').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: third comparisons stay hidden in other exercises; no page errors.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
