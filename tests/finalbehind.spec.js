/* THE FINAL PAGE DOES NOT REDRAW THE SHELF BEHIND IT.

   An add on the final project page redrew the whole project shelf, on a
   page nobody was looking at. RUN AGAINST THE PAGE BEFORE THE FIX: the
   first test went red with a shelf render on the add. The second is the
   control that the shelf is right when you go back to it - the trait shows
   its new status - and the third that an add made from anywhere else still
   redraws the shelf at once. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
    blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1 });
  await renderShelf();
  window.__renders = 0;
  const real = renderShelf;
  renderShelf = async (v) => { window.__renders++; return real(v); };
});

const addFrom = (page, where) => page.evaluate(async (where) => {
  showPage(where, false);
  await new Promise(r => setTimeout(r, 100));
  window.__renders = 0;
  const t = window.toast; window.toast = () => {};
  try { await finalMove(await dbGet('t_cap_hats_approved'), 'stfp'); } finally { window.toast = t; }
  await new Promise(r => setTimeout(r, 100));
  return window.__renders;
}, where);

test.describe('the final page and the shelf behind it', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof finalMove === 'function');
    await seed(page);
  });

  test('AN ADD ON THE FINAL PAGE does not redraw the shelf nobody is looking at', async ({ page }) => {
    expect(await addFrom(page, 'final')).toBe(0);
  });

  test('the control: going back to the project shows the trait as it now is', async ({ page }) => {
    await addFrom(page, 'final');
    const r = await page.evaluate(async () => {
      showPage('project', false);
      await new Promise(res => setTimeout(res, 300));
      const el = [...document.querySelectorAll('#projbody .item')].find(e => (e.querySelector('b') || {}).textContent === 'cap');
      return el ? el.querySelector('.cyc').textContent : null;
    });
    expect(r).toBe('stfp');
  });

  test('the control: an add made from the project page redraws the shelf at once', async ({ page }) => {
    expect(await addFrom(page, 'project')).toBeGreaterThanOrEqual(1);
  });
});
