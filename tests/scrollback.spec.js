/* BACK WHERE YOU WERE WHEN YOU OPENED THE TRAIT.

   "when i click into a trait and close out i want to be back where i was when
   i clicked into the trait insead of always back at the top of the screen"

   MEASURED. 60 traits on the project page, scrolled to 1400 of 3846:

     scrolled to      1400, looking at s3
     opened a trait   scrollY 0
     closed it        scrollY 0, nothing under the middle of the screen
     page height      3846, the same as before

   The position is not lost, it is thrown away. #land is hidden with the
   hidden attribute, which collapses the document and takes the offset with
   it; nothing wrote it down. On a shelf of 318 traits that is the whole shelf
   to scroll again, once per trait.

   THE CONTROLS. A version that scrolled somewhere on every close would pass
   the first test and jump a page that was never scrolled; a version that
   recorded the position on every startEditor would pass it too and lose the
   real one the moment a second trait is opened from inside the editor. Both
   are here.
*/
import { test, expect } from '@playwright/test';

const seed = (page, n, status) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 32, 32);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (let i = 0; i < o.count; i++)
    await dbPut({ id: 't_s' + i + '_skins_' + o.status, kind: 'trait', name: 's' + i,
      layer: 'skins', status: o.status, blob, w: 32, h: 32, rarity: 1,
      at: i + 1, shelfOrder: (i + 1) * 1024 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 400));
}, { count: n || 60, status: status || 'approved' });

const onProject = (page) => page.evaluate(async () => {
  showPage('project', false);
  await new Promise(r => setTimeout(r, 500));
  return Math.round(document.documentElement.scrollHeight);
});

/* Opens the named trait by pressing its tile, waits for the editor, closes it
   the way the Close button does. */
const openAndClose = (page, name) => page.evaluate(async (nm) => {
  const tile = [...document.querySelectorAll('#projbody .item')]
    .find(el => el.title === nm);
  if (!tile) throw new Error('no tile for ' + nm);
  tile.click();
  await new Promise(r => setTimeout(r, 900));
  const opened = !document.getElementById('app').hidden;
  await closeEditor();
  await new Promise(r => setTimeout(r, 600));
  return { opened, y: Math.round(window.scrollY) };
}, name);

test.describe('coming back from the editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
  });

  test('IT PUTS THE PAGE BACK WHERE IT WAS', async ({ page }) => {
    const tall = await onProject(page);
    /* The shelf has to be taller than the screen or there is nothing to
       restore and the test would pass on the broken version. */
    expect(tall, 'the shelf is long enough to have a position').toBeGreaterThan(2000);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(150);
    const r = await openAndClose(page, 's30');
    expect(r.opened, 'the editor really opened').toBe(true);
    expect(r.y, 'and the page came back to where it was').toBe(1400);
  });

  test('AND THE TRAIT YOU WERE LOOKING AT IS ON SCREEN AGAIN', async ({ page }) => {
    /* The number is the mechanism; this is the thing somebody sees. A restore
       that is right to the pixel and wrong about what is under it would be a
       coincidence rather than a fix. */
    await onProject(page);
    const was = await page.evaluate(async () => {
      window.scrollTo(0, 1400);
      await new Promise(r => setTimeout(r, 150));
      const el = document.elementFromPoint(
        Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      const card = el && el.closest ? el.closest('.item') : null;
      return card ? card.title : null;
    });
    expect(was, 'something is under the middle of the screen to begin with').toBeTruthy();
    await openAndClose(page, 's30');
    const now = await page.evaluate(() => {
      const el = document.elementFromPoint(
        Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      const card = el && el.closest ? el.closest('.item') : null;
      return card ? card.title : null;
    });
    expect(now, 'the same trait is back under the middle of the screen').toBe(was);
  });

  test('and a page that was never scrolled does not move - the control',
    async ({ page }) => {
      /* A version that scrolled somewhere on every close would pass the test
         above and jump the page for everybody who opened a trait from the
         top of the shelf, which is where most traits are opened from. */
      await onProject(page);
      const r = await openAndClose(page, 's1');
      expect(r.y).toBe(0);
    });

  test('AND A SECOND TRAIT OPENED FROM INSIDE THE EDITOR KEEPS THE REAL ONE',
    async ({ page }) => {
      /* The page is hidden while the editor is up, so window.scrollY is 0.
         Recording it on every startEditor would write that 0 over the real
         position on the way past, and this is the only route that does it. */
      await onProject(page);
      await page.evaluate(() => window.scrollTo(0, 1400));
      await page.waitForTimeout(150);
      const y = await page.evaluate(async () => {
        const tile = [...document.querySelectorAll('#projbody .item')]
          .find(el => el.title === 's30');
        tile.click();
        await new Promise(r => setTimeout(r, 900));
        /* A second trait, from inside the editor - what the Last edited list
           and the plan panel both do. */
        const other = (await dbAll()).find(i => i.id === 't_s41_skins_approved');
        await openTraitRecord(other);
        await new Promise(r => setTimeout(r, 700));
        await closeEditor();
        await new Promise(r => setTimeout(r, 600));
        return Math.round(window.scrollY);
      });
      expect(y, 'the position from before the FIRST trait').toBe(1400);
    });

  test('and it does not carry a position onto another page - the control',
    async ({ page }) => {
      /* 1400 belongs to the shelf. A hashchange while the editor is up - a
         Back press - lands the close on a different page, where that number
         is a jump to nowhere rather than a restore.

         THE DESTINATION HAS TO BE TALL ENOUGH TO REACH 1400, and the first
         version of this test was not: it switched to the agent page, which is
         one screen high, so the browser clamped the restore to 0 and the test
         passed whether the guard was there or not. Removing the guard did not
         make it fail, which is how it was caught. The final project page with
         sixty traits in it really does scroll, so the two answers differ. */
      /* Seeded into the final set, so the page the close lands on has sixty
         traits in it and really is taller than the screen. */
      await seed(page, 60, 'stfp');
      await onProject(page);
      await page.evaluate(() => window.scrollTo(0, 1400));
      await page.waitForTimeout(150);
      const r = await page.evaluate(async () => {
        const tile = [...document.querySelectorAll('#projbody .item')]
          .find(el => el.title === 's30');
        tile.click();
        await new Promise(x => setTimeout(x, 900));
        showPage('final', false);
        await new Promise(x => setTimeout(x, 900));
        await closeEditor();
        await new Promise(x => setTimeout(x, 600));
        /* MEASURED AFTER THE CLOSE, not before it. While the editor is up
           #land is hidden and has no layout, so the document is exactly one
           viewport tall whatever page it is set to - and the first version of
           this read that 900 and concluded the destination could not scroll,
           which is the same blindness it was written to remove. */
        return { tall: Math.round(document.documentElement.scrollHeight),
          y: Math.round(window.scrollY),
          view: window.innerHeight, page: document.getElementById('land').getAttribute('data-page') };
      });
      expect(r.page, 'the close really landed on the other page').toBe('final');
      expect(r.tall - r.view, 'which really can scroll past 1400').toBeGreaterThan(1400);
      expect(r.y, 'and the shelf position was not applied to it').toBe(0);
    });

  test('IT IS BACK BEFORE THE SHELF REDRAWS, so the page does not jump',
    async ({ page }) => {
      /* Hiding an element with the hidden attribute keeps its content, so the
         page is its full height the instant it returns and the offset can go
         straight back. Restoring after the render instead would be visible:
         the page arrives at the top and then moves.

         Measured with the redraw made slow on purpose - if the restore waited
         for it, this reads 0. */
      await onProject(page);
      await page.evaluate(() => window.scrollTo(0, 1400));
      await page.waitForTimeout(150);
      const early = await page.evaluate(async () => {
        const tile = [...document.querySelectorAll('#projbody .item')]
          .find(el => el.title === 's30');
        tile.click();
        await new Promise(r => setTimeout(r, 900));
        const real = window.renderShelf;
        window.renderShelf = async (...a) => {
          await new Promise(r => setTimeout(r, 700));
          return real.apply(null, a);
        };
        try {
          closeEditor();
          await new Promise(r => setTimeout(r, 100));
          return Math.round(window.scrollY);
        } finally {
          await new Promise(r => setTimeout(r, 900));
          window.renderShelf = real;
        }
      });
      expect(early, 'already back, 600ms before the shelf finishes').toBe(1400);
    });
});

