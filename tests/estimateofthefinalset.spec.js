/* THE SHARE ESTIMATE FOR THE FINAL SET IS DRAWN FROM THE FINAL SET.

   With rules, a trait's share is estimated by drawing characters, and the
   draws came from the project page's rows - every approved trait - even
   when the question was about the final set. RUN AGAINST THE PAGE BEFORE
   THE FIX: the first test went red with approved-but-not-final hats among
   the draws. The second is the control that the shelf's own estimate still draws from
   the rows. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', layers: ['skins', 'hats', 'unsorted'], hidden: [], at: 1 });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  const png = await new Promise(r => c.toBlob(r, 'image/png'));
  const rec = (name, layer, status) => ({ id: 't_' + name + '_' + layer + '_' + status, kind: 'trait', name, layer, status,
    blob: png, w: 16, h: 16, rarity: 1, at: 1 });
  /* Two final hats, two approved hats not in the final set, one final skin. */
  await dbApplyShelfRecords([], [rec('f1', 'hats', 'stfp'), rec('f2', 'hats', 'stfp'),
    rec('a1', 'hats', 'approved'), rec('a2', 'hats', 'approved'), rec('s1', 'skins', 'stfp')]);
  await renderShelf();
  /* A rule, so the share is an estimate rather than arithmetic. */
  RULES = [[traitKey(await dbGet('t_a1_hats_approved')), traitKey(await dbGet('t_s1_skins_stfp'))].sort()];
  for (const k of Object.keys(localStorage)) if (k.indexOf('pb.dist.') === 0) localStorage.removeItem(k);
  try { distMemo.clear(); } catch (_) {}
});

/* The trait keys the estimate drew, over the final set or the whole shelf. */
const shares = (page, which) => page.evaluate(async (which) => {
  const items = (await dbAll()).filter(i => i.kind === 'trait' || i.kind === 'ref');
  const pool = which === 'final' ? items.filter(i => i.kind === 'ref' || i.status === 'stfp') : items;
  const count = distributionOf(pool, false);
  return { rows: Object.keys(cPools()).length, keys: [...count.keys()] };
}, which);

test.describe('the share estimate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof distributionOf === 'function' && typeof cPools === 'function');
    await seed(page);
  });

  test('FOR THE FINAL SET draws only final-set traits', async ({ page }) => {
    const r = await shares(page, 'final');
    console.log('final: ' + JSON.stringify(r));
    expect(r.rows, 'the project rows were built, so the old path had them to use').toBeGreaterThan(0);
    expect(r.keys.some(k => /a1|a2/.test(k)), 'no approved-but-not-final hat drawn').toBe(false);
  });

  test('the control: the shelf\'s own estimate still draws from the rows, every approved hat included', async ({ page }) => {
    const r = await shares(page, 'shelf');
    /* a2, not a1: the rule keeps a1 off every character, because s1 is the
       only skin. First written with a1, which was wrong before and after. */
    expect(r.keys.some(k => /a2/.test(k)) && r.keys.some(k => /f1/.test(k))).toBe(true);
  });
});
