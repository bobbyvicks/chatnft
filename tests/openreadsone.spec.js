/* OPENING A TRAIT READS ITS OWN DRAFT, NOT THE WHOLE PROJECT.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with two
   whole-store reads on every open - the draft lookup, and the base list
   startEditor refills. The controls: a base saved since an open is listed
   at the next, a newer draft is still opened from, and an older one is
   still passed over. */
import { test, expect } from '@playwright/test';

const seed = (page, draftAt) => page.evaluate(async (draftAt) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const png = async (w) => {
    const c = document.createElement('canvas'); c.width = w; c.height = w;
    c.getContext('2d').fillRect(1, 1, w - 2, w - 2);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const recs = [];
  for (let i = 0; i < 200; i++) recs.push({ id: 't_h' + i + '_hats_approved', kind: 'trait', name: 'h' + i, layer: 'hats',
    status: 'approved', blob: await png(16), w: 16, h: 16, rarity: 1, at: 1000 });
  await dbApplyShelfRecords([], recs);
  if (draftAt != null) await dbPut({ id: 'autosave.t_h0_hats_approved', kind: 'autosave', traitId: 't_h0_hats_approved',
    name: 'h0', blob: await png(24), w: 24, h: 24, at: draftAt });
  window.wholeReads = 0;
  const real = dbAll;
  dbAll = async () => { window.wholeReads++; return real(); };
}, draftAt);

const openH0 = (page) => page.evaluate(async () => {
  const t = await dbGet('t_h0_hats_approved');
  const before = window.wholeReads;
  await openTraitRecord(t);
  return { reads: window.wholeReads - before, w: art.width };
});
/* A second open, of another trait, with nothing written between. */
const openAgain = (page) => page.evaluate(async () => {
  const t = await dbGet('t_h1_hats_approved');
  const before = window.wholeReads;
  await openTraitRecord(t);
  return window.wholeReads - before;
});

test.describe('opening a trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
  });

  test('READS NOTHING BUT ITS OWN RECORDS once the base list is filled', async ({ page }) => {
    await seed(page, null);
    const r = await openH0(page);
    const again = await openAgain(page);
    console.log('open: ' + JSON.stringify(r) + ', again: ' + again);
    expect(r.reads, 'the first: the base list, once').toBeLessThanOrEqual(1);
    expect(again, 'the next, with nothing written since').toBe(0);
  });

  test('the control: a base saved since is in the list at the next open', async ({ page }) => {
    await seed(page, null);
    await openH0(page);
    await page.evaluate(async () => {
      await dbPut({ id: 'ref_hero', kind: 'ref', name: 'hero', blob: new Blob([new Uint8Array(4)]), w: 16, h: 16, at: Date.now() });
      await openTraitRecord(await dbGet('t_h1_hats_approved'));
    });
    /* startEditor fills the list without waiting for it. */
    await page.waitForFunction(() => [...document.querySelectorAll('#basepick option')].some(o => o.textContent === 'hero'),
      null, { timeout: 3000 });
  });

  test('the control: a newer draft is still found and opened from', async ({ page }) => {
    await seed(page, 5000);
    expect((await openH0(page)).w).toBe(24);
  });

  test('the control: an older draft is still passed over', async ({ page }) => {
    await seed(page, 10);
    expect((await openH0(page)).w).toBe(16);
  });
});
