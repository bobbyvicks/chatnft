/* A DRAFT DOES NOT REDRAW THE OTHER TABS, AND A REDRAW WAITS FOR A FIELD.

   Two tabs of one project. RUN AGAINST THE PAGE BEFORE THE FIX: the first
   test went red with the other tab redrawing its shelf for a draft write,
   and the second with a weight being typed there wiped by a redraw. The
   third is the control that a real change to a trait still redraws the
   other tab. */
import { test, expect } from '@playwright/test';

const open = async (context) => {
  const page = await context.newPage();
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function' && typeof dbPut === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; });
  return page;
};
/* Counts the shelf redraws this tab makes from here on. */
const countRedraws = (page) => page.evaluate(() => {
  window.redraws = 0;
  const real = renderShelf;
  renderShelf = async (...a) => { window.redraws++; return real(...a); };
});

test.describe('two tabs of one project', () => {
  let a, b;
  test.beforeEach(async ({ context }) => {
    a = await open(context);
    b = await open(context);
    await a.evaluate(async () => {
      await dbClear();
      LAYERS = ['hats', 'unsorted'];
      await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
        blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 0 });
    });
    await b.evaluate(async () => { LAYERS = ['hats', 'unsorted']; showPage('project', false); await renderShelf(); });
    /* Past anything the setup itself told. */
    await b.waitForTimeout(500);
    await countRedraws(b);
  });

  test('A DRAFT WRITTEN IN ONE does not redraw the other', async () => {
    await a.evaluate(() => dbPut({ id: 'autosave.t_cap_hats_approved', kind: 'autosave', traitId: 't_cap_hats_approved',
      name: 'cap', blob: new Blob([new Uint8Array(8)]), at: Date.now() }));
    await b.waitForTimeout(600);
    expect(await b.evaluate(() => window.redraws)).toBe(0);
  });

  test('A WEIGHT BEING TYPED in the other is not wiped by a redraw, which comes after', async () => {
    await b.evaluate(() => { const r = document.querySelector('#projbody .item .rar'); r.focus(); r.value = '7'; window.box = r; });
    await a.evaluate(() => dbPut({ id: 't_hat_hats_approved', kind: 'trait', name: 'hat', layer: 'hats', status: 'approved',
      blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 2, shelfOrder: 1 }));
    await b.waitForTimeout(600);
    const during = await b.evaluate(() => ({ redraws: window.redraws, same: window.box.isConnected && document.activeElement === window.box,
      value: window.box.value }));
    console.log('typing: ' + JSON.stringify(during));
    expect(during).toEqual({ redraws: 0, same: true, value: '7' });
    await b.evaluate(() => window.box.blur());
    await b.waitForFunction(() => window.redraws > 0);
  });

  test('the control: a trait written in one still redraws the other', async () => {
    await a.evaluate(() => dbPut({ id: 't_hat_hats_approved', kind: 'trait', name: 'hat', layer: 'hats', status: 'approved',
      blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 2, shelfOrder: 1 }));
    await b.waitForFunction(() => window.redraws > 0);
    await b.waitForFunction(() => document.querySelectorAll('#projbody .item').length === 2);
  });
});
