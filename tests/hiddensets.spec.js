/* Turning a whole trait set off, so nothing in it is drawn.

   "give people the possibilty to hide whole trait sets". A trait set is a
   LAYER, which is how the app already groups traits and how the owner already
   talks about them.

   This is NOT the per-trait hide that already existed on the shelf. That one is
   about what is on your screen: session-only and forgotten on reload. This is
   about what the collection contains, so it persists - if it reset, the next
   Generate set would quietly mint the set that was turned off.

   The control test is the one that matters. "No hats were drawn" is also what
   you get from a set that never drew hats. Measured on this fixture: with the
   set on, 335 of 500 draws carry a hat; with it off, 0 of 500.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  await dbClear();
  const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('crown', 'hair-headwear');
  await put('cap', 'hair-headwear');
  await put('tan', 'skins');
  await put('pale', 'skins');
  await renderShelf();
});

/* Clicks the switch on a named layer's heading, the way a person does. */
const toggle = (page, layer) => page.evaluate(async (l) => {
  const wrap = [...document.querySelectorAll('.layer')]
    .find(w => w.querySelector('h3').textContent.indexOf(l) === 0);
  if (!wrap) throw new Error('no heading for ' + l);
  await wrap.querySelector('.setbtn').onclick();
}, layer);

const state = (page, layer) => page.evaluate((l) => {
  const wrap = [...document.querySelectorAll('.layer')]
    .find(w => w.querySelector('h3').textContent.indexOf(l) === 0);
  return {
    hidden: [...HIDDEN_LAYERS],
    composeRows: [...document.querySelectorAll('#crows select')].map(s => s.dataset.layer),
    cardsOnScreen: wrap ? wrap.querySelectorAll('.item').length : 0,
    dimmed: wrap ? wrap.classList.contains('off') : null,
    badge: wrap ? !!wrap.querySelector('.setoff') : null,
    label: wrap ? wrap.querySelector('.setbtn').textContent : null,
    possible: comboStats(cItems, false).distinct,
  };
}, layer);

/* How often a draw carries anything from a layer, over N draws. */
const drawsFrom = (page, layer, n) => page.evaluate(([l, N]) => {
  const pools = cPools();
  let seen = 0;
  for (let i = 0; i < N; i++) if (randomCombo(pools).some(t => t.layer === l)) seen++;
  return seen;
}, [layer, n]);

