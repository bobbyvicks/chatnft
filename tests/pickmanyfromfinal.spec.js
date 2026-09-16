/* PICKING MANY TRAITS AND FILING THEM AT ONCE, FROM THE FINAL PROJECT PAGE.

   "In Final project i need there to be a way for me to change what trait layer
   is in which, ATM its not working (i asked yesterday) we have a bunch of
   unnsorted traits that need to be sorted but i cant rn so give the option to
   select and click multiple to add to a trait layer"

   The per-tile picker shipped in 474 does work. The reason it read as broken is
   that the tiles were not there: everything that needs sorting is a trait NOBODY
   HAS CHOSEN, and those live inside a collapsed fold labelled "add from
   unsorted" - which sounds like it is about the final set rather than about
   filing. Measured on arrival with four of them: one tile on screen, one layer
   picker, and the pile behind a closed fold.

   Test 1 is that. Tests 3 and 4 are the ask.
*/
import { test, expect } from '@playwright/test';

/* A batch import: one filed trait, and a pile in unsorted that nobody has
   chosen - which is what "a bunch of unsorted traits that need to be sorted"
   is. */
const seed = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = o.ws || null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  const layers = ['skins', 'eyes', 'unsorted'];
  LAYERS = layers.slice();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: layers.slice(), hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const cloud = (name) => o.ws ? { rowId: 'row-' + name, synced: true, path: 'p/' + name + '.png' } : {};
  let n = 0;
  await dbPut({ id: 't_tan_skins_stfp', kind: 'trait', name: 'tan', layer: 'skins',
    status: 'stfp', blob, w: 16, h: 16, rarity: 1, at: 1, shelfOrder: (++n) * 1024,
    ...cloud('tan') });
  for (const nm of ['a', 'b', 'c', 'd']) {
    /* In a group, one of them has never been sent. commitShelfMove refuses a
       plan holding ANY unsynced record, and a plan touches every trait in both
       layers - so this one blocks the per-tile picker for all four. */
    const extra = (o.oneUnsynced && nm === 'd') ? {} : cloud(nm);
    await dbPut({ id: 't_' + nm + '_unsorted_approved', kind: 'trait', name: nm,
      layer: 'unsorted', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1,
      shelfOrder: (++n) * 1024, ...extra });
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
  showPage('final', false);
  await new Promise(r => setTimeout(r, 500));
}, opts || {});

const onScreen = (page) => page.evaluate(() => ({
  tiles: [...document.querySelectorAll('#finallayers .item')].map(i => i.title).sort(),
  ticks: document.querySelectorAll('#finallayers input.fspick').length,
  barHidden: document.getElementById('fspick').hidden,
  count: document.getElementById('fspickcount').textContent,
  moveOff: document.getElementById('fspickmove').disabled,
  layers: [...document.getElementById('fspicklayer').options].map(o => o.value),
}));

