import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const report = JSON.parse(await readFile(new URL('./campaign-validation.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await page.routeWebSocket('**', socket => socket.close());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('lady-supine-adventure-v1')));
let finalDecision;
let resumeChecked = false;

async function fillInvestigationBoard(board) {
  if (board.kind === 'ledger') {
    for (const row of board.rows) for (const column of board.columns) await page.getByLabel(`${row.title} — ${column.title}`, { exact: true }).selectOption(board.solution[`${row.id}.${column.id}`]);
  } else if (board.kind === 'cipher' || board.kind === 'balance') {
    for (const field of board.fields) await page.getByLabel(field.label, { exact: true }).fill(board.solution[field.id]);
  } else if (board.kind === 'sequence') {
    for (let target = 0; target < board.solution.length; target++) {
      const card = board.cards.find(entry => entry.id === board.solution[target]);
      let current = (await page.locator('.inv-sequence strong').allTextContents()).indexOf(card.title);
      while (current > target) { await page.getByRole('button', { name: `Move ${card.title} earlier`, exact: true }).click(); current--; }
    }
  } else if (board.kind === 'route') {
    for (const cell of board.solution.slice(1)) await page.locator('.inv-route-cell').nth(cell).click();
  } else if (board.kind === 'circuit') {
    for (const cell of board.solution) await page.locator('.inv-circuit-grid button').nth(cell).click();
  }
}

async function finishOpenInvestigation(step, expected = false) {
  if (expected) await page.locator('.inv-modal').waitFor();
  while (await page.locator('.inv-modal').isVisible()) {
    const title = await page.locator('.inv-header h2').textContent();
    const investigation = await page.evaluate(async name => {
      const { INVESTIGATIONS } = await import('/src/data/investigations.ts');
      return INVESTIGATIONS.find(entry => entry.title === name);
    }, title);
    assert.ok(investigation, 'Opened case must match authored content');
    if (await page.getByRole('button', { name: 'Open the casebook', exact: true }).isVisible()) await page.getByRole('button', { name: 'Open the casebook', exact: true }).click();
    for (const [index, challenge] of investigation.challenges.entries()) {
      await fillInvestigationBoard(challenge.board);
      if (!resumeChecked && index === 0) {
        const before = (await state()).investigations[investigation.id];
        assert.ok(Object.keys(before.challenges[challenge.id].answers).length > 0);
        await page.keyboard.press('Escape');
        await page.reload();
        await page.locator('h1').waitFor();
        assert.deepEqual((await state()).investigations[investigation.id], before, 'Reload must retain the partially completed case board');
        await page.locator('.choice-button').filter({ hasText: step.label }).first().click();
        await page.locator('.inv-modal').waitFor();
        const firstRow = challenge.board.rows[0]; const firstColumn = challenge.board.columns[0];
        assert.equal(await page.getByLabel(`${firstRow.title} — ${firstColumn.title}`, { exact: true }).inputValue(), challenge.board.solution[`${firstRow.id}.${firstColumn.id}`]);
        await page.getByRole('tab', { name: /Evidence/ }).click();
        await page.screenshot({ path: 'artifacts/investigation.png', fullPage: true });
        resumeChecked = true;
      }
      await page.getByRole('button', { name: 'Check the deduction', exact: true }).click();
      assert.ok((await state()).investigations[investigation.id].challenges[challenge.id].solved, `Solved ${challenge.id} must save to the real game`);
      await page.getByRole('button', { name: index === 5 ? 'Read what this changes' : 'Follow the thread', exact: true }).click();
    }
    await page.locator('.inv-conclusion').getByRole('button', { name: 'Return to the story', exact: true }).click();
    assert.ok((await state()).flags.includes(`case_${investigation.id}_done`), 'Every case must commit its story gate');
    assert.ok((await state()).investigations[investigation.id].finished);
  }
}

try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  await page.locator('h1').waitFor();
  for (const [index, step] of report.endings.commons.route.entries()) {
    assert.equal((await state()).scene, step.from, `Route step ${index + 1}: ${step.label || step.travel}`);
    if (step.investigation) continue;
    if (step.from === 'infinite_question') finalDecision = await state();
    if (step.travel) {
      await page.getByRole('button', { name: 'The land', exact: true }).click();
      const title = await page.evaluate(async id => {
        const { LOCATIONS } = await import('/src/data/campaign.ts');
        return `Travel to ${LOCATIONS.find(l => l.id === id).name}`;
      }, step.travel);
      await page.getByTitle(title, { exact: true }).click();
      await finishOpenInvestigation(step, Boolean(report.endings.commons.route[index - 1]?.investigation));
    } else {
      const alreadySolved = step.puzzle && (await state()).solved.includes(step.puzzle);
      await page.locator('.choice-button').filter({ hasText: step.label }).first().click();
      await finishOpenInvestigation(step, Boolean(report.endings.commons.route[index - 1]?.investigation));
      if (step.puzzle && !alreadySolved) {
        await page.getByRole('button', { name: /A gentle hint/ }).click();
        await page.getByRole('button', { name: /A little more help/ }).click();
        await page.getByRole('button', { name: /A little more help/ }).click();
        await page.getByRole('button', { name: /Solve with a little help/ }).click();
        await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
      }
    }
    assert.equal((await state()).scene, step.next, `Route destination at step ${index + 1}`);
  }
  assert.equal((await state()).ending, 'commons');
  assert.equal((await state()).solved.length, 16);
  assert.equal(Object.values((await state()).investigations).filter(entry => entry.finished).length, 6);
  assert.equal(Object.values((await state()).investigations).reduce((total, entry) => total + Object.values(entry.challenges).filter(challenge => challenge.solved).length, 0), 36);
  await page.getByRole('heading', { name: 'An ending with room in it.' }).waitFor();
  await page.getByRole('button', { name: 'Keep the story', exact: true }).click();
  await page.getByRole('button', { name: /Words worth keeping/ }).click();
  await page.locator('.conversation-history').getByText('The next afternoon', { exact: true }).waitFor();
  await page.keyboard.press('Escape');

  for (const ending of ['infinite', 'stay']) {
    await page.evaluate(save => localStorage.setItem('lady-supine-adventure-v1', JSON.stringify(save)), finalDecision);
    await page.reload();
    await page.locator('h1').waitFor();
    const last = report.endings[ending].route.at(-1);
    await page.locator('.choice-button').filter({ hasText: last.label }).click();
    assert.equal((await state()).ending, ending);
    await page.getByRole('heading', { name: ending === 'stay' ? 'A future you can touch.' : 'The unmeasured country.' }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${report.endings.commons.route.length}-step browser playthrough, 52 puzzle transitions, six mandatory cases, reload with a partially filled board, preserved final dialogue, and all three endings.`);
} finally { await browser.close(); }
