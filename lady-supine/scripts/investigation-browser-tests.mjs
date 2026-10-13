import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1380, height: 1100 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(process.env.GAME_URL || 'http://localhost:5173');
const cases = await page.evaluate(async () => (await import('/src/data/investigations.ts')).INVESTIGATIONS);

async function mount(id, saved = null) {
  await page.evaluate(async ({ id, saved }) => {
    document.querySelector('vite-error-overlay')?.remove();
    const game = document.querySelector('#root');
    if (game) game.style.display = 'none';
    window.__invRoot?.unmount();
    document.querySelector('#investigation-test-harness')?.remove();
    const container = document.createElement('div');
    container.id = 'investigation-test-harness';
    document.body.append(container);
    const [{ default: React }, { default: ReactDOM }, { default: Modal }, { INVESTIGATIONS }, { emptyInvestigation }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/components/InvestigationModal.tsx'), import('/src/data/investigations.ts'), import('/src/data/investigationTypes.ts'),
    ]);
    window.__invSave = saved || emptyInvestigation();
    window.__invCompletes = 0;
    window.__invCloses = 0;
    window.__invRoot = ReactDOM.createRoot(container);
    function Harness() {
      const [progress, setProgress] = React.useState(window.__invSave);
      const [, setTick] = React.useState(0);
      window.__invRerender = () => setTick(tick => tick + 1);
      return React.createElement(Modal, {
        investigation: INVESTIGATIONS.find(item => item.id === id), progress,
        onProgress: next => { window.__invSave = next; setProgress(next); },
        onComplete: () => { window.__invCompletes += 1; },
        onClose: () => { window.__invCloses += 1; window.__invRoot.unmount(); },
      });
    }
    window.__invRoot.render(React.createElement(Harness));
  }, { id, saved });
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function start(id) {
  await mount(id);
  await page.getByRole('button', { name: 'Open the casebook', exact: true }).click();
  expect(await page.evaluate(() => window.__invSave.started)).toBe(true);
}

async function fillBoard(board) {
  switch (board.kind) {
    case 'ledger':
      for (const row of board.rows) for (const column of board.columns) await page.getByLabel(`${row.title} — ${column.title}`, { exact: true }).selectOption(board.solution[`${row.id}.${column.id}`]);
      break;
    case 'cipher': case 'balance':
      for (const field of board.fields) await page.getByLabel(field.label, { exact: true }).fill(board.solution[field.id]);
      break;
    case 'sequence':
      for (let index = 0; index < board.solution.length; index += 1) {
        const id = board.solution[index];
        const title = board.cards.find(card => card.id === id).title;
        let current = (await page.locator('.inv-sequence strong').allTextContents()).indexOf(title);
        while (current > index) {
          await page.getByRole('button', { name: `Move ${title} earlier`, exact: true }).click();
          current -= 1;
        }
      }
      break;
    case 'route':
      for (const cell of board.solution.slice(1)) await page.locator('.inv-route-cell').nth(cell).click();
      break;
    case 'circuit':
      for (const cell of board.solution) await page.locator('.inv-circuit-grid button').nth(cell).click();
      break;
  }
}

