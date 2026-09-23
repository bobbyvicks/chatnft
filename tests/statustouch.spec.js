/* THE STATUS BUTTON IS A THUMB'S SIZE ON A TOUCH SCREEN.

   20 px tall on every tile, and a miss by 10 px or more opened the editor.
   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red at 20 px.
   The second is the control that a mouse keeps the compact button. */
import { test, expect } from '@playwright/test';

const height = async (browser, touch) => {
  const ctx = await browser.newContext(touch
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  const h = await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false); activeWs = null; await dbClear();
    await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
      blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1 });
    showPage('project', false);
    await renderShelf();
    const b = document.querySelector('#projbody .item .cyc');
    return { h: Math.round(b.getBoundingClientRect().height), font: parseFloat(getComputedStyle(b).fontSize) };
  });
  await ctx.close();
  return h;
};

test('ON A TOUCH SCREEN the status button is at least 30 px tall', async ({ browser }) => {
  const r = await height(browser, true);
  expect(r.h).toBeGreaterThanOrEqual(30);
  /* A rule placed above the button's own one lost its font size to it. */
  expect(r.font, 'and its label is readable at that size').toBeGreaterThanOrEqual(11);
});

test('the control: with a mouse it stays compact', async ({ browser }) => {
  const r = await height(browser, false);
  expect(r.h).toBeLessThan(30);
  expect(r.font).toBeLessThan(11);
});
