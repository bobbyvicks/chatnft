/* A PREVIEW OF THE FINAL PROJECT, DRAWN FROM THE FINAL TRAITS ONLY.

   "i wannt to be able to have a *final project preview where you can see a
   preview of just the final edited traits. Make it so that the trait layer
   rules carry over as well."

   The project page already builds a character, but from everything approved -
   which is the whole point of the complaint the final page exists for. This
   one draws from the stfp set and nothing else.

   THE TWO THAT MATTER ARE 3 AND 4. "Only the final traits" and "the rules
   carry over" are the request, and each has a way of being quietly false: a
   preview built from the wrong pool looks right until you notice a trait in it
   that you never chose, and a preview that reimplements the draw applies no
   rules at all while looking identical on any set without a rule in it. So one
   test names every trait that could appear and checks none of the others ever
   does, and the other forbids a pair the set cannot avoid and checks it never
   comes out.
*/
import { test, expect } from '@playwright/test';

/* Two layers, two traits each, all four in the final set - plus one approved
   trait per layer that is NOT in it, which is what test 3 is looking for. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  const layers = ['skins', 'eyes', 'unsorted'];
  LAYERS = layers.slice();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: layers.slice(), hidden: [] });
  /* ONE 4x4 CORNER PER TRAIT, each in its own place, so a character shows
     every trait it carries at once and none of them hides another. A trait
     filling the whole tile would let the last one painted take the pixel, and
     the question here is WHICH traits were drawn. */
  const corner = async (rgb, cx, cy) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + rgb.join(',') + ')';
    g.fillRect(cx, cy, 4, 4);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const rows = [
    ['tan',    'skins', 'stfp',     [200, 0, 0],   0,  0],
    ['pale',   'skins', 'stfp',     [0, 200, 0],   4,  0],
    ['ruddy',  'skins', 'approved', [0, 0, 200],   8,  0],
    ['wide',   'eyes',  'stfp',     [200, 200, 0], 0,  8],
    ['narrow', 'eyes',  'stfp',     [0, 200, 200], 4,  8],
    ['shut',   'eyes',  'approved', [200, 0, 200], 8,  8],
  ];
  let n = 0;
  for (const [name, layer, status, rgb, cx, cy] of rows) {
    await dbPut({ id: 't_' + name + '_' + layer + '_' + status, kind: 'trait',
      name, layer, status, blob: await corner(rgb, cx, cy), w: 16, h: 16,
      rarity: 1, at: 1000, shelfOrder: (++n) * 1024 });
  }
  /* NO LAYER IS EVER LEFT OUT, so a character always carries one of each and
     a missing colour means a trait was not drawn rather than a layer skipped.
     emptyChance is the generator's own control and the preview honours it -
     which is exactly why it has to be pinned here instead of left at whatever
     the project happens to be set to. */
  emptyChance = 0;
  RULES = [];
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
});

const openFinal = (page) => page.evaluate(async () => {
  showPage('final', false);
  await new Promise(r => setTimeout(r, 600));
});

/* Which of the six seeded colours are on the preview canvas. Read off the
   canvas rather than off any list the app keeps, because what was DRAWN is the
   question - a preview that picked the right traits and painted the wrong ones
   would pass every check made against the pools. */
const drawn = (page) => page.evaluate(() => {
  const cv = document.getElementById('fpcanvas');
  const g = cv.getContext('2d');
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const want = { '200,0,0': 'tan', '0,200,0': 'pale', '0,0,200': 'ruddy',
    '200,200,0': 'wide', '0,200,200': 'narrow', '200,0,200': 'shut' };
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    if (want[k]) seen.add(want[k]);
  }
  return [...seen].sort();
});

const press = async (page, id, times) => {
  const all = [];
  for (let i = 0; i < (times || 1); i++) {
    await page.evaluate((b) => { document.getElementById(b).click(); }, id);
    await page.waitForTimeout(260);
    all.push(await drawn(page));
  }
  return all;
};

