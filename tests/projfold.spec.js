/* Folding the trait organiser away.

   It is the tallest thing on the page - 272 tiles, and the shelf measured
   10,522px with the collection loaded - and Build a character and the layer
   list sit above it now, so everything below is further down than anybody
   scrolls.

   THE WAY THIS FEATURE GOES WRONG is not that folding fails. It is that a
   folded shelf looks like an empty project: the tiles are gone, and if the
   count goes with them there is nothing on screen to say the work is still
   there. That failure is silent, because somebody who believes their traits
   have vanished does not report it as a folding bug - so the count staying
   visible has its own test rather than being left to the eye. */
import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers.js';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  try { localStorage.removeItem('chatnft.projfold'); } catch (_) {}
  const blob = new Blob([new Uint8Array([0])]);
  for (let i = 0; i < 5; i++)
    await dbPut({ id: 't_h' + i + '_hats_approved', kind: 'trait', name: 'hat' + i,
      layer: 'hats', status: 'approved', blob, w: 160, h: 160, rarity: 1, at: i + 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
});

const look = (page) => page.evaluate(() => {
  const vis = el => !!el && el.getBoundingClientRect().height > 0;
  const b = $('projfold');
  return {
    folded: $('proj').classList.contains('folded'),
    expanded: b.getAttribute('aria-expanded'),
    title: b.title,
    bodyVisible: vis(document.getElementById('projbody')),
    tiles: document.querySelectorAll('.item').length,
    countVisible: vis(document.getElementById('projcount')),
    countText: document.getElementById('projcount').textContent,
    mailVisible: !document.getElementById('mailnote').hidden,
    actsVisible: vis(document.querySelector('#proj .acts')),
    projHeight: Math.round(document.getElementById('proj').getBoundingClientRect().height),
  };
});

test.describe('folding the trait organiser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof projFold === 'function');
    await seed(page);
    /* The shelf lives on the project page now. */
    await gotoPage(page, 'project');
  });

  test('opens with the traits showing, and the control says so', async ({ page }) => {
    const r = await look(page);
    expect(r.folded, 'not folded to begin with').toBe(false);
    expect(r.bodyVisible, 'the tiles are on screen').toBe(true);
    expect(r.expanded, 'and the control agrees').toBe('true');
  });

  test('pressing it puts the traits away', async ({ page }) => {
    const before = await look(page);
    await page.click('#projfold');
    const after = await look(page);
    expect(after.bodyVisible, 'the tiles went').toBe(false);
    expect(after.expanded).toBe('false');
    expect(after.projHeight, 'and the panel is much shorter')
      .toBeLessThan(before.projHeight / 2);
  });

  test('and pressing it again brings them back', async ({ page }) => {
    await page.click('#projfold');
    await page.click('#projfold');
    const r = await look(page);
    expect(r.bodyVisible, 'the tiles are back').toBe(true);
    expect(r.tiles, 'all of them').toBe(5);
  });

  test('a folded shelf still says how much is in it', async ({ page }) => {
    /* THE ONE THAT MATTERS. Hiding the count along with the tiles turns a
       folded shelf into an empty project, and nobody reports that as a
       folding bug - they report their traits being gone, if they report it
       at all. */
    await page.click('#projfold');
    const r = await look(page);
    expect(r.countVisible, 'the count is still on screen').toBe(true);
    expect(r.countText, 'and still names the traits').toContain('5');
    expect(r.actsVisible, 'and the buttons are still reachable').toBe(true);
  });

  test('and the traits are still there, not thrown away', async ({ page }) => {
    /* Folded is a class, not a delete. If renderShelf stopped filling the body
       while folded, unfolding would be slow and the scroll position lost - and
       a test that only looked at what is VISIBLE could not tell the two
       apart. */
    await page.click('#projfold');
    const r = await page.evaluate(async () => ({
      tiles: document.querySelectorAll('.item').length,
      stored: (await dbAll()).filter(i => i.kind === 'trait').length,
    }));
    expect(r.tiles, 'the tiles are built, just not shown').toBe(5);
    expect(r.stored, 'and nothing left the database').toBe(5);
  });

  test('the choice survives a reload', async ({ page }) => {
    await page.click('#projfold');
    await page.reload();
    await page.waitForFunction(() => typeof projFold === 'function');
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      await renderShelf();
      return { folded: document.getElementById('proj').classList.contains('folded'),
        expanded: document.getElementById('projfold').getAttribute('aria-expanded') };
    });
    expect(r.folded, 'still folded on the way back').toBe(true);
    expect(r.expanded).toBe('false');
  });

  test('and restoring it is not the same as choosing it', async ({ page }) => {
    /* THE CONTROL on the line above. projFold(want,false) restores without
       writing back, so a default can stay a default. Without the false a
       restore would stamp the choice as though it had been made, and the
       difference is invisible until something wants to change the default. */
    const r = await page.evaluate(async () => {
      try { localStorage.removeItem('chatnft.projfold'); } catch (_) {}
      projFold(true, false);
      const afterRestore = localStorage.getItem('chatnft.projfold');
      projFold(true);
      return { afterRestore, afterChoice: localStorage.getItem('chatnft.projfold') };
    });
    expect(r.afterRestore, 'restoring wrote nothing').toBeNull();
    expect(r.afterChoice, 'choosing did').toBe('1');
  });

  test('and it can be worked without a mouse', async ({ page }) => {
    /* A button, so this comes free - which is the reason it is a button and
       not an h2 with a click handler. Asserted because "comes free" is a claim
       about markup that nothing else checks. */
    await page.focus('#projfold');
    await page.keyboard.press('Enter');
    expect((await look(page)).folded, 'Enter folded it').toBe(true);
    await page.keyboard.press('Space');
    expect((await look(page)).folded, 'Space opened it').toBe(false);
  });
});