const tick = (page, names) => page.evaluate((want) => {
  for (const item of document.querySelectorAll('#finallayers .item')) {
    if (want.indexOf(item.title) < 0) continue;
    const cb = item.querySelector('input.fspick');
    if (!cb) throw new Error('no tick on the tile for ' + item.title);
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, names);

const moveTo = async (page, layer) => {
  const said = await page.evaluate(async (l) => {
    const realToast = window.toast; const out = [];
    window.toast = (m) => out.push(String(m));
    try {
      document.getElementById('fspicklayer').value = l;
      await document.getElementById('fspickmove').onclick();
      await new Promise(r => setTimeout(r, 400));
    } finally { window.toast = realToast; }
    return out;
  }, layer);
  await page.waitForTimeout(300);
  return said;
};

/* Which layers each trait ends up in. A trait in two layers comes back as a
   list of length two - the defect shelf-bulk.spec.js exists for. */
const placement = (page) => page.evaluate(async () => {
  const by = {};
  for (const t of (await dbAll()).filter(i => i.kind === 'trait'))
    (by[t.name] = by[t.name] || []).push(t.layer);
  for (const k of Object.keys(by)) by[k].sort();
  return by;
});

test.describe('picking many traits to sort at once', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function');
  });

  test('THE UNSORTED PILE IS ON SCREEN WHEN YOU ARRIVE', async ({ page }) => {
    /* The reason the per-tile picker read as broken. Before this, arriving gave
       one tile and one picker: everything that needed filing was a trait nobody
       had chosen, and all of it sat inside a closed fold. */
    await seed(page);
    const s = await onScreen(page);
    expect(s.tiles, 'the pile and the one filed trait').toEqual(['a', 'b', 'c', 'd', 'tan']);
    expect(s.ticks, 'and every one of them can be picked').toBe(5);
    expect(s.barHidden, 'with the bar to do something with them').toBe(false);
    expect(s.count).toBe('Nothing picked');
    expect(s.moveOff, 'which offers nothing until something is picked').toBe(true);
    expect(s.layers, 'and offers every layer').toEqual(['skins', 'eyes', 'unsorted']);
  });

  test('PICKING SEVERAL AND PRESSING MOVE FILES THEM ALL', async ({ page }) => {
    await seed(page);
    await tick(page, ['a', 'b', 'c']);
    expect((await onScreen(page)).count).toBe('3 picked');
    const said = await moveTo(page, 'eyes');
    const where = await placement(page);
    /* EACH IN EXACTLY ONE LAYER. A list of two here is the defect shelf-bulk
       was written for: the trait left behind in the layer it came from. */
    for (const nm of ['a', 'b', 'c'])
      expect(where[nm], nm + ' is in exactly one layer').toEqual(['eyes']);
    expect(where.d, 'and the one not picked did not move').toEqual(['unsorted']);
    expect(where.tan).toEqual(['skins']);
    expect(said.join(' ')).toContain('Moved 3 traits to eyes');
  });

  test('AND THE SELECTION IS DROPPED AFTERWARDS', async ({ page }) => {
    /* Otherwise the next press moves them again, to wherever the layer box
       happens to be pointing. */
    await seed(page);
    await tick(page, ['a', 'b']);
    await moveTo(page, 'eyes');
    const s = await onScreen(page);
    expect(s.count).toBe('Nothing picked');
    expect(s.moveOff).toBe(true);
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('#finallayers input.fspick')].filter(c => c.checked).length),
    'and no tick is left ticked').toBe(0);
  });

  test('PICK ALL SHOWN TAKES THE WHOLE PILE', async ({ page }) => {
    /* The case this is for is a batch import, where the answer is "all of
       them". */
    await seed(page);
    await page.evaluate(() => { document.getElementById('fspickall').click(); });
    expect((await onScreen(page)).count, 'five on screen, five picked').toBe('5 picked');
    await moveTo(page, 'skins');
    const where = await placement(page);
    for (const nm of ['a', 'b', 'c', 'd', 'tan'])
      expect(where[nm], nm).toEqual(['skins']);
  });

  test('and a trait picked here is picked on the shelf - the control',
    async ({ page }) => {
      /* One idea of "picked" rather than two. If this page kept its own set,
         the move would take what the SHELF held, which is not what the ticks on
         screen say - and the two would drift the moment either was used. */
      await seed(page);
      await tick(page, ['a', 'b']);
      const keys = await page.evaluate(async () => {
        const recs = (await dbAll()).filter(i => i.kind === 'trait');
        return [...shelfPick].map(k =>
          (recs.find(r => shelfCore.recordKey(r) === k) || {}).name).sort();
      });
      expect(keys).toEqual(['a', 'b']);
    });

  test('IT GETS PAST WHAT BLOCKS THE PER-TILE PICKER IN A GROUP',
    async ({ page }) => {
      /* Measured: a group project with one unsynced trait in unsorted refuses
         to move a DIFFERENT, fully synced one through the per-tile picker,
         because commitShelfMove refuses any plan holding an unsynced record and
         a plan touches every trait in both layers.

         The bulk move checks the traits you picked. So picking the three that
         are synced moves them. */
      await seed(page, { ws: 'team7', oneUnsynced: true });
      /* The precondition: the per-tile picker really is refused here, or this
         proves nothing about getting past it. */
      const refused = await page.evaluate(async () => {
        const realToast = window.toast; const out = [];
        window.toast = (m) => out.push(String(m));
        try {
          const item = [...document.querySelectorAll('#finallayers .item')]
            .find(i => i.title === 'a');
          const sel = item.querySelector('select.fslayer');
          sel.value = 'eyes';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 1200));
        } finally { window.toast = realToast; }
        const rec = (await dbAll()).filter(x => x.kind === 'trait').find(x => x.name === 'a');
        return { said: out.join(' '), where: rec && rec.layer };
      });
      expect(refused.where, 'the per-tile picker did not move it').toBe('unsorted');
      /* AND IT NAMES THE ONE HOLDING THINGS UP, which is not the one being
         moved - there was no way to find that out from this page before. */
      expect(refused.said, 'and it names what is in the way').toContain('d');
      expect(refused.said).toContain('Save to cloud');

      await tick(page, ['a', 'b', 'c']);
      await moveTo(page, 'eyes');
      const where = await placement(page);
      for (const nm of ['a', 'b', 'c'])
        expect(where[nm], nm + ' went through the bulk move').toEqual(['eyes']);
      expect(where.d, 'and the unsent one stayed put').toEqual(['unsorted']);
    });

  test('and the fold follows you once you have closed it - the control',
    async ({ page }) => {
      /* Opened on the first visit of a session, not on every render. A fold
         that reopened every time would be a control fighting whoever closed
         it. */
      await seed(page);
      await page.evaluate(async () => {
        const d = [...document.querySelectorAll('#finallayers details')]
          .find(x => x.dataset.layer === 'unsorted');
        d.open = false;
        await renderFinal();
        await new Promise(r => setTimeout(r, 300));
      });
      const shut = await page.evaluate(() => {
        const d = [...document.querySelectorAll('#finallayers details')]
          .find(x => x.dataset.layer === 'unsorted');
        return d ? d.open : 'gone';
      });
      expect(shut, 'it stayed shut').toBe(false);
    });
});
