import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The Web3 section runs on a recording here (?source=replay): tests must not depend on a public node being up.
const REPLAY = './web3/twelve-seconds/?source=replay';

test('Twelve Seconds plays the recording without touching the network, and every block is readable from the keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  const sockets: string[] = [];
  page.on('websocket', ws => sockets.push(ws.url()));
  await page.goto(REPLAY);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Block Factory');
  await expect(page.locator('.info-state')).toHaveText('Replay');
  // the explanation is folded away; clicking pins it open
  await page.getByText('How to read this').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Twelve Seconds' })).toBeVisible();
  await expect(page.locator('.w3-stage canvas')).toBeAttached();

  // the recording's first block lands nine seconds in
  const latest = page.getByRole('group', { name: 'Recent blocks' }).getByRole('button', { name: /^#\d/ }).first();
  await expect(latest).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: /Block [\d,]+ in numbers/ })).toContainText('Base fee');

  // the newest block is followed (and highlighted) until another is picked
  await expect(latest).toHaveAttribute('aria-pressed', 'true');

  // the transaction list opens on demand; pick one: its details explain what it is and how it got in
  await expect(page.locator('.txlist')).toHaveCount(0);
  await page.locator('.block-transactions > summary').click();
  const first = page.locator('.txlist button').first();
  await first.focus();
  await page.keyboard.press('Enter');
  const card = page.getByRole('region', { name: 'Selected transaction' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Waited [\d.]+ s in the public mempool|Never seen in the public mempool/);
  await expect(card.getByRole('link', { name: 'X-ray this transaction →' })).toHaveAttribute('href', /\/web3\/xray\/\?tx=0x[0-9a-f]{64}&seen=(\d+|private)$/);
  await expect(card.getByRole('link', { name: /^0x/ }).first()).toHaveAttribute('href', /^https:\/\/etherscan\.io\/tx\/0x[0-9a-f]{64}$/);

  // the legend highlights without changing anything else
  const swap = page.getByRole('group', { name: 'Highlight in the chain' }).getByRole('button', { name: /Swap/ });
  await swap.click();
  await expect(swap).toHaveAttribute('aria-pressed', 'true');

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

test('the Web3 landing page lists every piece', async ({ page }) => {
  await page.goto('./web3/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Web3');
  await expect(page.getByRole('link', { name: /Twelve Seconds/ })).toHaveAttribute('href', /\/web3\/twelve-seconds\/$/);
  await expect(page.getByRole('link', { name: /Transaction X-ray/ })).toHaveAttribute('href', /\/web3\/xray\/$/);
  for (const img of await page.locator('.hub-cards img').all()) await expect(img).toHaveJSProperty('complete', true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('the X-ray takes a saved transaction apart without the network, and every layer reads as text', async ({ page }) => {
  const external: string[] = [];
  page.on('request', r => { if (!r.url().startsWith('http://localhost')) external.push(r.url()); });
  const swap = '0xab5f5d4f0debc0b6f0669d97bd80d786df83965d2b642be12b6529ee82a8891a';
  await page.goto(`./web3/xray/?tx=${swap}&seen=6400`);
  await expect(page.locator('.xr-headline')).toContainText(/^Swapped [\d,.]+ GULD for [\d,.]+ CDXR\./);
  await expect(page.locator('.xr-seen')).toContainText('6.4 s in the public mempool');
  for (const name of ['The signed envelope', 'What it asks for', 'What ran', 'What it announced', 'Where value moved', 'What it cost']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await expect(page.getByLabel('Universal Router steps')).toContainText('V4_SWAP');
  // an argument highlights the words it owns
  const deadline = page.getByRole('button', { name: /^deadline/ });
  await deadline.click();
  await expect(deadline).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });          // hover and focus gone: the pin holds
  await expect(page.locator('.xr-word.is-active')).toHaveCount(1);
  await expect(page.getByRole('table', { name: 'Net change per party' })).toContainText('GULD');

  // another example from the chips, via the URL (history works)
  await page.getByRole('button', { name: 'Approval' }).click();
  await expect(page.locator('.xr-headline')).toContainText(/^Allowed .* to spend .* ONDO\./);
  await page.goBack();
  await expect(page.locator('.xr-headline')).toContainText(/^Swapped/);

  expect(external.filter(u => !u.includes('fonts'))).toEqual([]);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('the X-ray rejects a malformed hash before asking any node', async ({ page }) => {
  await page.goto('./web3/xray/');
  await page.getByLabel('Transaction hash').fill('0x1234');
  await expect(page.getByRole('button', { name: 'X-ray', exact: true })).toBeDisabled();
});

test('Twelve Seconds draws a labelled preview block before the live node answers', async ({ page }) => {
  // hold every WebSocket closed: the page must still show a block at once, marked as a preview
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('./web3/twelve-seconds/');
  await expect(page.locator('.info-state')).toHaveText('Preview');
  await expect(page.getByRole('group', { name: 'Recent blocks' }).getByRole('button', { name: /^#26,249,566/ })).toBeVisible();
  await expect(page.locator('.w3-metrics')).toContainText('recorded preview');
});
