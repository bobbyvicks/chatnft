/* A PAGE THAT HOLDS ONLY THE TRAITS GOING INTO THE FINAL PROJECT.

   Asked for as: "right now its a whole mess of traits that are worked on and
   not worked on and its annoying. We have a STFP button but i want it to route
   to a page that will ONLY hold the traits that I want in the final project."

   stfp already existed as a status. What was missing was somewhere to stand and
   look at only those, and to put traits in and take them out without the shelf
   and its eight controls per tile.

   THE ONE THAT MATTERS MOST IS THE LAST. Adding or removing changes a trait's
   status, which changes its record id, and six things have to follow that - the
   record, the unsaved draft, the hidden key, the picked key, the group copy,
   and both keys again after an upload. The page must go through the function
   that knows all of it rather than carrying a second copy, and the way to prove
   that from outside is to leave an unsaved drawing on a trait and check it is
   still there after the page moves it.
*/
import { test, expect } from '@playwright/test';

/* A project in the state the request describes: some traits chosen, some not,
   and two layers with nothing chosen at all. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  const layers = ['backgrounds', 'skins', 'eyes', 'mouths', 'unsorted'];
  LAYERS = layers.slice();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: layers.slice(), hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const plan = {
    backgrounds: ['stfp', 'stfp', 'approved'],
    skins: ['stfp', 'approved'],
    eyes: ['wip', 'approved'],
    mouths: ['approved'],
    unsorted: ['wip'],
  };
  let n = 0;
  for (const layer of Object.keys(plan)) {
    let i = 0;
    for (const st of plan[layer]) {
      const nm = layer.slice(0, 3) + (++i);
      await dbPut({ id: 't_' + nm + '_' + layer + '_' + st, kind: 'trait', name: nm,
        layer, status: st, blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: n++ });
    }
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

const openFinal = (page) => page.evaluate(async () => {
  showPage('final', false);
  await new Promise(r => setTimeout(r, 350));
});

const shown = (page) => page.evaluate(() => ({
  hidden: $('finalset').hidden,
  sub: $('finalsub').textContent,
  warn: $('finalwarn').hidden ? null : $('finalwarn').textContent,
  heads: [...document.querySelectorAll('#finallayers .layer h3')].map(h => h.textContent),
  chosen: [...document.querySelectorAll('#finallayers .layer > .items .item')]
    .map(i => i.title).sort(),
  folds: [...document.querySelectorAll('#finallayers summary')].map(s => s.textContent),
}));

const traitIds = (page) => page.evaluate(async () =>
  (await dbAll()).filter(r => r.kind === 'trait').map(r => r.id).sort());

test.describe('the final project page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function');
    await seed(page);
    await openFinal(page);
  });

  test('IT HOLDS ONLY THE TRAITS THAT ARE IN THE FINAL SET', async ({ page }) => {
    const s = await shown(page);
    expect(s.hidden, 'the page is on screen').toBe(false);
    /* Three stfp traits in the seed, and nothing else. */
    expect(s.chosen).toEqual(['bac1', 'bac2', 'ski1']);
    expect(s.sub).toContain('3 traits');
  });

  test('and it counts each layer', async ({ page }) => {
    const s = await shown(page);
    expect(s.heads).toEqual([
      'backgrounds · 2 of 3',
      'skins · 1 of 2',
      'eyes · 0 of 2',
      'mouths · 0 of 1',
      'unsorted · 0 of 1',
    ]);
  });

  test('AND NAMES THE LAYERS WITH NOTHING IN THEM', async ({ page }) => {
    /* The reason the warning exists: a layer with no final trait means every
       character generated is missing that piece. */
    const s = await shown(page);
    expect(s.warn).toContain('eyes');
    expect(s.warn).toContain('mouths');
    expect(s.warn).toContain('every character would be missing that');
  });

  test('but not unsorted, which is where a trait waits rather than a problem',
    async ({ page }) => {
      /* The control on the warning. Unsorted holds traits nobody has filed, so
         "nothing final in unsorted" is the ordinary state of a finished project
         and calling it a problem would make the warning noise. */
      const s = await shown(page);
      expect(s.warn).not.toContain('unsorted');
    });

  test('THE ADD LIST IS BUILT WHEN IT IS OPENED, NOT BEFORE', async ({ page }) => {
    /* Each tile decodes a picture. At 324 traits, building every fold up front
       to show the twelve you picked is the whole cost of the page. */
    const out = await page.evaluate(async () => {
      const d = [...document.querySelectorAll('#finallayers details')]
        .find(x => x.querySelector('summary').textContent.includes('eyes'));
      const before = d.querySelectorAll('.item').length;
      d.open = true; d.dispatchEvent(new Event('toggle'));
      await new Promise(r => setTimeout(r, 250));
      return { before, after: d.querySelectorAll('.item').length,
        labels: [...d.querySelectorAll('.item button')].map(b => b.textContent) };
    });
    expect(out.before, 'nothing is drawn while it is shut').toBe(0);
    expect(out.after, 'and both of that layer are there once it is open').toBe(2);
    expect(out.labels).toEqual(['add', 'add']);
  });

  test('ADDING A TRAIT PUTS IT IN, AND IT IS STILL IN AFTER A RELOAD',
    async ({ page }) => {
      await page.evaluate(async () => {
        const d = [...document.querySelectorAll('#finallayers details')]
          .find(x => x.querySelector('summary').textContent.includes('mouths'));
        d.open = true; d.dispatchEvent(new Event('toggle'));
        await new Promise(r => setTimeout(r, 200));
        const realToast = window.toast; window.toast = () => {};
        d.querySelector('.item button').click();
        await new Promise(r => setTimeout(r, 900));
        window.toast = realToast;
      });
      expect(await traitIds(page)).toContain('t_mou1_mouths_stfp');
      /* Through a reload, because a page that only looks right until you leave
         it is not a page that holds anything. */
      await page.reload();
      await page.waitForFunction(() => typeof renderFinal === 'function');
      await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
      await openFinal(page);
      const s = await shown(page);
      expect(s.chosen).toContain('mou1');
      expect(s.warn, 'and mouths is no longer named as bare').not.toContain('mouths');
    });

  test('and taking one out sends it back to approved', async ({ page }) => {
    /* approved, not wip: it passed review, it is just not in the final cut. */
    await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      document.querySelector('#finallayers .layer > .items .item button').click();
      await new Promise(r => setTimeout(r, 900));
      window.toast = realToast;
    });
    const ids = await traitIds(page);
    expect(ids).toContain('t_bac1_backgrounds_approved');
    expect(ids).not.toContain('t_bac1_backgrounds_stfp');
    expect(ids).not.toContain('t_bac1_backgrounds_wip');
  });

  test('AN UNSAVED DRAWING SURVIVES BEING ADDED TO THE FINAL SET',
    async ({ page }) => {
      /* THE ONE THAT PROVES THE PAGE GOES THROUGH setTraitStatus. Adding is an
         id change, and the draft is keyed by id - so a page with its own copy of
         dbDel-and-dbPut would leave the drawing under a key nothing asks for,
         exactly as the shelf chip did before 463. Asserted through what OPENING
         the trait gives you, not through a key: a draft re-keyed and then
         rejected as stale would pass a key check and still lose the work. */
      await page.evaluate(async () => {
        const rec = (await dbAll()).find(r => r.id === 't_mou1_mouths_approved');
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const g = c.getContext('2d');
        g.fillStyle = 'rgb(20,20,20)'; g.fillRect(0, 0, 16, 16);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        await dbPut({ id: 'autosave.' + rec.id, kind: 'autosave', traitId: rec.id,
          name: 'mou1.png', w: 16, h: 16, blob, at: 9999 });
      });
      await page.evaluate(async () => {
        const d = [...document.querySelectorAll('#finallayers details')]
          .find(x => x.querySelector('summary').textContent.includes('mouths'));
        d.open = true; d.dispatchEvent(new Event('toggle'));
        await new Promise(r => setTimeout(r, 200));
        const realToast = window.toast; window.toast = () => {};
        d.querySelector('.item button').click();
        await new Promise(r => setTimeout(r, 900));
        window.toast = realToast;
      });
      const corner = await page.evaluate(async () => {
        const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === 'mou1');
        const realToast = window.toast; window.toast = () => {};
        try { await openTraitRecord(rec); } finally { window.toast = realToast; }
        await new Promise(r => setTimeout(r, 200));
        return ctx.getImageData(0, 0, 1, 1).data[0];
      });
      expect(corner, 'the unsaved drawing came back, not the saved trait').toBe(20);
    });

  test('and the Project tab stays lit while you are in here - the control',
    async ({ page }) => {
      /* Final is a room inside the project, the way settings is. A tab bar
         showing nothing selected would say you had left. */
      const lit = await page.evaluate(() =>
        [...document.querySelectorAll('.pgtab')]
          .filter(b => b.getAttribute('aria-current') === 'page')
          .map(b => b.dataset.page));
      expect(lit).toEqual(['project']);
    });
});
