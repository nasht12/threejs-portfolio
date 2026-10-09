import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const current = (page: Page) => page.locator('#works button[aria-current="true"]');
const status = (page: Page) => page.getByRole('status').filter({ hasText: /\w/ }).last();

async function waitForHall(page: Page) {
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText(/Hanging the pictures/)).toHaveCount(0, { timeout: 45_000 });
}

test('the hall renders pixels, not a blank canvas', async ({ page }) => {
  await waitForHall(page);
  await page.waitForTimeout(1500);
  // Read pixels from a real screenshot: a WebGL canvas without preserveDrawingBuffer can't be read back reliably.
  const band = await page.screenshot({ clip: { x: 0, y: 200, width: 1440, height: 500 } });
  const lit = await page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160; c.height = 56;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 160, 56);
    const d = ctx.getImageData(0, 0, 160, 56).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n;
  }, band.toString('base64'));
  expect(lit).toBeGreaterThan(400);
  await page.screenshot({ path: 'test-results/hall.png' });
});

test('keyboard: walk the list, step closer, enter the scene, come back', async ({ page }) => {
  await waitForHall(page);

  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Enter'); // moves focus to the current work
  await expect(current(page)).toBeFocused();
  await expect(current(page)).toContainText('Merced River');

  await page.keyboard.press('ArrowRight');
  await expect(current(page)).toContainText('Isle of the Dead');
  await expect(current(page)).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Isle of the Dead');
  await expect(status(page)).toContainText('Isle of the Dead, 2 of 7');

  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Enter the scene' })).toBeVisible();
  await expect(page).toHaveURL(/#\/work\/isle-of-the-dead$/);
  await page.screenshot({ path: 'test-results/focus.png' });

  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Isle of the Dead' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#\/scene\/isle-of-the-dead$/);
  await expect(dialog.locator('iframe')).toHaveAttribute('src', /scenes\/isle-of-the-dead\.html$/);
  await expect(page.getByRole('button', { name: '← Gallery' })).toBeFocused();
  // one WebGL context at a time: the gallery canvas is gone while a scene is open
  await expect(page.locator('.stage canvas')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(current(page)).toBeFocused();
  await expect(current(page)).toContainText('Isle of the Dead');
  await expect(page.locator('.stage canvas')).toHaveCount(1);
});

test('the browser Back button closes a scene', async ({ page }) => {
  await waitForHall(page);
  await page.getByRole('button', { name: 'Step closer' }).click();
  await page.getByRole('button', { name: 'Enter the scene' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enter the scene' })).toBeVisible();
});

test('deep links open straight into a scene', async ({ page }) => {
  await page.goto('./#/scene/gulf-stream-study');
  await expect(page.getByRole('dialog', { name: 'Gulf Stream Study' })).toBeVisible();
});

test('every scene page is deployed and loads its assets', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failed.push(`${r.status()} ${r.url()}`); });
  for (const id of ['merced-river', 'isle-of-the-dead', 'fog-hollow', 'indigo-ridge', 'dents-du-midi', 'gulf-stream-study', 'rigging-bench']) {
    await page.goto(`./scenes/${id}.html`);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
  }
  expect(failed).toEqual([]);
});

test('Chromebook tier drops the reflective floor and the device pixel ratio', async ({ page }) => {
  await waitForHall(page);
  await page.getByRole('radio', { name: 'Chromebook' }).check();
  await page.getByRole('button', { name: 'Frame stats' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.stats')).toContainText('dpr     1.00 · tier low');
});

test('no WCAG A/AA violations in the hall or at a frame', async ({ page }) => {
  await waitForHall(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Step closer' }).click();
  expect((await scan()).violations).toEqual([]);
});
