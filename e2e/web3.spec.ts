import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The Web3 section runs on a recording here (?source=replay): tests must not depend on a public node being up.
const REPLAY = './web3/?source=replay';

test('Twelve Seconds plays the recording without touching the network, and every block is readable from the keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  const sockets: string[] = [];
  page.on('websocket', ws => sockets.push(ws.url()));
  await page.goto(REPLAY);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Twelve Seconds');
  await expect(page.locator('.w3-status')).toContainText('Replay');
  await expect(page.locator('.w3-stage canvas')).toBeAttached();

  // the recording's first block lands nine seconds in
  const latest = page.getByRole('group', { name: 'Recent blocks' }).getByRole('button', { name: /^#\d/ }).first();
  await expect(latest).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: /Block [\d,]+ in numbers/ })).toContainText('Base fee');

  // pick a transaction from the list: its details explain what it is and how it got in
  const first = page.locator('.txlist button').first();
  await first.focus();
  await page.keyboard.press('Enter');
  const card = page.getByRole('region', { name: 'Selected transaction' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Waited [\d.]+ s in the public mempool|Never seen in the public mempool/);
  await expect(card.getByRole('link').first()).toHaveAttribute('href', /^https:\/\/etherscan\.io\/tx\/0x[0-9a-f]{64}$/);

  // the legend highlights without changing anything else
  const swap = page.getByRole('group', { name: 'Highlight in the chain' }).getByRole('button', { name: /Swap/ });
  await swap.click();
  await expect(swap).toHaveAttribute('aria-pressed', 'true');

  // announcements are opt-in, then say what landed
  await page.getByRole('button', { name: 'Announce new blocks' }).click();
  await expect(page.getByRole('status')).toContainText(/Block [\d,]+.*transactions, \d+% seen in the public mempool first/, { timeout: 30_000 });

  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  expect(sockets).toEqual([]);

  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/web3.png' });
});

test('the gallery links to the Web3 section', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: 'Web3' })).toHaveAttribute('href', /\/threejs-portfolio\/web3\/$/);
});