test.describe('turning a trait set off', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
    await page.waitForTimeout(500);
  });

  test('the control: while the set is on, it is drawn from', async ({ page }) => {
    // Without this, every "0 draws" below would also pass on a fixture where
    // the layer never drew anything to begin with.
    const n = await drawsFrom(page, 'hair-headwear', 500);
    expect(n, 'hats turn up on their own').toBeGreaterThan(100);
  });

  test('turning it off stops it being drawn, and says so', async ({ page }) => {
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const s = await state(page, 'hair-headwear');
    expect(s.hidden, 'the set is recorded as off').toEqual(['hair-headwear']);
    expect(s.composeRows, 'and has no compose row').not.toContain('hair-headwear');
    expect(await drawsFrom(page, 'hair-headwear', 500), 'nothing in it is drawn').toBe(0);
    expect(s.badge, 'the heading says off').toBe(true);
    expect(s.label, 'and offers the way back').toBe('turn on');
  });

  test('the traits stay on screen, dimmed, not deleted', async ({ page }) => {
    // A tool whose output is a minted collection must not make a whole set of
    // the owner's work vanish from the place they edit it.
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const s = await state(page, 'hair-headwear');
    expect(s.cardsOnScreen, 'both traits are still there').toBe(2);
    expect(s.dimmed, 'and shown as off rather than removed').toBe(true);
  });

  test('the count of possible characters follows', async ({ page }) => {
    // Otherwise the panel promises characters the generator will not make.
    const before = (await state(page, 'skins')).possible;
    expect(before, '2 skins x (2 hats + empty)').toBe(6);
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const after = (await state(page, 'skins')).possible;
    expect(after, 'only the two skins remain').toBe(2);
  });

  test('a trait in an off set says why it has no share', async ({ page }) => {
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const t = cItems.find(i => i.name === 'crown');
      const c = traitChance(t, cItems, false);
      return { pct: c.pct, why: c.why };
    });
    expect(r.pct, 'no figure, because it is not drawn').toBe(null);
    expect(r.why, 'and the reason is the set, not the trait').toContain('turned off');
  });

  test('it survives a reload, because it is about the collection', async ({ page }) => {
    // The per-trait hide is deliberately session-only. This is not: if it reset,
    // the next Generate set would mint the set that was turned off.
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const stored = await page.evaluate(async () => {
      const rec = (await dbAll()).find(i => i.id === 'settings.layers');
      return rec ? rec.hidden : null;
    });
    expect(stored, 'written with the layers').toEqual(['hair-headwear']);

    await page.reload();
    await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
    await page.waitForTimeout(600);
    await page.evaluate(() => renderShelf());
    await page.waitForTimeout(400);
    const s = await state(page, 'hair-headwear');
    expect(s.hidden, 'still off after a reload').toEqual(['hair-headwear']);
    expect(s.composeRows).not.toContain('hair-headwear');
  });

  test('and turning it back on restores it', async ({ page }) => {
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const s = await state(page, 'hair-headwear');
    expect(s.hidden).toEqual([]);
    expect(s.composeRows, 'the row is back').toContain('hair-headwear');
    expect(await drawsFrom(page, 'hair-headwear', 500), 'and so are the hats').toBeGreaterThan(100);
  });

  test('there is a way back that does not need the heading', async ({ page }) => {
    // A search that filters every card out of an off layer leaves no heading to
    // click, so the count beside Show hidden turns every set back on.
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => {
      const b = $('shelfsets');
      return { hidden: b.hidden, text: b.textContent };
    });
    expect(before.hidden, 'it appears once something is off').toBe(false);
    expect(before.text).toContain('(1)');

    await page.evaluate(async () => { await $('shelfsets').onclick(); });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      hidden: [...HIDDEN_LAYERS],
      buttonHidden: $('shelfsets').hidden,
    }));
    expect(after.hidden, 'everything is on again').toEqual([]);
    expect(after.buttonHidden, 'and the button takes itself away').toBe(true);
  });

  test('the switch does not inherit the heading uppercasing', async ({ page }) => {
    // .layer h3 is text-transform:uppercase with letter-spacing, and a button
    // inherits both - so without the resets it renders as "T U R N   O F F".
    // A textContent assertion cannot see that, so this compares computed style
    // against the parent, which is what actually decides how it looks.
    const r = await page.evaluate(() => {
      const b = document.querySelector('.layer h3 .setbtn');
      const h = b.closest('h3');
      const bs = getComputedStyle(b), hs = getComputedStyle(h);
      return { btnTransform: bs.textTransform, headTransform: hs.textTransform,
               btnSpacing: bs.letterSpacing, headSpacing: hs.letterSpacing };
    });
    // The control: the heading really does set both, so the reset is load-bearing.
    expect(r.headTransform, 'the heading uppercases').toBe('uppercase');
    expect(r.headSpacing, 'and tracks out').not.toBe('normal');
    expect(r.btnTransform, 'the button does not').toBe('none');
    expect(r.btnSpacing, 'nor does it track out').toBe('normal');
  });

  test('renaming a layer carries the setting with it', async ({ page }) => {
    // The setting is keyed by NAME, so a rename that did not move it would turn
    // the set back on under its new name with nothing saying so.
    await toggle(page, 'hair-headwear');
    await page.waitForTimeout(500);
    const r = await page.evaluate(async () => {
      await renameLayer('hair-headwear', 'headwear');
      await new Promise(res => setTimeout(res, 300));
      return { hidden: [...HIDDEN_LAYERS], layers: LAYERS.indexOf('headwear') >= 0 };
    });
    expect(r.layers, 'the layer was renamed').toBe(true);
    expect(r.hidden, 'and it is still off, under the new name').toEqual(['headwear']);
  });
});
