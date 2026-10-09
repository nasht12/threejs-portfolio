import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const current = (page: Page) => page.locator('#works button[aria-current="true"]');
const status = (page: Page) => page.getByRole('status').filter({ hasText: /\w/ }).last();

async function waitForHall(page: Page) {
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText(/Hanging the pictures/)).toHaveCount(0, { timeout: 45_000 });
}

test('the ring renders cards, not a blank canvas', async ({ page }) => {
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
    // count pixels that differ clearly from the #f0f0f0 background: that's the cards
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 240) + Math.abs(d[i + 1] - 240) + Math.abs(d[i + 2] - 240) > 60) n++;
    return n;
  }, band.toString('base64'));
  expect(lit).toBeGreaterThan(400);
  await page.screenshot({ path: 'test-results/ring.png' });
});

test('keyboard: turn the ring, dive through the portal, come back', async ({ page }) => {
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
  await expect(page).toHaveURL(/#\/work\/isle-of-the-dead$/);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/ring-turned.png' });

  await page.keyboard.press('Enter'); // dive through the front card's portal
  await expect(page.getByRole('button', { name: 'Entering…' })).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/dive.png' });
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
  const panel = page.locator('.panel');
  await expect(panel).toHaveAttribute('data-open', 'false');
  await page.waitForTimeout(1000); // let the ring settle so the card is where the pointer goes
  await page.mouse.move(720, 450, { steps: 6 }); // over the front card
  await expect(panel).toHaveAttribute('data-open', 'true');
  await page.getByRole('button', { name: 'Enter the scene' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.stage canvas')).toHaveCount(1);
});

test('deep links open straight into a scene', async ({ page }) => {
  await page.goto('./#/scene/gulf-stream-study');
  await expect(page.getByRole('dialog', { name: 'Gulf Stream Study' })).toBeVisible();
});

// One test per scene: each builds its world on the CPU (SwiftShader), which takes a while on a 2-core CI runner.
for (const id of ['merced-river', 'isle-of-the-dead', 'fog-hollow', 'indigo-ridge', 'dents-du-midi', 'gulf-stream-study', 'rigging-bench']) {
  test(`scene ${id} is deployed and loads every asset`, async ({ page }) => {
    test.setTimeout(300_000);
    const failed: string[] = [];
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failed.push(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => { if (!r.url().endsWith('/favicon.ico')) failed.push(`failed ${r.url()}`); });
    // The three painted landscapes share one engine that fetches its rock and ground scans after building the terrain.
    const engineAssets = ['merced-river', 'isle-of-the-dead', 'fog-hollow'].includes(id)
      ? ['tex/cliff_side_diff.jpg', 'tex/forest_ground_04_nor.jpg'].map(path => page.waitForResponse(r => r.url().endsWith(path) && r.ok(), { timeout: 240_000 }))
      : id === 'rigging-bench'
        ? [page.waitForResponse(r => r.url().endsWith('models/sable.glb') && r.ok(), { timeout: 120_000 })]
        : [];
    await page.goto(`./scenes/${id}.html`, { waitUntil: 'load' });
    await Promise.all(engineAssets);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 90_000 });
    await page.waitForLoadState('networkidle', { timeout: 90_000 });
    expect(failed).toEqual([]);
    // the adaptive-quality controller is running (scripts/patch-scenes.mjs)
    if (!['gulf-stream-study', 'rigging-bench'].includes(id)) {
      await expect(page.locator('html')).toHaveAttribute('data-quality-rung', /^\d+\/\d+$/, { timeout: 60_000 });
    }
  });
}

test('the light tier drops the device pixel ratio', async ({ page }) => {
  await page.goto('./?quality=low');
  await expect(page.getByText(/Hanging the pictures/)).toHaveCount(0, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Frame stats' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.stats')).toContainText('dpr     1.00 · tier low');
});

test('no WCAG A/AA violations on the ring, before and after turning it', async ({ page }) => {
  await waitForHall(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button', { name: /Gulf Stream Study/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gulf Stream Study');
  expect((await scan()).violations).toEqual([]);
});