test.describe('a column that scrolls inside itself', () => {
  test('COMES BACK ON ITS OWN - which is why there is no code for it',
    async ({ page }) => {
      /* THIS TEST EXISTS BECAUSE I WROTE THE CODE FIRST. The Trait Factory is
         three columns with overflow:auto and a trait can be opened from the
         Last edited list in one of them, so the fix remembered every scrolled
         element inside #land as well as the window. Then the measurement:

           a column    81 -> hidden reports 0 -> shown again 81
           the window  900 -> 0 -> 0

         The browser puts an inner scrollTop back by itself. Only the document
         scroll goes, because collapsing the document is what clamps it. The
         loop was dead code with a confident comment on it, and the mutation
         that deleted it killed nothing - which is how it was found.

         What is left is the fact, kept so that the next person to notice the
         columns does not add the loop back: the column returns, and the window
         on that page never moved at all. */
      await page.setViewportSize({ width: 1280, height: 620 });
      await page.goto('/index.html');
      await page.waitForFunction(() => typeof renderShelf === 'function');
      await seed(page, 40);
      const r = await page.evaluate(async () => {
        showPage('home', false);
        await new Promise(x => setTimeout(x, 700));
        const land = document.getElementById('land');
        const col = [...land.children]
          .find(el => el.scrollHeight > el.clientHeight + 8);
        if (!col) return { none: true };
        col.scrollTop = col.scrollHeight;
        await new Promise(x => setTimeout(x, 100));
        const before = Math.round(col.scrollTop);
        const t = (await dbAll()).find(i => i.id === 't_s20_skins_approved');
        await openTraitRecord(t);
        await new Promise(x => setTimeout(x, 700));
        await closeEditor();
        await new Promise(x => setTimeout(x, 700));
        return { none: false, which: col.id || String(col.className).split(' ')[0],
          before, after: Math.round(col.scrollTop),
          windowY: Math.round(window.scrollY) };
      });
      /* NOT VACUOUS: if nothing on that page can scroll, this establishes
         nothing and says so rather than passing. */
      expect(r.none, 'a column on this page really does scroll').toBe(false);
      expect(r.before, 'and there is a real distance to lose').toBeGreaterThan(20);
      expect(r.after, 'and it is back at the same place afterwards').toBe(r.before);
      expect(r.windowY, 'while the window itself never scrolled on this page').toBe(0);
    });
});
