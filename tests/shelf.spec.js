import { test, expect } from '@playwright/test';

async function openShelf(page) {
  let releaseAuth;
  const authReady = new Promise(resolve => { releaseAuth = resolve; });
  await page.addInitScript(() => {
    localStorage.setItem('chatnft.session', JSON.stringify({
      access_token: 'shelf-test-access-token',
      refresh_token: 'shelf-test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'shelf-test-user' },
    }));
  });
  await page.route('**/dpracoavrcqyenfieksi.supabase.co/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route('**/auth/v1/user**', async route => {
    await authReady;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'shelf-test-user',
        email: 'shelf-test@example.invalid',
        user_metadata: { username: 'shelf test' },
      }),
    });
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  await page.evaluate(() => {
    const originalRenderShelf = renderShelf;
    window.__shelfRenderComplete = 0;
    renderShelf = async function (...args) {
      try { return await originalRenderShelf.apply(this, args); }
      finally { window.__shelfRenderComplete += 1; }
    };
  });
  releaseAuth();
  await page.waitForFunction(() =>
    authed === true && window.__shelfRenderComplete > 0 && document.getElementById('signin').hidden);
  await page.evaluate(async () => {
    await dbClear();
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f5a524'; context.fillRect(0, 0, 8, 8);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const rows = [
      { id: 't_alpha_backgrounds_wip', kind: 'trait', name: 'alpha', layer: 'backgrounds', status: 'wip', blob, w: 8, h: 8, at: 3, shelfOrder: 1024 },
      { id: 't_beta_backgrounds_approved', kind: 'trait', name: 'beta', layer: 'backgrounds', status: 'approved', blob, w: 8, h: 8, at: 2, shelfOrder: 2048 },
      { id: 't_gamma_skins_wip', kind: 'trait', name: 'gamma', layer: 'skins', status: 'wip', blob, w: 8, h: 8, at: 1, shelfOrder: 1024 },
    ];
    for (const row of rows) await dbPut(row);
    await renderShelf();
  });
  await expect(page.locator('[data-shelf-card-key]')).toHaveCount(3);
}

async function pointerDrag(page, source, destination) {
  await destination.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await destination.boundingBox();
  if (!from || !to) throw new Error('drag endpoints are not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 4, { steps: 8 });
  await page.mouse.up();
}

test.describe('the saved trait shelf', () => {
  test('temporarily hides, reveals, isolates, and restores cards', async ({ page }) => {
    await openShelf(page);

    await page.locator('[data-shelf-card-key="t_alpha_backgrounds_wip"] .shelftools button').filter({ hasText: 'hide' }).click();
    await expect(page.locator('[data-shelf-card-key="t_alpha_backgrounds_wip"]')).toHaveCount(0);
    await expect(page.locator('#shelfhidden')).toHaveText('Show hidden (1)');

    await page.locator('#shelfhidden').click();
    await expect(page.locator('[data-shelf-card-key="t_alpha_backgrounds_wip"]')).toHaveClass(/temporarily-hidden/);
    await expect(page.locator('[data-shelf-card-key="t_alpha_backgrounds_wip"] .shelftools button').filter({ hasText: 'show' })).toBeVisible();

    await page.locator('[data-shelf-card-key="t_beta_backgrounds_approved"] .shelftools button').filter({ hasText: 'only' }).click();
    await expect(page.locator('[data-shelf-card-key]')).toHaveCount(1);
    await expect(page.locator('[data-shelf-card-key="t_beta_backgrounds_approved"]')).toBeVisible();
    await expect(page.locator('#shelfhidden')).toHaveText('Show hidden (2)');

    await page.locator('#shelfshowall').click();
    await expect(page.locator('[data-shelf-card-key]')).toHaveCount(3);
    await expect(page.locator('#shelfhidden')).toBeHidden();
  });

  test('drags within and between layers without opening the editor', async ({ page }) => {
    await openShelf(page);

    await pointerDrag(
      page,
      page.locator('[data-shelf-card-key="t_alpha_backgrounds_wip"] .draghandle'),
      page.locator('[data-shelf-card-key="t_beta_backgrounds_approved"]'),
    );
    await expect.poll(() => page.evaluate(async () =>
      (await dbAll()).filter(row => row.layer === 'backgrounds')
        .sort(shelfCore.compareShelfRecords).map(row => row.name).join(',')))
      .toBe('beta,alpha');
    await expect(page.locator('#app')).toBeHidden();

    await pointerDrag(
      page,
      page.locator('[data-shelf-card-key="t_alpha_backgrounds_wip"] .draghandle'),
      page.locator('[data-shelf-card-key="t_gamma_skins_wip"]'),
    );
    await expect.poll(() => page.evaluate(async () => {
      const alpha = (await dbAll()).find(row => row.name === 'alpha');
      return alpha && `${alpha.id}|${alpha.layer}`;
    })).toBe('t_alpha_skins_wip|skins');
    await expect(page.locator('#app')).toBeHidden();
  });
});
