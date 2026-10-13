import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const key = 'lady-supine-open-world-v2';
const story = () => page.evaluate(() => window.__ladySupine.getStory());
async function begin() {
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  const button = page.getByRole('button', { name: /^(Begin journey|Continue journey)$/ });
  if (await button.isVisible()) await button.click();
  await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
}
async function openCase() {
  await page.keyboard.press('e'); await page.locator('.ow-dialogue').waitFor();
  while (await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).isVisible()) await page.locator('.ow-dialogue').getByRole('button', { name: /^Continue/ }).click();
  await page.locator('.ow-dialogue').getByRole('button', { name: /I would like to be a person/ }).click();
  await page.locator('.inv-modal').waitFor();
}
async function fillBoard(board) {
  if (board.kind === 'ledger') for (const row of board.rows) for (const column of board.columns) await page.getByLabel(`${row.title} — ${column.title}`, { exact: true }).selectOption(board.solution[`${row.id}.${column.id}`]);
  if (board.kind === 'cipher' || board.kind === 'balance') for (const field of board.fields) await page.getByLabel(field.label, { exact: true }).fill(board.solution[field.id]);
  if (board.kind === 'sequence') for (let target = 0; target < board.solution.length; target++) {
    const card = board.cards.find(entry => entry.id === board.solution[target]); let current = (await page.locator('.inv-sequence strong').allTextContents()).indexOf(card.title);
    while (current > target) { await page.getByRole('button', { name: `Move ${card.title} earlier`, exact: true }).click(); current--; }
  }
  if (board.kind === 'route') for (const cell of board.solution.slice(1)) await page.locator('.inv-route-cell').nth(cell).click();
  if (board.kind === 'circuit') for (const cell of board.solution) await page.locator('.inv-circuit-grid button').nth(cell).click();
}
try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173'); await begin();
  const prepared = await page.evaluate(() => {
    const hook = window.__ladySupine, story = hook.getStory(), world = hook.getWorld();
    const preparedStory = { ...story, scene: 'library_cataloged', location: 'library', flags: ['entrance_denied', 'catalog_solved'], items: ['refusal'], solved: ['entrance', 'catalog'] };
    const preparedWorld = { ...world, sceneId: 'library-room', player: { ...world.player, x: 14.5, y: 12.7 } };
    return JSON.stringify({ version: 2, story: preparedStory, world: preparedWorld, savedAt: Date.now() });
  });
  await page.addInitScript(({ key, prepared }) => { if (!sessionStorage.getItem('qa-prepared-case')) { localStorage.setItem(key, prepared); sessionStorage.setItem('qa-prepared-case', 'yes'); } }, { key, prepared });
  await page.reload(); await begin();
  await openCase();
  const investigation = await page.evaluate(async () => (await import('/src/data/investigations.ts')).INVESTIGATIONS.find(entry => entry.id === 'missing_tomorrow'));
  await page.getByRole('button', { name: 'Open the casebook', exact: true }).click();
  const beforeTime = (await story()).time;
  const first = investigation.challenges[0];
  await fillBoard(first.board);
  const partial = (await story()).investigations[investigation.id];
  assert.ok(Object.keys(partial.challenges[first.id].answers).length);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).story.investigations.missing_tomorrow, key), partial, 'Case inputs must save immediately into the actual adventure save');
  await page.keyboard.press('Escape'); await page.reload(); await begin();
  await openCase();
  assert.deepEqual((await story()).investigations[investigation.id], partial, 'The root controller must restore partially completed notes');
  for (const [index, challenge] of investigation.challenges.entries()) {
    await fillBoard(challenge.board);
    await page.getByRole('button', { name: 'Check the deduction', exact: true }).click();
    assert.ok((await story()).investigations[investigation.id].challenges[challenge.id].solved);
    await page.getByRole('button', { name: index === 5 ? 'Read what this changes' : 'Follow the thread', exact: true }).click();
  }
  assert.equal((await story()).time, beforeTime, 'Reading and deductions must keep borrowed time paused');
  await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
  await page.waitForFunction(() => window.__ladySupine.getStory().flags.includes('papers_obtained'));
  assert.ok((await story()).flags.includes('case_missing_tomorrow_done'));
  assert.ok((await story()).investigations[investigation.id].finished);
  assert.ok((await story()).items.includes('identity_papers'));
  assert.equal((await story()).scene, 'library_identity');
  assert.equal((await story()).act, 2);
  assert.equal(await page.locator('.inv-modal').count(), 0);
  assert.ok((await story()).journal.some(entry => entry.scene === 'case_missing_tomorrow_conclusion'));
  assert.deepEqual(errors, []);
  console.log('PASS: actual root-controller case gate, immediate partial-note autosave/reload, six real deductions, paused borrowed time, completed case flag/archive and original pending choice resumes into act 2.');
} finally { await browser.close(); }
