/* The last ten things you edited, on the main page.

   The main page is the extractor, and once a collection exists that is not
   what anybody opens the app for. It used to end with three cards explaining
   what the app does - Measures, Recovers, Edits - to a person who has clearly
   worked that out. This is the space they were using.

   FROM THE LOCAL RECORD, NOT THE SERVER, and that is the whole reason it can
   sit on the front page. Every trait carries `at`, written by every save, and
   renderShelf has already read the records - so this costs one sort, works on
   your own page, works offline, and works before anything has been pushed. The
   What changed panel in project settings answers a different question, needs
   the network, and says "could not reach the group" when it cannot.

   THE ORDERING TEST IS THE ONE THAT MATTERS. A list of ten that is not the
   most recent ten is worse than no list: it looks like an answer.
*/
import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers.js';

const HOUR = 3600e3;

/* Traits with timestamps chosen so newest-first is not the insertion order,
   the alphabetical order, or the reverse of either - so a sort that is not
   really sorting cannot pass by luck. */
const seed = (page, specs) => page.evaluate(async (list) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (const s of list) {
    const rec = { id: (s.kind === 'ref' ? 'ref_' : 't_' + s.name + '_' + (s.layer || 'eyes') + '_approved'),
      kind: s.kind || 'trait', name: s.name, layer: s.layer || 'eyes',
      status: 'approved', blob, w: 8, h: 8 };
    if (s.kind === 'ref') rec.id = 'ref_' + s.name;
    if (s.at !== undefined) rec.at = s.at;
    await dbPut(rec);
  }
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'hats', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
}, specs);

const panel = (page) => page.evaluate(() => ({
  hidden: document.getElementById('recent').hidden,
  shown: document.getElementById('recent').getBoundingClientRect().height > 0,
  count: document.getElementById('recentcount').textContent,
  names: [...document.querySelectorAll('#recentbody .rrow .rname')].map(e => e.textContent),
  layers: [...document.querySelectorAll('#recentbody .rrow .rlayer')].map(e => e.textContent),
  whens: [...document.querySelectorAll('#recentbody .rrow .rwhen')].map(e => e.textContent),
}));

const now = Date.now();
/* Twelve, so the cap has something to cut, with deliberately jumbled times. */
const TWELVE = [
  { name: 'a-old', at: now - 200 * HOUR },
  { name: 'b-newest', at: now - 1 * HOUR },
  { name: 'c-mid', at: now - 50 * HOUR },
  { name: 'd-second', at: now - 2 * HOUR },
  { name: 'e', at: now - 60 * HOUR },
  { name: 'f', at: now - 70 * HOUR },
  { name: 'g', at: now - 80 * HOUR },
  { name: 'h', at: now - 90 * HOUR },
  { name: 'i', at: now - 100 * HOUR },
  { name: 'j', at: now - 110 * HOUR },
  { name: 'k', at: now - 120 * HOUR },
  { name: 'l-oldest', at: now - 300 * HOUR },
];

