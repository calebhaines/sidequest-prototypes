'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.KITCHEN_PLAYWRIGHT || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
async function setRange(page, selector, value) { await page.locator(selector).evaluate((element, next) => { element.value = next; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, String(value)); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    for (const app of ['bower', 'mire']) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 950 } }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const directory = path.join(root, app), html = fs.readFileSync(path.join(directory, 'app.html'), 'utf8').replace('<!-- STYLES -->', '<style>' + fs.readFileSync(path.join(directory, 'styles.css'), 'utf8') + '</style>');
      await page.setContent(html);
      for (const file of ['schema.js', 'presets.js', 'audio-engine.js', 'app.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(directory, file), 'utf8') });
      if (app === 'bower') {
        const native = await page.evaluate(() => BowerApp.getState().lanes);
        await page.selectOption('#sequenceMode', 'pattern');
        assert.equal(await page.locator('.euclidean-row').isVisible(), false);
        await page.selectOption('#patternBank', '3');
        await page.selectOption('#patternLength', '32');
        await page.selectOption('#stepPage', '1');
        await page.locator('.lane-card[data-lane="0"] .step[data-step="31"]').click();
        await setRange(page, '#stepDegree', 79);
        let saved = await page.evaluate(() => BowerApp.getState());
        assert.deepEqual(saved.lanes, native);
        assert.equal(saved.pattern.banks[3].lanes[0].steps[31].on, true);
        assert.equal(saved.pattern.banks[3].lanes[0].steps[31].note, 79);
        assert.equal(await page.locator('#stepNote').textContent(), 'G5');
        await page.selectOption('#patternLength', '16');
        await page.selectOption('#patternLength', '32');
        await page.selectOption('#patternBank', '1');
        assert.equal(await page.evaluate(() => BowerApp.getState().pattern.banks[1].lanes[0].steps[31].on), false);
        await page.selectOption('#patternBank', '3');
        assert.equal(await page.evaluate(() => BowerApp.getState().pattern.banks[3].lanes[0].steps[31].note), 79);
        await page.selectOption('#sequenceMode', 'strings');
        assert.equal(await page.locator('.euclidean-row').getAttribute('hidden'), null);
        await page.click('#tabSequence');
        await setRange(page, '#lane-length', 32);
        await page.selectOption('#stepPage', '1');
        await page.locator('.lane-card[data-lane="0"] .step[data-step="31"]').click();
        assert.equal(await page.evaluate(() => BowerApp.getState().lanes[0].steps[31].on), true);
        assert.equal(await page.evaluate(() => BowerSchema.parseProject(BowerSchema.serialize(BowerApp.getState())).pattern.banks[3].lanes[0].steps[31].note), 79);
        await page.selectOption('#sequenceMode', 'pattern');
        await page.click('#playButton');
        await page.waitForFunction(() => BowerApp.engine.isPlaying);
        await page.evaluate(() => BowerApp.engine.stop());
      } else {
        await page.selectOption('#pattern-length', '32');
        await page.selectOption('#step-page', '1');
        const last = page.locator('.step[data-source="0"][data-step="31"]');
        await last.click();
        await last.click({ button: 'right' });
        await setRange(page, 'input[aria-label="Step ratchets"]', 1);
        await page.click('#source-title');
        assert.equal(await page.evaluate(() => MireApp.getState().sources[0].steps[31].ratchet), 4);
        assert.equal(await page.locator('#step-numbers span').last().textContent(), '32');
        await page.selectOption('#pattern-length', '16');
        assert.equal(await page.locator('.step[data-step="31"]').count(), 0);
        await page.selectOption('#pattern-length', '32');
        await page.selectOption('#step-page', '1');
        assert.equal(await page.evaluate(() => MireApp.getState().sources[0].steps[31].on), true);
        assert.equal(await page.evaluate(() => MireSchema.parseProject(MireSchema.serializeProject(MireApp.getState())).sources[0].steps[31].ratchet), 4);
        await page.click('#play-button');
        await page.waitForFunction(() => MireApp.engine.isPlaying);
        await page.evaluate(() => MireApp.engine.stop());
      }
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator(app === 'bower' ? '#stepPage' : '#step-page').isVisible(), true);
      assert.equal(await page.locator('.steps').first().locator('.step').count(), 16);
      assert.deepEqual(errors, []);
      console.log('PASS ' + app.toUpperCase() + ': mode/bank/length/page editing, retained notes, project roundtrip, playback, and compact mobile grid.');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
