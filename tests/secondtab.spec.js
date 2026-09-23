/* A SECOND TAB SEES THE FIRST, AND A STALE CARD CANNOT DUPLICATE A TRAIT.

   Two tabs of one project share one store, and nothing told either about
   the other's changes. RUN AGAINST THE PAGE BEFORE THE FIX, with two real
   tabs in one browser context: the first test went red - tab B still
   showed cap as wip after tab A had moved it twice - and the second went
   red with cap in the store twice, approved and stfp, after B acted on its
   stale card. The third is the control that a card which is still current
   changes status as it always did. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof setTraitStatus === 'function' && typeof renderShelf === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; });
};

const seed = (page) => page.evaluate(async () => {
  dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip',
    blob: new Blob([new Uint8Array(16)]), w: 16, h: 16, rarity: 1, at: 1 });
  await renderShelf();
});

const chip = (page) => page.evaluate(() => {
  const el = document.querySelector('#projbody .item[title="cap"] .cyc');
  return el ? el.textContent : null;
});

test.describe('a second tab sees the first, and a stale card cannot duplicate a trait', () => {
  test('TAB B REDRAWS when tab A moves a trait', async ({ context }) => {
    const a = await context.newPage(), b = await context.newPage();
    await ready(a); await ready(b);
    await seed(a);
    await b.evaluate(async () => { await renderShelf(); });
    expect(await chip(b), 'B starts on wip').toBe('wip');
    await a.evaluate(async () => {
      await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
      await setTraitStatus(await dbGet('t_cap_hats_approved'), 'stfp');
    });
    await b.waitForTimeout(1200);
    expect(await chip(b), 'and B shows where A put it').toBe('stfp');
  });

  test('A PRESS ON A STALE CARD is refused and said, and the store holds the trait once', async ({ context }) => {
    const a = await context.newPage(), b = await context.newPage();
    await ready(a); await ready(b);
    await seed(a);
    /* B's card, as it was drawn before A moved the trait. */
    await b.evaluate(async () => { window.__stale = await dbGet('t_cap_hats_wip'); });
    await a.evaluate(async () => {
      await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
      await setTraitStatus(await dbGet('t_cap_hats_approved'), 'stfp');
    });
    const r = await b.evaluate(async () => {
      const res = await setTraitStatus(window.__stale, 'approved');
      return { res: { ok: res.ok, stale: !!res.stale },
        caps: (await dbAll()).filter(i => i.kind === 'trait' && i.name === 'cap').map(i => i.id).sort() };
    });
    expect(r.res).toEqual({ ok: false, stale: true });
    expect(r.caps, 'cap, once').toEqual(['t_cap_hats_stfp']);
  });

  test('the control: a card that is still current changes status as it always did', async ({ context }) => {
    const a = await context.newPage();
    await ready(a);
    await seed(a);
    const r = await a.evaluate(async () => {
      const res = await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
      return { ok: res.ok, caps: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id) };
    });
    expect(r).toEqual({ ok: true, caps: ['t_cap_hats_approved'] });
  });
});