test.describe('the final project preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function');
    await seed(page);
    await openFinal(page);
  });

  test('IT DRAWS A CHARACTER WHEN YOU ARRIVE', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cv = document.getElementById('fpcanvas');
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) lit++;
      return { hidden: document.getElementById('fsprev').hidden, lit,
        w: cv.width, h: cv.height };
    });
    expect(r.hidden, 'the block is on screen').toBe(false);
    expect(r.lit, 'and something is painted on it').toBeGreaterThan(0);
  });

  test('and it says what it drew from', async ({ page }) => {
    const note = await page.evaluate(() =>
      document.getElementById('fpnote').textContent);
    /* Four stfp traits over two layers, out of six traits over two layers. */
    expect(note).toContain('4 traits');
    expect(note).toContain('2 layers');
  });

  test('ONLY THE TRAITS IN THE FINAL PROJECT EVER APPEAR', async ({ page }) => {
    /* The request, and the thing that is easy to get wrong by reading the pool
       the project page already built. ruddy and shut are approved but not
       chosen; over twenty draws neither may ever be painted. */
    const seen = new Set();
    for (const one of await press(page, 'fprand', 20)) one.forEach(x => seen.add(x));
    expect([...seen].sort(), 'both chosen skins and both chosen eyes, and nothing else')
      .toEqual(['narrow', 'pale', 'tan', 'wide']);
  });

  test('AND A NEVER-TOGETHER RULE IS OBEYED', async ({ page }) => {
    /* "Make it so that the trait layer rules carry over as well." Asserted by
       forbidding a pair the set cannot avoid by chance: with tan banned against
       wide, every character carrying tan must carry narrow.

       The precondition is asserted first, because a rule that never bound
       would make this pass on a preview that applies no rules at all. */
    const bound = await page.evaluate(async () => {
      RULES = [['skins/tan', 'eyes/wide'].sort()];
      await saveRules();
      await new Promise(r => setTimeout(r, 200));
      const tan = (await dbAll()).find(r => r.id === 't_tan_skins_stfp');
      return conflictsWith(tan, [{ layer: 'eyes', name: 'wide' }]);
    });
    expect(bound, 'the rule binds before anything is drawn').toBe(true);
    const draws = await press(page, 'fprand', 24);
    const broke = draws.filter(d => d.includes('tan') && d.includes('wide'));
    expect(broke, 'no character carried the forbidden pair').toEqual([]);
    /* And the set was not simply avoided: tan and wide each still turn up, so
       this is a rule being obeyed rather than a preview that stopped drawing. */
    expect(draws.some(d => d.includes('tan')), 'tan still appears').toBe(true);
    expect(draws.some(d => d.includes('wide')), 'wide still appears').toBe(true);
  });

  test('THE SHEET DRAWS SEVERAL DIFFERENT CHARACTERS', async ({ page }) => {
    const before = await page.evaluate(() => {
      const cv = document.getElementById('fpcanvas');
      return { w: cv.width, h: cv.height };
    });
    await page.evaluate(() => { document.getElementById('fpsheet').click(); });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const cv = document.getElementById('fpcanvas');
      return { w: cv.width, h: cv.height,
        note: document.getElementById('fpnote').textContent };
    });
    /* Four combinations exist - two skins by two eyes - so a sheet of twelve
       can only give four, and saying so is the difference between a short
       sheet and a broken one. */
    expect(after.w, 'the canvas grew into a grid').toBeGreaterThan(before.w);
    expect(after.note).toContain('4');
  });

  test('IT REDRAWS WHEN THE FINAL SET CHANGES', async ({ page }) => {
    /* A preview of a set that has changed under it is a picture of something
       that no longer exists. Taking both eyes out leaves one layer, so no
       character can carry an eye colour afterwards. */
    await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      for (const name of ['wide', 'narrow']) {
        const rec = (await dbAll()).filter(r => r.kind === 'trait')
          .find(t => t.name === name);
        await setTraitStatus(rec, 'approved');
      }
      await renderFinal();
      await new Promise(r => setTimeout(r, 500));
      window.toast = realToast;
    });
    const seen = new Set();
    for (const one of await press(page, 'fprand', 12)) one.forEach(x => seen.add(x));
    expect([...seen].sort(), 'only the skins are left in the final set')
      .toEqual(['pale', 'tan']);
    const note = await page.evaluate(() =>
      document.getElementById('fpnote').textContent);
    expect(note).toContain('2 traits');
  });

  test('and it says so rather than drawing nothing when the set is empty - the control',
    async ({ page }) => {
      /* The state the page opens in for anybody who has not chosen anything
         yet, which is every new project. A blank canvas under no explanation
         reads as a broken preview. */
      await page.evaluate(async () => {
        const realToast = window.toast; window.toast = () => {};
        for (const name of ['tan', 'pale', 'wide', 'narrow']) {
          const rec = (await dbAll()).filter(r => r.kind === 'trait')
            .find(t => t.name === name);
          await setTraitStatus(rec, 'approved');
        }
        await renderFinal();
        await new Promise(r => setTimeout(r, 500));
        window.toast = realToast;
      });
      const r = await page.evaluate(() => ({
        hidden: document.getElementById('fsprev').hidden,
        sub: document.getElementById('finalsub').textContent,
      }));
      expect(r.hidden, 'the preview is put away rather than left blank').toBe(true);
      expect(r.sub).toContain('Nothing is in the final project yet');
    });

  test('and the project page still builds a character from everything approved - the control',
    async ({ page }) => {
      /* The preview is a SECOND view, not a replacement. If the extraction
         that lets both pages share one painting broke the first one, this is
         what says so - and it is the page whose behaviour nobody asked to
         change. */
      const r = await page.evaluate(async () => {
        showPage('project', false);
        await new Promise(x => setTimeout(x, 600));
        const rows = [...document.querySelectorAll('#crows select')]
          .map(s => ({ layer: s.dataset.layer,
            options: [...s.options].filter(o => o.value).length }));
        const realToast = window.toast; window.toast = () => {};
        document.getElementById('crand').click();
        await new Promise(x => setTimeout(x, 400));
        window.toast = realToast;
        const cv = document.getElementById('ccanvas');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let lit = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]) lit++;
        return { rows, lit };
      });
      /* Three per layer there, against two here: the wider pool is the whole
         reason the final page exists. */
      expect(r.rows.find(x => x.layer === 'skins').options).toBe(3);
      expect(r.rows.find(x => x.layer === 'eyes').options).toBe(3);
      expect(r.lit, 'and it still paints').toBeGreaterThan(0);
    });
});
