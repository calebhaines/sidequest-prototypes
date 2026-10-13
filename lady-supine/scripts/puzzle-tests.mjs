import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
await page.routeWebSocket('**', socket => socket.close());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(process.env.GAME_URL || 'http://localhost:5173');

// Mount the production component in an isolated root; no testing hooks are added to the game.
async function mount(id) {
  await page.evaluate(async puzzleId => {
    document.querySelector('vite-error-overlay')?.remove();
    const gameRoot = document.querySelector('#root');
    if (gameRoot) gameRoot.style.display = 'none';
    window.__puzzleRoot?.unmount();
    document.querySelector('#puzzle-test-harness')?.remove();
    const container = document.createElement('div');
    container.id = 'puzzle-test-harness';
    document.body.append(container);
    const [{ default: React }, { default: ReactDOM }, { default: PuzzleModal }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'),
      import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/components/PuzzleModal.tsx'),
    ]);
    window.__puzzleSolves = 0;
    window.__puzzleCloses = 0;
    window.__puzzleRoot = ReactDOM.createRoot(container);
    window.__puzzleRoot.render(React.createElement(PuzzleModal, {
      puzzleId,
      onSolve: () => { window.__puzzleSolves += 1; },
      onClose: () => { window.__puzzleCloses += 1; },
    }));
  }, id);
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function finish(id) {
  const returnButton = page.getByRole('button', { name: 'Return to the story', exact: true });
  await expect(returnButton).toBeVisible();
  expect(await page.evaluate(() => window.__puzzleSolves)).toBe(0);
  await returnButton.click();
  await returnButton.click();
  expect(await page.evaluate(() => window.__puzzleSolves)).toBe(1);
  console.log(`PASS ${id}: actual solution, confirmed exactly once`);
}

async function reorder(titles) {
  for (let target = 0; target < titles.length; target += 1) {
    let actual = (await page.locator('.pzl-order-card strong').allTextContents()).indexOf(titles[target]);
    while (actual > target) {
      await page.getByRole('button', { name: `Move ${titles[target]} earlier`, exact: true }).click();
      actual -= 1;
    }
  }
}

