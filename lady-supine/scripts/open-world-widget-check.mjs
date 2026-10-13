import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = [];
const wantPuzzles = !process.argv.includes('--cases');
const wantCases = !process.argv.includes('--puzzles');
page.on('pageerror', error => errors.push(error.message));

async function mount(kind, id, progress) {
  await page.evaluate(async ({ kind, id, progress }) => {
    window.__ladySupine?.getEngine()?.setPaused(true);
    window.__widgetRoot?.unmount();
    document.querySelector('.ow-widget-harness')?.remove();
    const container = document.createElement('div');
    container.className = 'ow-widget-harness';
    Object.assign(container.style, { position: 'absolute', inset: '0', zIndex: '999' });
    document.querySelector('.ow-game').append(container);
    const [{ default: React }, { default: ReactDOM }, { default: PuzzleModal }, { default: InvestigationModal }, { INVESTIGATIONS }, { emptyInvestigation }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/components/PuzzleModal.tsx'), import('/src/components/InvestigationModal.tsx'),
      import('/src/data/investigations.ts'), import('/src/data/investigationTypes.ts'),
    ]);
    window.__widgetCompletes = 0;
    window.__widgetSave = progress || emptyInvestigation();
    window.__widgetRoot = ReactDOM.createRoot(container);
    function Harness() {
      const [saved, setSaved] = React.useState(window.__widgetSave);
      return kind === 'puzzle' ? React.createElement(PuzzleModal, { puzzleId: id, onSolve: () => { window.__widgetCompletes++; }, onClose: () => {} })
        : React.createElement(InvestigationModal, { investigation: INVESTIGATIONS.find(entry => entry.id === id), progress: saved,
          onProgress: next => { window.__widgetSave = next; setSaved(next); }, onComplete: () => { window.__widgetCompletes++; }, onClose: () => {} });
    }
    window.__widgetRoot.render(React.createElement(Harness));
  }, { kind, id, progress });
  await page.locator(kind === 'puzzle' ? '.puzzle-modal' : '.inv-modal').waitFor();
}

async function contained(selector) {
  const measurements = await page.evaluate(selector => {
    const frame = document.querySelector('.ow-game').getBoundingClientRect();
    const modal = document.querySelector(selector);
    const box = modal.getBoundingClientRect();
    return { inside: box.left >= frame.left - 1 && box.top >= frame.top - 1 && box.right <= frame.right + 1 && box.bottom <= frame.bottom + 1,
      noHorizontalOverflow: modal.scrollWidth <= modal.clientWidth + 1,
      documentFits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1 };
  }, selector);
  assert.ok(measurements.inside, `${selector} must remain inside the gameplay window`);
  assert.ok(measurements.noHorizontalOverflow, `${selector} must fit its own width`);
  assert.ok(measurements.documentFits, 'The document must not scroll outside the gameplay window');
}

async function fillBoard(board) {
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

try {
  await page.goto(process.env.GAME_URL || 'http://localhost:5173');
  // The loading screen also owns an .ow-game; attach harnesses after it is replaced.
  await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
  const cases = await page.evaluate(async () => (await import('/src/data/investigations.ts')).INVESTIGATIONS);
  const ids = ['entrance', 'rhyme', 'fishing', 'blocks', 'catalog', 'coupons', 'forest', 'artwork', 'casino', 'permit', 'reversion', 'brain', 'switch', 'minder', 'lullaby', 'final_gate'];
  if (wantPuzzles) for (const id of ids) {
    await mount('puzzle', id);
    await contained('.puzzle-modal');
    await page.getByRole('button', { name: /Request a hint/ }).click();
    await page.getByRole('button', { name: /Another hint/ }).click();
    await page.getByRole('button', { name: /Another hint/ }).click();
    await page.getByRole('button', { name: /Use the margin notes/ }).click();
    assert.equal(await page.evaluate(() => window.__widgetCompletes), 0);
    await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__widgetCompletes), 1);
    console.log(`PASS in-frame puzzle ${id}: assisted solution commits once`);
  }
  if (wantCases) for (const investigation of cases) {
    await mount('investigation', investigation.id);
    await contained('.inv-modal');
    await page.getByRole('button', { name: 'Open the casebook', exact: true }).click();
    for (const [index, challenge] of investigation.challenges.entries()) {
      await fillBoard(challenge.board);
      const partial = await page.evaluate(() => window.__widgetSave);
      await mount('investigation', investigation.id, partial);
      assert.deepEqual(await page.evaluate(() => window.__widgetSave), partial, 'Partially completed deductions must survive remount');
      await page.getByRole('button', { name: 'Check the deduction', exact: true }).click();
      assert.ok(await page.evaluate(id => window.__widgetSave.challenges[id].solved, challenge.id));
      await page.getByRole('button', { name: index === 5 ? 'Read what this changes' : 'Follow the thread', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Return to the story', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__widgetCompletes), 1);
    const complete = await page.evaluate(async id => {
      const { INVESTIGATIONS, caseIsComplete } = await import('/src/data/investigations.ts');
      return caseIsComplete(INVESTIGATIONS.find(entry => entry.id === id), window.__widgetSave);
    }, investigation.id);
    assert.ok(complete);
    console.log(`PASS in-frame investigation ${investigation.id}: six real boards and partial note resume`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (wantPuzzles) for (const id of ids) { await mount('puzzle', id); await contained('.puzzle-modal'); }
  if (wantCases) for (const investigation of cases) for (const [index] of investigation.challenges.entries()) {
    await mount('investigation', investigation.id, { started: true, finished: false, stage: index, challenges: {} });
    await page.getByRole('tab', { name: 'Your deduction', exact: true }).click();
    await contained('.inv-modal');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${wantPuzzles ? 16 : 0} puzzles and ${wantCases ? 36 : 0} caseboards fit desktop/mobile gameplay window; answers, completion and resumed notes.`);
} finally { await browser.close(); }
