/* Tooltips are promises, and they outlive the behaviour they describe.

   A sweep of all 35 static title attributes against the code. Three made
   specific factual claims worth measuring; two were false.

   "How often a layer is left out when randomising. Skins is always drawn."
   Measured: 500 of 500 characters carry a skin normally, and 0 of 500 once the
   skins SET IS TURNED OFF - a feature added the same day. The sentence was
   made false by a change in another part of the file and nothing pointed at
   it. It also hardcoded the layer name, which is a copy of a value in prose
   and a dependency in the direction nobody checks.

   "...sizes to whole multiples of the cell count." Measured: snapToGrid(40) is
   40 on a grid of 160, and 40 is a whole DIVISOR, not a multiple. The ladder
   below one cell is divisors - which is the thing that makes shrinking work at
   all - and the tooltip still described only the half that existed before.

   The third claim, "Each one is different from the others" on Generate, was
   TRUE and was left alone: asked for 50 on a two-character set it returns 2,
   all distinct. It gives fewer than asked rather than repeating.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  await put('veil', 'masks');
  await renderShelf();
});

/* The tooltip, and whether skins is ACTUALLY drawn, measured together - the
   whole point is that the two must agree. */
const claimAndReality = (page) => page.evaluate(() => {
  const pools = cPools();
  let n = 0;
  for (let i = 0; i < 300; i++) if (randomCombo(pools).some(t => t.layer === 'skins')) n++;
  return { tooltip: document.getElementById('cemptytip').title, skinsDrawn: n };
});

const setSkins = (page, off) => page.evaluate(async (o) => {
  if (o) HIDDEN_LAYERS.add('skins'); else HIDDEN_LAYERS.delete('skins');
  await buildCompose(cItems);
  await new Promise(r => setTimeout(r, 120));
}, off);

test.describe('tooltips that make factual claims', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildCompose === 'function');
    await seed(page);
    await page.waitForTimeout(400);
  });

  test('while the set is on it says skins is always drawn, and it is', async ({ page }) => {
    const r = await claimAndReality(page);
    expect(r.skinsDrawn, 'every character carries one').toBe(300);
    expect(r.tooltip, 'and the tooltip says so').toContain('always drawn');
    expect(r.tooltip).not.toContain('turned off');
  });

  test('turning the set off makes the old sentence false, and the new one true', async ({ page }) => {
    await setSkins(page, true);
    const r = await claimAndReality(page);
    expect(r.skinsDrawn, 'nothing carries one now').toBe(0);
    expect(r.tooltip, 'so it stops claiming they are always drawn').toContain('turned off');
    // The exact shape of the old lie: "skins is always drawn." with nothing after.
    expect(r.tooltip, 'the bare claim is gone').not.toMatch(/always drawn\.\s*$/);
  });

  test('and turning it back on restores the plain sentence', async ({ page }) => {
    // The control. A tooltip stuck on "turned off" would pass the test above
    // and be wrong in the ordinary case, which is worse.
    await setSkins(page, true);
    await setSkins(page, false);
    const r = await claimAndReality(page);
    expect(r.skinsDrawn).toBe(300);
    expect(r.tooltip).toContain('always drawn');
    expect(r.tooltip).not.toContain('turned off');
  });

  test('the layer is named from ALWAYS_PRESENT, not written into the markup', async ({ page }) => {
    // A prose copy of a value goes stale silently. This is what stops the same
    // sentence being wrong again the next time that list changes.
    const named = await page.evaluate(() => {
      const before = ALWAYS_PRESENT.slice();
      ALWAYS_PRESENT.length = 0;
      ALWAYS_PRESENT.push('bodies');
      emptyChanceTip();
      const t = document.getElementById('cemptytip').title;
      ALWAYS_PRESENT.length = 0;
      for (const l of before) ALWAYS_PRESENT.push(l);
      emptyChanceTip();
      return t;
    });
    expect(named, 'it follows the list').toContain('bodies is always drawn');
    expect(named, 'and does not still say skins').not.toContain('skins');
  });

  test('the snap tooltip describes the ladder it actually uses', async ({ page }) => {
    // It promised "whole multiples of the cell count". On a grid of 160,
    // snapToGrid(40) is 40 - a whole DIVISOR, which the sentence never
    // mentioned, and which is the half that makes shrinking possible.
    const r = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[title]')]
        .find(e => e.title.indexOf('Snap the angle') === 0);
      return { tooltip: el ? el.title : null,
               fourty: snapToGrid(40), grid: projectGrid };
    });
    expect(r.fourty, '40 stays 40 on a 160 grid').toBe(40);
    expect(r.grid % r.fourty, 'and it is a divisor of it').toBe(0);
    expect(r.fourty, 'not a multiple').toBeLessThan(r.grid);
    expect(r.tooltip, 'so the tooltip says both halves').toContain('divisions of it');
    expect(r.tooltip, 'and still says the multiples half').toContain('whole multiples');
  });

  test('the Generate claim that every character is different is TRUE', async ({ page }) => {
    // Checked in the same sweep and deliberately not changed. Asked for far
    // more than the set can make, it returns fewer - it never repeats one.
    const r = await page.evaluate(() => {
      RULES = [];
      const got = uniqueCombos(cPools(), 50);
      const keys = got.map(c => c.map(t => t.layer + '/' + t.name).sort().join('|'));
      return { returned: got.length, distinct: new Set(keys).size };
    });
    expect(r.returned, 'fewer than asked, because the set is small').toBeLessThan(50);
    expect(r.distinct, 'and every one of them is different').toBe(r.returned);
  });
});
