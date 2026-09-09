/* The rules nobody should have to repeat.

   From the standing instructions: "do not hand routine clicks back to you or
   ask you to repeat settled rules", and about the palette, "it is fixed; stop
   reconsidering it". So the decisions live in the project once - Mrkt Mkrs 256,
   8px bodies, 4px detail, chains and eyes not forced onto a grid, skins and
   backgrounds out of cleanup.

   THE PAIR AT THE END IS THE WHOLE POINT. A rule that only shows on a settings
   screen is a settings screen; a rule reaches the control. Opening a trait on
   a ruled layer must arrive at the decision, and opening one on an EXEMPT layer
   must arrive at the measurement - because exempt means "this one is not on a
   grid", not "use 8 anyway". Either test alone passes a version that is wrong
   in the other direction.
*/
import { test, expect } from '@playwright/test';

/* Opens a trait drawn at 10px blocks on a named layer, the way the editor
   does: startEditor, then the measurement, then the panel catches up. */
const openOn = (page, layer) => page.evaluate(async (l) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  const S = 160, block = 10;
  const d = new Uint8ClampedArray(S * S * 4);
  const put = (x, y, v) => { const i = (y * S + x) * 4;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; };
  for (let by = 0; by < S / block; by++) for (let bx = 0; bx < S / block; bx++) {
    const v = 40 + ((bx + by) % 3) * 30;
    for (let y = by * block; y < (by + 1) * block; y++)
      for (let x = bx * block; x < (bx + 1) * block; x++) put(x, y, v);
  }
  fileName = 'probe.png';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 250));
  /* The layer is what the rules are keyed on, so it has to be set before the
     measurement lands - which is the order the real open path uses. */
  if (![...$('tlayer').options].some(o => o.value === l)) {
    const o = document.createElement('option'); o.value = l; o.textContent = l;
    $('tlayer').appendChild(o);
  }
  $('tlayer').value = l;
  adoptBlock(measuredBlock(d, S, S));
  await new Promise(r => setTimeout(r, 200));
  return { measured: gridBlock, chosen: $('blksize').value,
    offered: [...$('blksize').options].map(o => o.value) };
}, layer);

test.describe('the collection rules', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof PB === 'object' && PB && PB.rules);
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      activeWs = null;
      await dbClear();
      await renderShelf();
      await new Promise(r => setTimeout(r, 200));
    });
  });

  test('THE STANDING DECISIONS ARE THE DEFAULTS', async ({ page }) => {
    const r = await page.evaluate(() => PB.rules());
    expect(r.bodyGrid, '8x8 for suitable bodies').toBe(8);
    expect(r.detailGrid, '4x4 where 8x8 destroys detail').toBe(4);
    expect(r.gridExempt.sort(), 'chains and eyes are not forced onto a grid')
      .toEqual(['chains', 'eyes']);
    expect(r.cleanupExcluded.sort(), 'skins and backgrounds are left out for now')
      .toEqual(['backgrounds', 'skins']);
  });

  test('and the palette is all 256, with where it came from', async ({ page }) => {
    /* Baked in so the site needs no file and an agent needs no path. */
    const p = await page.evaluate(() => PB.palette());
    expect(p.hexes.length).toBe(256);
    expect(new Set(p.hexes).size, 'no repeats').toBe(256);
    expect(p.hexes.every(h => /^#[0-9a-f]{6}$/i.test(h))).toBe(true);
    expect(p.source.name).toContain('Mrkt Mkrs 256');
    expect(p.source.from, 'and the authority it was taken from')
      .toContain('mrkt-mkrs-resurrect-256.json');
    /* The hash is of the COLOURS, not of the file: two files in the workspace
       hold the same 256 in the same order under different metadata, and the
       two handoff documents cite different hashes for the same palette. */
    expect(p.source.colours).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a layer the rules speak about gets the body grid', async ({ page }) => {
    expect(await page.evaluate(() => PB.gridFor('hats'))).toBe(8);
    expect(await page.evaluate(() => PB.gridFor('clothing'))).toBe(8);
  });

  test('AND AN EXEMPT LAYER GETS NOTHING, WHICH IS NOT THE SAME AS 8',
    async ({ page }) => {
      /* Answering 8 here would force the grid the decision says to leave
         alone, and it would look exactly like a rule being applied. */
      expect(await page.evaluate(() => PB.gridFor('chains'))).toBe(0);
      expect(await page.evaluate(() => PB.gridFor('eyes'))).toBe(0);
      expect(await page.evaluate(() => PB.gridFor('')), 'and so does no layer')
        .toBe(0);
    });

  test('cleanup knows which layers it is not for', async ({ page }) => {
    const r = await page.evaluate(() => ({
      skins: PB.cleanupAllowed('skins'),
      backgrounds: PB.cleanupAllowed('backgrounds'),
      hats: PB.cleanupAllowed('hats'),
    }));
    expect(r.skins).toBe(false);
    expect(r.backgrounds).toBe(false);
    expect(r.hats).toBe(true);
  });

  test('a change is remembered across a reload', async ({ page }) => {
    /* Settled once. A rule that has to be re-entered is the thing this
       replaces. */
    await page.evaluate(() => PB.setRules({ bodyGrid: 4,
      perLayer: { hats: 8 }, gridExempt: ['chains'] }));
    await page.reload();
    await page.waitForFunction(() => typeof PB === 'object' && PB && PB.rules);
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await renderShelf();
      await new Promise(r => setTimeout(r, 250));
    });
    const r = await page.evaluate(() => ({ rules: PB.rules(),
      hats: PB.gridFor('hats'), clothing: PB.gridFor('clothing'),
      eyes: PB.gridFor('eyes') }));
    expect(r.rules.bodyGrid).toBe(4);
    expect(r.hats, 'the per-layer override').toBe(8);
    expect(r.clothing, 'and the new body grid everywhere else').toBe(4);
    expect(r.eyes, 'eyes came off the exempt list, so it takes the body grid')
      .toBe(4);
  });

  test('A RULED LAYER ARRIVES AT THE DECISION, NOT AT THE MEASUREMENT',
    async ({ page }) => {
      /* THE ONE THAT MAKES IT A RULE. The art is drawn at 10px blocks and the
         measurement is right about that; the collection has decided bodies are
         8, and that is what the control has to open on. */
      const r = await openOn(page, 'hats');
      expect(r.measured, 'the art really is 10px').toBe(10);
      expect(r.chosen, 'and the control opens on the rule').toBe('8');
    });

  test('AND AN EXEMPT ONE ARRIVES AT THE MEASUREMENT', async ({ page }) => {
    /* The other half. Exempt means the rules say nothing, and where they say
       nothing the measurement is the honest answer - a version that quietly
       used the body grid here would pass the test above and be wrong. */
    const r = await openOn(page, 'chains');
    expect(r.measured).toBe(10);
    expect(r.chosen, 'the art, because the rules are silent about chains')
      .toBe('10');
  });
});