async function resume(id) {
  const saved = await page.evaluate(() => window.__invSave);
  await page.getByRole('button', { name: 'Close casebook; keep all notes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await mount(id, saved);
  expect(await page.evaluate(() => window.__invSave)).toEqual(saved);
}

async function next(index, count) {
  await page.getByRole('button', { name: index === count - 1 ? 'Read what this changes' : 'Follow the thread', exact: true }).click();
  expect(await page.evaluate(() => window.__invSave.stage)).toBe(index + 1);
}

async function finish(investigation) {
  await expect(page.getByRole('heading', { name: 'What this changes.' })).toBeVisible();
  expect(await page.evaluate(() => window.__invCompletes)).toBe(0);
  const button = page.getByRole('button', { name: 'Return to the story', exact: true });
  await button.click(); await button.click();
  expect(await page.evaluate(() => window.__invCompletes)).toBe(1);
  expect(await page.evaluate(() => window.__invSave.finished)).toBe(true);
  const valid = await page.evaluate(async id => {
    const { INVESTIGATIONS, caseIsComplete } = await import('/src/data/investigations.ts');
    return caseIsComplete(INVESTIGATIONS.find(item => item.id === id), window.__invSave);
  }, investigation.id);
  expect(valid).toBe(true);
}

try {
  errors.length = 0;
  expect(cases).toHaveLength(6);
  for (const investigation of cases) {
    expect(investigation.challenges).toHaveLength(6);
    await start(investigation.id);
    for (const [index, challenge] of investigation.challenges.entries()) {
      await expect(page.locator('.inv-reading .inv-prose p')).toHaveCount(challenge.narrative.length);
      await page.getByRole('tab', { name: /^Evidence/ }).click();
      await expect(page.locator('.inv-evidence article')).toHaveCount(challenge.evidence.length);
      await page.getByRole('button', { name: 'Check the deduction', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('does not quite support');
      await fillBoard(challenge.board);
      const beforeRerender = await page.evaluate(() => window.__invSave);
      await page.evaluate(() => window.__invRerender());
      expect(await page.evaluate(() => window.__invSave)).toEqual(beforeRerender);
      await resume(investigation.id);
      const validBeforeVerify = await page.evaluate(async challenge => {
        const { challengeSolved } = await import('/src/data/investigationTypes.ts');
        return challengeSolved(challenge.board, window.__invSave.challenges[challenge.id]);
      }, challenge);
      expect(validBeforeVerify, `${investigation.id}/${challenge.id} intended answer`).toBe(true);
      await page.getByRole('button', { name: 'Check the deduction', exact: true }).click();
      await expect(page.locator('.inv-resolution .inv-prose p')).toHaveCount(challenge.resolution.length);
      expect(await page.evaluate(id => window.__invSave.challenges[id].solved, challenge.id)).toBe(true);
      await next(index, investigation.challenges.length);
      console.log(`PASS ${investigation.id}/${challenge.id}: ${challenge.board.kind}, complete solution and saved resume`);
    }
    await finish(investigation);
    await page.getByRole('button', { name: `Stage 1: ${investigation.challenges[0].title}, solved`, exact: true }).click();
    await resume(investigation.id);
    await expect(page.locator('.inv-reading .inv-prose p')).toHaveCount(investigation.challenges[0].narrative.length);
    expect(await page.evaluate(() => window.__invSave.finished)).toBe(true);
    await expect(page.getByRole('button', { name: 'Check the deduction', exact: true })).toHaveCount(0);
    await expect(page.locator('.inv-board-fieldset')).toHaveAttribute('disabled', '');
    for (const control of await page.locator('.inv-board-fieldset input, .inv-board-fieldset select, .inv-board-fieldset button').all()) await expect(control).toBeDisabled();
    await page.getByRole('button', { name: 'Read the resolution', exact: false }).click();
    await expect(page.locator('.inv-resolution')).toBeVisible();
    console.log(`PASS ${investigation.id}: finished exactly once; completed account, evidence, and answer remain readable`);
  }
  const investigation = cases[0];
  await start(investigation.id);
  for (const [index, challenge] of investigation.challenges.entries()) {
    await page.getByRole('button', { name: 'A gentle hint', exact: false }).click();
    await page.getByRole('button', { name: 'A little more help', exact: false }).click();
    await resume(investigation.id);
    await expect(page.locator('.inv-hints p')).toHaveCount(2);
    await page.getByRole('button', { name: 'A little more help', exact: false }).click();
    await page.getByRole('button', { name: 'Fill the board with a little help', exact: false }).click();
    expect(await page.evaluate(id => window.__invSave.challenges[id].solved, challenge.id)).toBe(false);
    await page.getByRole('button', { name: 'Check the deduction', exact: true }).click();
    await expect(page.locator('.inv-resolution')).toBeVisible();
    await next(index, investigation.challenges.length);
  }
  await finish(investigation);
  console.log('PASS assistance: six board types, hints persist, correct answers filled before verification');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const investigation of cases) {
    for (const [index, challenge] of investigation.challenges.entries()) {
      const saved = { started: true, finished: false, stage: index, challenges: {} };
      await mount(investigation.id, saved);
      await expect(page.getByRole('tab', { name: 'The account', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.inv-reading')).toBeVisible();
      await page.getByRole('tab', { name: /^Evidence/ }).click();
      await expect(page.locator('.inv-evidence article')).toHaveCount(challenge.evidence.length);
      await page.getByRole('tab', { name: 'Your deduction', exact: true }).click();
      await expect(page.locator('.inv-deduction')).toBeVisible();
      expect(await page.evaluate(() => document.querySelector('.inv-modal').scrollWidth <= document.querySelector('.inv-modal').clientWidth)).toBe(true);
    }
  }
  await mount(cases[0].id);
  await expect(page.getByRole('button', { name: 'Close casebook; keep all notes' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Open the casebook', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close casebook; keep all notes' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS all 36 mobile boards, keyboard focus/Escape, scroll restoration, and no browser errors');
} finally { await browser.close(); }
