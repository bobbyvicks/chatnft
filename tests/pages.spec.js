/* One page became three.

   Everything lived in a single scroll of #land, and it had become far too much
   of it. MEASURED on the real collection before the split: Plan rarity alone
   was 8,312 pixels tall and sat between the layer list and the traits, so the
   shelf began 10,806 pixels down a page whose first screen is the extractor.

     main page        the extractor, the drop zone, folder import, sort
     project          Build a character, and the traits
     project settings the layer list, and Plan rarity

   NOTHING MOVED AND NOTHING WENT. Every section is still in its original place
   in the document, with its own id and its own hidden logic; a page is a class
   on the element and an attribute on #land, and the CSS hides what is not on
   the current one. That is the claim the first test here pins, because the
   obvious alternative - relocating 240 lines of markup - is what a later
   reader would assume happened and would be tempted to "tidy" into.
*/
import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers.js';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (const n of ['a', 'b', 'c'])
    await dbPut({ id: 't_' + n + '_eyes_approved', kind: 'trait', name: n,
      layer: 'eyes', status: 'approved', blob, w: 8, h: 8, at: 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
});

/* What is actually on screen, by height rather than by class - a rule that
   fails to apply is exactly the failure worth catching, and reading back the
   class it was supposed to apply would never see it. */
const onScreen = (page) => page.evaluate(() => {
  const tall = id => {
    const e = document.getElementById(id);
    return !!e && e.getBoundingClientRect().height > 0;
  };
  return {
    page: document.getElementById('land').getAttribute('data-page'),
    extract: document.querySelector('.extract').getBoundingClientRect().height > 0,
    drop: document.getElementById('drop').getBoundingClientRect().height > 0,
    compose: tall('compose'), proj: tall('proj'),
    layers: tall('layers'), plan: tall('plan'),
    landHeight: Math.round(document.getElementById('land').getBoundingClientRect().height),
  };
});

test.describe('the app is three pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof showPage === 'function');
    await seed(page);
  });

  test('the main page holds the extractor and nothing from the project',
    async ({ page }) => {
      await gotoPage(page, 'home');
      const r = await onScreen(page);
      expect(r.extract, 'pull a trait off a character').toBe(true);
      expect(r.drop, 'and the drop zone').toBe(true);
      expect(r.compose, 'the generator is not here').toBe(false);
      expect(r.proj, 'nor the traits').toBe(false);
      expect(r.layers).toBe(false);
      expect(r.plan).toBe(false);
    });

  test('the project page holds the generator and the traits', async ({ page }) => {
    await gotoPage(page, 'project');
    const r = await onScreen(page);
    expect(r.compose).toBe(true);
    expect(r.proj).toBe(true);
    expect(r.extract, 'the extractor is on the main page').toBe(false);
    expect(r.plan, 'and rarity is in settings').toBe(false);
  });

  test('and project settings holds the layers and the rarity plan',
    async ({ page }) => {
      await gotoPage(page, 'settings');
      const r = await onScreen(page);
      expect(r.layers).toBe(true);
      expect(r.plan).toBe(true);
      expect(r.proj, 'the traits are on the project page').toBe(false);
      expect(r.extract).toBe(false);
    });

  test('nothing moved in the document, which is how this was done',
    async ({ page }) => {
      /* THE CLAIM THE WHOLE APPROACH RESTS ON. Every section is where it
         always was, so every handler, every id and every piece of hidden
         logic still finds it. A later reader who assumes the markup was
         reorganised - and tidies accordingly - breaks this. */
      const r = await page.evaluate(() => {
        const ids = ['cloud', 'compose', 'layers', 'plan', 'proj'];
        const at = ids.map(i => {
          const e = document.getElementById(i);
          return e ? [...document.querySelectorAll('#land *')].indexOf(e) : -1;
        });
        return { at: at, sorted: at.slice().sort((x, y) => x - y),
          inLand: ids.every(i => document.getElementById('land')
            .contains(document.getElementById(i))) };
      });
      expect(r.inLand, 'all still inside the landing page').toBe(true);
      expect(r.at, 'and still in their original order').toEqual(r.sorted);
    });

  test('a section that has nothing to show stays hidden on its own page',
    async ({ page }) => {
      /* The page rules only ever ADD display:none. If one had set display
         back, a section would appear on its page even when it has said it has
         nothing in it - which is exactly what the hidden attribute is for. */
      await page.evaluate(async () => { await dbClear(); await renderShelf(); });
      await page.waitForTimeout(250);
      await gotoPage(page, 'project');
      const r = await page.evaluate(() => ({
        projHidden: document.getElementById('proj').hidden,
        projTall: document.getElementById('proj').getBoundingClientRect().height > 0,
      }));
      expect(r.projHidden, 'an empty project says so itself').toBe(true);
      expect(r.projTall, 'and the page rule did not override it').toBe(false);
    });

  test('the page is in the address, so back and a refresh both work',
    async ({ page }) => {
      await gotoPage(page, 'settings');
      expect(page.url()).toContain('#/settings');
      await page.reload();
      await page.waitForFunction(() => typeof showPage === 'function');
      expect(await page.evaluate(() =>
        document.getElementById('land').getAttribute('data-page')),
      'a refresh stays where you were').toBe('settings');
      await page.goBack();
      await page.waitForTimeout(150);
      expect(await page.evaluate(() =>
        document.getElementById('land').getAttribute('data-page')),
      'and back goes back').not.toBe('settings');
    });

  test('an address nobody recognises lands on the main page', async ({ page }) => {
    // A stale link should arrive somewhere useful rather than on nothing.
    await page.goto('/index.html#/nonsense');
    await page.waitForFunction(() => typeof showPage === 'function');
    await seed(page);
    const r = await onScreen(page);
    expect(r.page).toBe('home');
    expect(r.extract).toBe(true);
  });

  test('the tab says which page you are on, in the state a reader gets',
    async ({ page }) => {
      /* aria-current is the state and the highlight is styled from it, so the
         two cannot drift. Asserted on the attribute for that reason. */
      await gotoPage(page, 'project');
      const r = await page.evaluate(() => [...document.querySelectorAll('.pgtab')]
        .map(b => [b.dataset.page, b.getAttribute('aria-current')]));
      expect(r).toEqual([['home', null], ['project', 'page'], ['settings', null]]);
    });

  test('choosing a project goes to the project page', async ({ page }) => {
    /* "Click into projects and it opens into the project" - so the dropdown
       navigates rather than leaving somebody on the main page wondering
       whether anything happened. */
    await gotoPage(page, 'home');
    await page.evaluate(() => {
      /* The switch itself talks to the server and is somebody else's test;
         what is pinned here is that choosing one moves the page. */
      window.wsSwitch = async () => {};
      const s = $('wssel');
      s.innerHTML = '<option value="">My page</option><option value="t1">A group</option>';
      s.value = 't1';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() =>
      document.getElementById('land').getAttribute('data-page'))).toBe('project');
  });
});