const solutions = {
  entrance: async () => {
    await page.getByRole('button', { name: 'Ask the door' }).click();
    await expect(page.getByRole('status')).toContainText('politely declines');
    for (const [index, value] of ['4', '7', '9'].entries()) await page.getByLabel(`Clock wheel ${index + 1}`).selectOption(value);
    await page.getByRole('button', { name: 'Ask the door' }).click();
  },
  rhyme: async () => {
    for (const [index, value] of ['time', 'willow', 'pillow'].entries()) await page.getByLabel(`Missing rhyme ${index + 1}`).selectOption(value);
    await page.getByRole('button', { name: 'Finish the song' }).click();
  },
  fishing: async () => {
    let attempts = 0;
    while (!(await page.getByRole('button', { name: 'Return to the story', exact: true }).isVisible()) && attempts < 8) {
      await page.getByRole('button', { name: 'Cast the line' }).click();
      await page.waitForFunction(() => {
        const position = Number(document.querySelector('.pzl-meter')?.getAttribute('aria-valuenow'));
        return position >= 46 && position <= 53;
      }, null, { timeout: 6000 });
      await page.getByRole('button', { name: 'Pull the line' }).click();
      attempts += 1;
    }
    expect(attempts).toBeLessThan(8);
  },
  blocks: async () => { await reorder(['Earth', 'Bark', 'Leaf', 'Sun']); await page.getByRole('button', { name: 'Present the stack' }).click(); },
  catalog: async () => { await reorder(['The Book of Arrival', 'The First Harvest', 'The Royal Decree', 'The Hospital Register']); await page.getByRole('button', { name: 'Shelve the books' }).click(); },
  coupons: async () => {
    for (const [index, denomination] of [5, 12, 20].entries()) await page.getByLabel(`Number of ${denomination}-minute coupons`).selectOption(['3', '2', '0'][index]);
    await page.getByRole('button', { name: 'Exchange the kisses' }).click();
  },
  forest: async () => {
    await page.getByRole('button', { name: 'Fold the leaf' }).click();
    await page.getByRole('button', { name: 'Moon', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('beginning');
    for (const name of ['Willow', 'Raven', 'Lantern', 'Moon']) await page.getByRole('button', { name, exact: true }).click();
  },
  artwork: async () => {
    for (const name of ['Seed A thing growing', 'Bowl A supper shared', 'Door A way standing open']) await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Read the hidden picture' }).click();
  },
  casino: async () => {
    for (const name of ['Leaf', 'Lantern', 'House']) await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Turn the winning tiles' }).click();
  },
  permit: async () => {
    await page.getByLabel('Species of applicant').selectOption('human');
    await page.getByLabel('Purpose of visit').selectOption('fallen');
    await page.getByLabel('Requested branches').fill('3');
    await page.getByRole('button', { name: 'Submit the request' }).click();
  },
  reversion: async () => { await reorder(['Yesterday', 'Meeting a friend', 'Your first day of work', 'Your first lost tooth', 'Your first breath']); await page.getByRole('button', { name: 'Let the memories fall' }).click(); },
  brain: async () => {
    await page.getByRole('button', { name: /Care/ }).click();
    await expect(page.getByRole('status')).toContainText('left first');
    for (const [left, right] of [['Tenderness', 'Care'], ['Memory', 'Recall'], ['Resolve', 'Courage']]) {
      await page.getByRole('button', { name: new RegExp(left) }).click();
      await page.getByRole('button', { name: new RegExp(right) }).click();
    }
  },
  switch: async () => {
    await page.getByRole('button', { name: 'C Lamps 3 & 4', exact: true }).click();
    await page.getByRole('button', { name: 'D Lamps 1 & 3', exact: true }).click();
    await expect(page.locator('.pzl-lit')).toHaveCount(2);
    await page.getByRole('button', { name: 'Engage the switch' }).click();
  },
  minder: async () => {
    await page.getByRole('button', { name: 'A loud declaration', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('suspicious');
    for (const name of ['Wind chime', 'Polished mirror', 'Velvet curtain']) await page.getByRole('button', { name, exact: true }).click();
  },
  lullaby: async () => {
    await page.getByLabel('Play sound').check();
    await page.getByRole('button', { name: 'Mi Middle', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('stirs');
    for (const name of ['Do Low', 'Sol High', 'Mi Middle', 'Sol High', 'Do Low']) await page.getByRole('button', { name, exact: true }).click();
  },
  final_gate: async () => {
    for (const [name, value] of [['pip', '20'], ['brindle', '25'], ['ada', '15'], ['the entrance', '30']]) await page.getByLabel(`Minutes for ${name}`, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Make time for everyone' }).click();
  },
};

try {
  // Ignore startup failures from a campaign file still being produced by another agent.
  errors.length = 0;
  for (const [id, solve] of Object.entries(solutions)) {
    await mount(id);
    await solve();
    await finish(id);
    await mount(id);
    await page.getByRole('button', { name: 'A gentle hint' }).click();
    await page.getByRole('button', { name: 'A little more help' }).click();
    await page.getByRole('button', { name: 'A little more help' }).click();
    await expect(page.locator('.puzzle-hint')).toHaveCount(3);
    await page.getByRole('button', { name: 'Solve with a little help' }).click();
    await finish(`${id} assistance`);
  }
  await mount('entrance');
  await expect(page.getByRole('button', { name: 'Close puzzle and return to the story' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Ask the door' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close puzzle and return to the story' })).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__puzzleCloses)).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of Object.keys(solutions)) {
    await mount(id);
    expect(await page.evaluate(() => document.querySelector('.puzzle-modal').scrollWidth <= document.querySelector('.puzzle-modal').clientWidth)).toBe(true);
  }
  await page.evaluate(() => window.__puzzleRoot.unmount());
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(errors).toEqual([]);
  console.log('PASS keyboard focus, Escape, scroll restoration, no browser errors, and all 16 mobile layouts');
} finally {
  await browser.close();
}
