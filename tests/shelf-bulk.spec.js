/* Picking several traits and moving them to a layer at once.

   A batch import drops everything into "unsorted", and sorting it meant
   dragging one card at a time or opening each trait and changing its layer -
   forty times for forty skins.

   THE TEST THAT MATTERS IS "EXACTLY ONCE". The first working version of this
   moved the traits and left them in the OLD layer as well: picking tan, pale
   and olive out of unsorted gave

     unsorted: crown, olive, pale
     skins:    olive, pale, tan

   with two of the three in both places. It happened because planShelfMove
   returns an update for every record in the affected layers - it renormalises
   their order - not only for the trait that moved, so accumulating those
   updates by id kept records that a later plan had already replaced.

   A test asserting only "the three are in skins" passes on that. Counting how
   many places each trait ends up in is what catches it.
*/
import { test, expect } from '@playwright/test';
import { openTrait, openAllSections } from './helpers.js';

const BLOCK = new Function('set', 'W', 'H',
  'for (let y = 20; y < 140; y++) for (let x = 20; x < 140; x++) set(x, y, [226, 146, 116]);');

const put = (page, rows) => page.evaluate(async list => {
  const png = async (hue) => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + hue + ',70%,55%)'; g.fillRect(20, 20, 120, 120);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  };
  let i = 0;
  for (const r of list) {
    const status = r.s || 'wip';
    await dbPut({ id: 't_' + r.n + '_' + r.l + '_' + status, kind: 'trait', name: r.n,
                  layer: r.l, status, blob: await png((i * 47) % 360), w: 160, h: 160,
                  rarity: 1, at: 1, shelfOrder: (++i) * 1024 });
  }
  await renderShelf();
}, rows);

/* Every trait, and which layers it is in. A trait in two layers shows up here
   as a list of length two - which is the defect this file exists for. */
const placement = (page) => page.evaluate(async () => {
  const items = (await dbAll()).filter(i => i.kind === 'trait');
  const by = {};
  for (const t of items) (by[t.name] = by[t.name] || []).push(t.layer);
  for (const k of Object.keys(by)) by[k].sort();
  return by;
});

/* The pick button is the last of the five per-card tools. */
const pickByName = (page, names) => page.evaluate((want) => {
  const got = [];
  for (const el of document.querySelectorAll('[data-shelf-card-key]')) {
    const name = (el.querySelector('b') || {}).textContent;
    if (want.indexOf(name) < 0) continue;
    const btns = [...el.querySelectorAll('.shelftools button')];
    btns[btns.length - 1].click();
    got.push(name);
  }
  return got;
}, names);

const bar = (page) => page.evaluate(() => ({
  count: $('shelfpickcount').textContent,
  moveDisabled: $('shelfpickmove').disabled,
  marked: document.querySelectorAll('.item.picked').length,
}));

const moveTo = async (page, layer) => {
  await page.evaluate((l) => { $('shelfpicklayer').value = l; return $('shelfpickmove').onclick(); }, layer);
  await page.waitForTimeout(700);
};

const toastOf = (page) => page.evaluate(() => (($('toast') || {}).textContent) || '');