test.describe('the last edited list', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderRecent === 'function');
  });

  test('is the ten most recent, newest first', async ({ page }) => {
    /* THE ONE THAT MATTERS. Ten rows that are not the most recent ten look
       exactly like an answer. The two oldest are the ones that must fall off,
       and they are not the two added last or the two last alphabetically. */
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    const r = await panel(page);
    expect(r.names).toEqual(['b-newest', 'd-second', 'c-mid', 'e', 'f',
      'g', 'h', 'i', 'j', 'k']);
    expect(r.names.length, 'ten, not twelve').toBe(10);
    expect(r.names, 'the oldest two fell off').not.toContain('a-old');
    expect(r.names).not.toContain('l-oldest');
  });

  test('and says how many of how many', async ({ page }) => {
    // "10" alone reads as the size of the collection.
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    expect((await panel(page)).count).toBe('10 of 12');
  });

  test('and just the number when that is all there is', async ({ page }) => {
    await seed(page, TWELVE.slice(0, 3));
    await gotoPage(page, 'home');
    const r = await panel(page);
    expect(r.count, 'no fraction to state').toBe('3');
    expect(r.names.length).toBe(3);
  });

  test('it names the layer and how long ago, in words', async ({ page }) => {
    await seed(page, [{ name: 'cap', layer: 'hats', at: now - 3 * HOUR }]);
    await gotoPage(page, 'home');
    const r = await panel(page);
    expect(r.layers).toEqual(['hats']);
    expect(r.whens, 'agoWords reads a number as well as a date string')
      .toEqual(['3 hours ago']);
  });

  test('a trait with no timestamp sorts last rather than vanishing',
    async ({ page }) => {
      /* A record written before `at` existed is still a trait. Dropping it
         would make the list quietly wrong about what the project holds; the
         honest place for "I do not know when" is the bottom. */
      await seed(page, [
        { name: 'dated', at: now - 5 * HOUR },
        { name: 'undated' },
      ]);
      await gotoPage(page, 'home');
      const r = await panel(page);
      expect(r.names, 'both there, the unknown one last')
        .toEqual(['dated', 'undated']);
      expect(r.whens[1], 'and it does not claim 1970').toBe('');
    });

  test('a base character is not an edit', async ({ page }) => {
    /* Refs are saved with a timestamp like anything else, and two of them at
       the top would push a fifth of the list off. */
    await seed(page, [
      { name: 'bare', kind: 'ref', at: now },
      { name: 'cap', layer: 'hats', at: now - 5 * HOUR },
    ]);
    await gotoPage(page, 'home');
    expect((await panel(page)).names).toEqual(['cap']);
  });

  test('an empty project has no list at all', async ({ page }) => {
    // Not an empty panel: nothing.
    await seed(page, []);
    await gotoPage(page, 'home');
    const r = await panel(page);
    expect(r.hidden).toBe(true);
    expect(r.shown).toBe(false);
  });

  test('and it goes away again when the project is cleared', async ({ page }) => {
    /* The control for the one above, and a different code path: hidden at
       first render is easy, hidden again after having been shown is the one
       that gets forgotten. */
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    expect((await panel(page)).shown, 'shown first').toBe(true);
    await page.evaluate(async () => { await dbClear(); await renderShelf(); });
    await page.waitForTimeout(300);
    expect((await panel(page)).hidden, 'and gone after').toBe(true);
  });

  test('it is on the main page and nowhere else', async ({ page }) => {
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    expect((await panel(page)).shown, 'here').toBe(true);
    await gotoPage(page, 'project');
    expect((await panel(page)).shown, 'not in the project').toBe(false);
    await gotoPage(page, 'settings');
    expect((await panel(page)).shown, 'nor in its settings').toBe(false);
  });

  test('View more opens the project', async ({ page }) => {
    // Ten is a glance; the shelf is where the work happens.
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    await page.click('#recentmore');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() =>
      document.getElementById('land').getAttribute('data-page'))).toBe('project');
    expect(page.url(), 'and the address follows, so back works').toContain('#/project');
  });

  test('and a row opens the trait, for real', async ({ page }) => {
    /* THIS TEST USED TO STUB startEditor, WHICH IS WHY IT PASSED WHILE THE
       FEATURE WAS BROKEN. The row called startEditor(t) - handing a record to
       a function whose first three arguments are pixels, a width and a height
       - so art.width became undefined, the editor opened 0x0, and the
       try/catch around it said nothing. A stub that records its first argument
       is happy either way.

       Now it opens the real editor and reads the canvas that resulted, plus
       the three fields and openRec, because those are what make a subsequent
       save update this trait instead of minting a second one beside it. */
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    await page.click('#recentbody .rrow');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      appShown: !document.getElementById('app').hidden,
      w: document.getElementById('art').width,
      h: document.getElementById('art').height,
      name: document.getElementById('tname').value,
      layer: document.getElementById('tlayer').value,
      openRecName: (typeof openRec !== 'undefined' && openRec) ? openRec.name : null,
    }));
    expect(r.appShown, 'the editor actually opened').toBe(true);
    expect([r.w, r.h], 'on a real canvas, not 0x0').toEqual([8, 8]);
    expect(r.name, 'the newest one').toBe('b-newest');
    expect(r.layer).toBe('eyes');
    expect(r.openRecName, 'and a save will update it rather than duplicate it')
      .toBe('b-newest');
  });

  test('and the list follows what the project actually holds',
    async ({ page }) => {
      /* Drawn from renderShelf, so anything that changes the collection
         changes this. Without that it is a snapshot of whatever the page
         happened to load with. */
      await seed(page, TWELVE);
      await gotoPage(page, 'home');
      expect((await panel(page)).names[0]).toBe('b-newest');
      await page.evaluate(async (t) => {
        const c = document.createElement('canvas'); c.width = 8; c.height = 8;
        c.getContext('2d').fillRect(0, 0, 8, 8);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        await dbPut({ id: 't_brand new_eyes_approved', kind: 'trait',
          name: 'brand new', layer: 'eyes', status: 'approved',
          blob, w: 8, h: 8, at: t });
        await renderShelf();
      }, now + 1000);
      await page.waitForTimeout(300);
      const r = await panel(page);
      expect(r.names[0], 'straight to the top').toBe('brand new');
      expect(r.count).toBe('10 of 13');
    });

  test('and the explainer cards are gone from the main page', async ({ page }) => {
    /* Measures / Recovers / Edits described the app to somebody who has not
       used it. Removed by request, and this is the space the list took. */
    await seed(page, TWELVE);
    await gotoPage(page, 'home');
    const gone = await page.evaluate(() => ({
      cards: !document.querySelector('.how'),
      words: !/Rebuilds each cell from its own pixels/.test(document.body.textContent),
    }));
    expect(gone.cards).toBe(true);
    expect(gone.words).toBe(true);
  });
});