test.describe('moving several traits at once', () => {
  const FOUR = [{ n: 'tan', l: 'unsorted' }, { n: 'pale', l: 'unsorted' },
                { n: 'olive', l: 'unsorted' }, { n: 'crown', l: 'unsorted' }];

  const ready = async (page, rows) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, rows);
    await page.waitForTimeout(300);
  };

  test('three picked traits move, and each ends up in exactly one layer', async ({ page }) => {
    await ready(page, FOUR);
    expect(await pickByName(page, ['tan', 'pale', 'olive'])).toHaveLength(3);
    await moveTo(page, 'skins');

    const where = await placement(page);
    // THE REGRESSION. The first version left two of the three in both layers,
    // and an assertion that only checked skins would have passed on it.
    for (const n of ['tan', 'pale', 'olive', 'crown'])
      expect(where[n], n + ' must be in exactly one layer').toHaveLength(1);
    expect(where.tan[0]).toBe('skins');
    expect(where.pale[0]).toBe('skins');
    expect(where.olive[0]).toBe('skins');
    expect(where.crown[0], 'the one that was not picked stays put').toBe('unsorted');
  });

  test('the bar counts what is picked and only then offers to move', async ({ page }) => {
    await ready(page, FOUR);
    const empty = await bar(page);
    expect(empty.count).toMatch(/nothing/i);
    expect(empty.moveDisabled, 'nothing picked, nothing to move').toBe(true);

    await pickByName(page, ['tan', 'pale']);
    await page.waitForTimeout(300);
    const two = await bar(page);
    expect(two.count).toContain('2');
    expect(two.moveDisabled).toBe(false);
    expect(two.marked, 'and the cards themselves show it').toBe(2);
  });

  test('picking the same card again unpicks it', async ({ page }) => {
    await ready(page, FOUR);
    await pickByName(page, ['tan']);
    await page.waitForTimeout(250);
    expect((await bar(page)).count).toContain('1');
    await pickByName(page, ['tan']);
    await page.waitForTimeout(250);
    expect((await bar(page)).count, 'a misclick is fixable').toMatch(/nothing/i);
  });

  test('the selection is dropped once the move is done', async ({ page }) => {
    // The ids change under it, so keeping it would leave the count describing
    // traits that no longer exist under those keys.
    await ready(page, FOUR);
    await pickByName(page, ['tan', 'pale']);
    await moveTo(page, 'skins');
    expect((await bar(page)).count).toMatch(/nothing/i);
    expect((await bar(page)).marked).toBe(0);
  });

  test('a name already in the destination is refused and named', async ({ page }) => {
    // Moving thirty and silently keeping four is how a collection ships four
    // traits short, so the refusal has to say which.
    await ready(page, [{ n: 'tan', l: 'unsorted' }, { n: 'pale', l: 'unsorted' },
                       { n: 'tan', l: 'skins' }]);
    await pickByName(page, ['tan', 'pale']);
    await page.waitForTimeout(300);
    await moveTo(page, 'skins');

    const said = await toastOf(page);
    expect(said, 'it moved the one it could').toContain('1');
    expect(said, 'and named the one it could not').toContain('tan');
    const where = await placement(page);
    expect(where.pale[0]).toBe('skins');
    expect(where.tan, 'both tans still exist, one per layer').toHaveLength(2);
  });

  test('pick all takes what is on screen, not what is filtered away', async ({ page }) => {
    // Picking traits a person cannot see and then moving them is the kind of
    // surprise that costs an afternoon.
    await ready(page, [{ n: 'tan', l: 'unsorted', s: 'approved' },
                       { n: 'pale', l: 'unsorted', s: 'approved' },
                       { n: 'draft', l: 'unsorted', s: 'wip' }]);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.mini.filt')].find(x => x.dataset.f === 'approved');
      b.click();
    });
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => document.querySelectorAll('[data-shelf-card-key]').length);
    expect(shown, 'the filter is doing something').toBe(2);

    await page.evaluate(() => $('shelfpickall').onclick());
    await page.waitForTimeout(300);
    expect((await bar(page)).count, 'only the two on screen').toContain('2');

    // And the CONSEQUENCE, which is what actually matters and what a count
    // alone cannot pin: an implementation reading the whole project rather than
    // the screen would move the filtered-away trait too, and the count would
    // look the same in a run where the filter happened to hide nothing.
    await moveTo(page, 'skins');
    const where = await placement(page);
    expect(where.tan[0], 'the shown ones moved').toBe('skins');
    expect(where.pale[0]).toBe('skins');
    expect(where.draft[0], 'the one filtered away was never picked').toBe('unsorted');
  });
});
