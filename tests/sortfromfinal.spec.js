/* SORTING TRAITS INTO LAYERS FROM THE FINAL PROJECT PAGE.

   Asked for as: "in the Final project tab we have a bunch of unsorted things
   but I want to be able to sort them. Let that be a thing for all the traits
   but even more important for the unsorted (thats not an actual layer)".

   A batch import lands everything in "unsorted", and the Final page is where
   you look at what is going into the collection - so it is exactly where you
   notice that six of your final traits are not filed anywhere. Until now the
   only way out was back to the shelf.

   THE THREE THAT MATTER ARE 4, 5 AND 6. Changing a trait's layer changes its
   record id, and four things are keyed to that id - the record, the unsaved
   draft, the rules that name the trait, and the hidden set. A page with its
   own copy of dbDel-and-dbPut would agree with the shelf today and drift
   tomorrow, and the way to prove from outside that it does NOT have one is to
   leave each of those things on a trait and check it is still attached after
   the page moves it.

   Test 2 is the shelf-bulk "exactly once" assertion, brought here for the same
   reason it exists there: a move that leaves the trait in the old layer as
   well passes any check that only asks "is it in skins now".
*/
import { test, expect } from '@playwright/test';

/* A project in the state the request describes. Two traits are already filed,
   three are loose in unsorted, and one of the loose ones is not in the final
   set - so the fold has something in it too. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  const layers = ['backgrounds', 'skins', 'eyes', 'unsorted'];
  LAYERS = layers.slice();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: layers.slice(), hidden: [] });
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const rows = [
    ['bac1', 'backgrounds', 'stfp'],
    ['tan', 'skins', 'stfp'],
    ['loose', 'unsorted', 'stfp'],
    ['drifter', 'unsorted', 'stfp'],
    ['waiting', 'unsorted', 'approved'],
    /* A SECOND ONE WAITING, so the fold still has something in it after the
       first is filed - which is what the fold test needs to be able to fail. */
    ['spare', 'unsorted', 'approved'],
  ];
  let n = 0;
  for (const [name, layer, status] of rows) {
    await dbPut({ id: 't_' + name + '_' + layer + '_' + status, kind: 'trait',
      name, layer, status, blob: await png(90), w: 16, h: 16, rarity: 1,
      at: 1000, shelfOrder: (++n) * 1024 });
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
});

const openFinal = (page) => page.evaluate(async () => {
  showPage('final', false);
  await new Promise(r => setTimeout(r, 400));
});

/* Every layer control on the page, by the trait it belongs to. The tiles are
   keyed by title, which finalTile sets to the trait name. */
const controls = (page) => page.evaluate(() => {
  const out = {};
  for (const item of document.querySelectorAll('#finallayers .item')) {
    const sel = item.querySelector('select.fslayer');
    if (!sel) continue;
    out[item.title] = { value: sel.value, options: [...sel.options].map(o => o.value) };
  }
  return out;
});

/* Which layers each trait ends up in. A trait in two layers comes back as a
   list of length two - the defect shelf-bulk.spec.js exists for. */
const placement = (page) => page.evaluate(async () => {
  const by = {};
  for (const t of (await dbAll()).filter(i => i.kind === 'trait'))
    (by[t.name] = by[t.name] || []).push(t.layer);
  for (const k of Object.keys(by)) by[k].sort();
  return by;
});

/* Drive the control the way a person does: pick a layer and let go.

   The move is async and the page redraws inside it, so the toast is collected
   across the whole gesture and handed back afterwards rather than read at the
   end - by then the element has been through a render. */
const fileUnder = async (page, name, layer) => {
  await page.evaluate(({ n, l }) => {
    window.__realToast = window.toast;
    window.__said = [];
    window.toast = (m) => { window.__said.push(String(m)); };
    const item = [...document.querySelectorAll('#finallayers .item')]
      .find(i => i.title === n);
    if (!item) throw new Error('no tile for ' + n);
    const sel = item.querySelector('select.fslayer');
    if (!sel) throw new Error('no layer control on the tile for ' + n);
    if (![...sel.options].some(o => o.value === l))
      throw new Error(sel.options.length + ' options and none of them is ' + l);
    sel.value = l;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, { n: name, l: layer });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    if (window.__realToast) window.toast = window.__realToast;
    return window.__said || [];
  });
};

const heads = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#finallayers .layer h3')].map(h => h.textContent));

/* Every trait's shelf order, which is what a move renumbers. The control test
   reads this rather than a toast: a same-layer move is not refused by the
   planner, it is carried out as a reorder, and the only visible trace of that
   is these numbers. */
const orders = (page) => page.evaluate(async () => {
  const out = {};
  for (const t of (await dbAll()).filter(i => i.kind === 'trait'))
    out[t.name] = t.layer + '#' + t.shelfOrder;
  return out;
});

test.describe('sorting traits into layers from the final project page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function');
    await seed(page);
    await openFinal(page);
  });

  test('EVERY TILE SAYS WHICH LAYER IT IS IN AND OFFERS THE OTHERS',
    async ({ page }) => {
      /* The precondition for everything below, and the answer to "let that be
         a thing for all the traits": the control is on each of them, not only
         on the unsorted ones. */
      const c = await controls(page);
      /* The two waiting in unsorted are here as well, because that fold is
         open on the first visit now - the traits that need filing are by
         definition the ones nobody has chosen, so all of them live in a fold
         and the page used to open with the pile invisible. */
      expect(Object.keys(c).sort())
        .toEqual(['bac1', 'drifter', 'loose', 'spare', 'tan', 'waiting']);
      expect(c.loose.value, 'it shows where the trait actually is').toBe('unsorted');
      expect(c.tan.value).toBe('skins');
      expect(c.loose.options, 'and offers every layer the project has')
        .toEqual(['backgrounds', 'skins', 'eyes', 'unsorted']);
    });

  test('FILING A LOOSE TRAIT MOVES IT, AND IT ENDS UP IN EXACTLY ONE LAYER',
    async ({ page }) => {
      await fileUnder(page, 'loose', 'eyes');
      const where = await placement(page);
      /* A list of one. Two entries here is the bug that made shelf-bulk exist:
         the trait present in the old layer as well as the new one. */
      expect(where.loose).toEqual(['eyes']);
      /* And nobody else moved. */
      expect(where.tan).toEqual(['skins']);
      expect(where.drifter).toEqual(['unsorted']);
      expect(where.waiting).toEqual(['unsorted']);
    });

  test('and the page redraws around it', async ({ page }) => {
    await fileUnder(page, 'loose', 'eyes');
    const h = await heads(page);
    /* eyes had nothing in it and now holds one; unsorted held four traits, two
       of them final, and now holds three with one final. */
    expect(h).toContain('eyes · 1 of 1');
    expect(h).toContain('unsorted · 1 of 3');
    const c = await controls(page);
    expect(c.loose.value, 'and the control agrees with where it went').toBe('eyes');
  });

  test('AN UNSAVED DRAWING FOLLOWS THE TRAIT', async ({ page }) => {
    /* The draft is filed under "autosave."+the record id, and the id carries
       the layer. Asserted through what OPENING the trait gives you rather than
       through a key, because a draft re-keyed and then rejected as stale would
       pass a key check and still lose the work - draftfollows.spec.js records
       why that is not hypothetical. */
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d');
      g.fillStyle = 'rgb(20,20,20)'; g.fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await dbPut({ id: 'autosave.t_loose_unsorted_stfp', kind: 'autosave',
        traitId: 't_loose_unsorted_stfp', name: 'loose.png', w: 16, h: 16,
        blob, at: 9999 });
    });
    await fileUnder(page, 'loose', 'skins');
    const corner = await page.evaluate(async () => {
      const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === 'loose');
      if (!rec) return 'the trait is gone';
      const realToast = window.toast; window.toast = () => {};
      try { await openTraitRecord(rec); } finally { window.toast = realToast; }
      await new Promise(r => setTimeout(r, 200));
      return ctx.getImageData(0, 0, 1, 1).data[0];
    });
    expect(corner, 'the unsaved drawing came back, not the saved trait').toBe(20);
  });

  test('A RULE THAT NAMES THE TRAIT FOLLOWS IT', async ({ page }) => {
    /* A rule names a trait as layer/name, so moving the trait renames the
       thing the rule points at. Read back through conflictsWith - the function
       the generator actually calls - rather than through RULES, which is what
       rulesfollow.spec.js insists on and for the same reason. */
    const bound = await page.evaluate(async () => {
      RULES = [['skins/tan', 'unsorted/loose'].sort()];
      await saveRules();
      await new Promise(r => setTimeout(r, 200));
      const loose = (await dbAll()).find(r => r.id === 't_loose_unsorted_stfp');
      return conflictsWith(loose, [{ layer: 'skins', name: 'tan' }]);
    });
    expect(bound, 'the rule binds before the move, or nothing below means anything')
      .toBe(true);
    await fileUnder(page, 'loose', 'eyes');
    const after = await page.evaluate(async () => {
      const loose = (await dbAll()).filter(r => r.kind === 'trait')
        .find(t => t.name === 'loose');
      return { where: loose ? loose.layer : null,
        binds: loose ? conflictsWith(loose, [{ layer: 'skins', name: 'tan' }]) : 'gone' };
    });
    expect(after.where).toBe('eyes');
    expect(after.binds, 'and it still binds under the new name').toBe(true);
  });

  test('A HIDDEN TRAIT IS STILL HIDDEN AFTERWARDS', async ({ page }) => {
    /* The hidden set is keyed by record key, which a layer move rewrites for a
       personal project. Without the transfer the trait quietly reappears on
       the shelf - the exact defect shelf-bulk.spec.js caught in the bulk path. */
    const before = await page.evaluate(async () => {
      const rec = (await dbAll()).find(r => r.id === 't_loose_unsorted_stfp');
      currentShelfVisibility().hide(shelfCore.recordKey(rec));
      return currentShelfVisibility().count;
    });
    expect(before, 'it is hidden to begin with').toBe(1);
    await fileUnder(page, 'loose', 'skins');
    const after = await page.evaluate(async () => {
      const vis = currentShelfVisibility();
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      return { count: vis.count,
        hidden: items.filter(t => vis.isHidden(shelfCore.recordKey(t))).map(t => t.name) };
    });
    expect(after.hidden, 'the same trait, under its new key').toEqual(['loose']);
    expect(after.count, 'and nothing else got hidden along the way').toBe(1);
  });

  test('THE TRAITS WAITING IN THE FOLD CAN BE FILED TOO', async ({ page }) => {
    /* "Let that be a thing for all the traits" - a trait that is not in the
       final set yet is still a trait sitting in the wrong place, and the fold
       is where you meet it. */
    await page.evaluate(async () => {
      const d = [...document.querySelectorAll('#finallayers details')]
        .find(x => x.querySelector('summary').textContent.includes('unsorted'));
      d.open = true; d.dispatchEvent(new Event('toggle'));
      await new Promise(r => setTimeout(r, 250));
    });
    const c = await controls(page);
    expect(c.waiting, 'the fold tile carries one as well').toBeTruthy();
    expect(c.waiting.value).toBe('unsorted');
    await fileUnder(page, 'waiting', 'skins');
    const where = await placement(page);
    expect(where.waiting).toEqual(['skins']);
    /* Filing it did not put it in the final set - those are two different
       decisions and the two controls on the tile are what keeps them apart. */
    const status = await page.evaluate(async () =>
      ((await dbAll()).filter(i => i.kind === 'trait')
        .find(t => t.name === 'waiting') || {}).status);
    expect(status, 'sorting it is not the same as choosing it').toBe('approved');
  });

  test('PICKING THE LAYER IT IS ALREADY IN REWRITES NOTHING - the control',
    async ({ page }) => {
      /* planShelfMove does NOT refuse a move to the layer the trait is already
         in: with no anchor it appends, so the trait goes to the BOTTOM of its
         own layer and every record in that layer is renumbered and pushed to
         the group. Measured on the unfixed planner, not assumed.

         So the guard is the handler's, and this is what proves it is there.
         Without it, "the control moves traits" would also pass on a version
         that reshuffled a whole layer every time a change event arrived. */
      const before = await orders(page);
      await fileUnder(page, 'tan', 'skins');
      expect(await orders(page), 'not one record was rewritten').toEqual(before);
    });

  test('A REFUSED MOVE SNAPS THE CONTROL BACK', async ({ page }) => {
    /* A select is a claim about the record, which a button is not - so a
       refusal that just returns leaves it naming a layer the trait is not in,
       under a heading that says otherwise, and it stays there. Worse, changing
       it to that layer again fires no event at all, because the value is
       already what you would set it to.

       skins already holds an stfp trait called tan, and so does unsorted after
       this - a batch import landing a name the project already uses is exactly
       how unsorted fills up. planShelfMove refuses on name+layer+status. */
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await dbPut({ id: 't_tan_unsorted_stfp', kind: 'trait', name: 'tan',
        layer: 'unsorted', status: 'stfp', blob, w: 16, h: 16, rarity: 1,
        at: 1000, shelfOrder: 9999 });
      await renderFinal();
      await new Promise(r => setTimeout(r, 300));
    });
    await page.evaluate(() => {
      window.__realToast = window.toast; window.__said = [];
      window.toast = (m) => { window.__said.push(String(m)); };
      const item = [...document.querySelectorAll('#finallayers .item')]
        .find(i => i.title === 'tan' && i.closest('.layer').querySelector('h3')
          .textContent.startsWith('unsorted'));
      if (!item) throw new Error('no unsorted tan tile');
      const sel = item.querySelector('select.fslayer');
      sel.value = 'skins';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => {
      if (window.__realToast) window.toast = window.__realToast;
      const item = [...document.querySelectorAll('#finallayers .item')]
        .find(i => i.title === 'tan' && i.closest('.layer').querySelector('h3')
          .textContent.startsWith('unsorted'));
      return { shows: item ? item.querySelector('select.fslayer').value : 'the tile is gone',
        said: (window.__said || []).join(' | ') };
    });
    const where = await placement(page);
    expect(where.tan.sort(), 'neither copy moved').toEqual(['skins', 'unsorted']);
    expect(after.shows, 'and the control says where the trait actually is')
      .toBe('unsorted');
    expect(after.said, 'having said why').toMatch(/already has this trait/i);
  });

  test('ARROWING THROUGH THE LIST MAKES ONE MOVE, TO WHERE IT STOPPED',
    async ({ page }) => {
      /* A closed select in Chromium fires change on EVERY arrow key - measured
         here, four presses produced four change events, one per step. Acting on
         each ends the gesture at the FIRST of them: the handler shuts the
         control for the length of the move it just started, so the rest of the
         keypresses never reach it. Measured against exactly that build, these
         three presses moved the trait ONE layer, to eyes, and the app said
         "Moved loose to eyes" - the wrong answer with nothing on screen to
         contradict it.

         Which is why the count below is an assertion and not a setup line: the
         defect shows up first as a gesture that stopped being delivered, and
         counting the change events is the only thing that can see that. Where
         the trait ends up then pins that the one move it did make went to the
         layer the arrows stopped on. */
      const fired = await page.evaluate(() => {
        const item = [...document.querySelectorAll('#finallayers .item')]
          .find(i => i.title === 'loose');
        const sel = item.querySelector('select.fslayer');
        window.__realToast = window.toast; window.toast = () => {};
        window.__changes = 0;
        sel.addEventListener('change', () => { window.__changes++; });
        sel.focus();
        return [...sel.options].map(o => o.value);
      });
      expect(fired, 'unsorted is last, so every step goes backwards up the list')
        .toEqual(['backgrounds', 'skins', 'eyes', 'unsorted']);
      /* Up three, from unsorted to backgrounds, one keypress at a time. */
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      const changes = await page.evaluate(() => window.__changes);
      expect(changes, 'three steps really did fire three change events').toBe(3);
      await page.waitForTimeout(1400);
      await page.evaluate(() => { if (window.__realToast) window.toast = window.__realToast; });
      const where = await placement(page);
      /* Where it stopped, not where it first stepped. Without the settle this
         reads ['eyes'] - the first step - and the control would have shown
         backgrounds. */
      expect(where.loose).toEqual(['backgrounds']);
    });

  test('AND THE FOLD YOU ARE FILING OUT OF STAYS OPEN', async ({ page }) => {
    /* The gesture this whole feature is for: open "add from unsorted", file
       one trait, file the next. renderFinal rebuilds the page from nothing, so
       without carrying the open set across, the fold shuts under the cursor on
       every move and the traits still in it have to be found again. */
    await page.evaluate(async () => {
      const d = [...document.querySelectorAll('#finallayers details')]
        .find(x => x.querySelector('summary').textContent.includes('unsorted'));
      d.open = true; d.dispatchEvent(new Event('toggle'));
      await new Promise(r => setTimeout(r, 250));
    });
    const before = await page.evaluate(() => {
      const d = [...document.querySelectorAll('#finallayers details')]
        .find(x => x.dataset.layer === 'unsorted');
      return { open: d.open, tiles: d.querySelectorAll('.item').length };
    });
    expect(before, 'the fold is open with both waiting traits in it before the move')
      .toEqual({ open: true, tiles: 2 });
    await fileUnder(page, 'waiting', 'eyes');
    const after = await page.evaluate(() => {
      const d = [...document.querySelectorAll('#finallayers details')]
        .find(x => x.dataset.layer === 'unsorted');
      if (!d) return 'the unsorted fold is gone';
      return { open: d.open, tiles: d.querySelectorAll('.item').length,
        names: [...d.querySelectorAll('.item')].map(i => i.title) };
    });
    /* Still open, and still holding the one left to file - which is the whole
       gesture: file one, then the next, without hunting for the fold again. */
    expect(after).toEqual({ open: true, tiles: 1, names: ['spare'] });
  });

  test('and the control is big enough to hit on a phone', async ({ page }) => {
    /* The phone sweep in fixpagebehaves visits the fixer and settings pages
       only, so nothing in the suite measures this page at phone width - which
       is where a trait gets filed one-handed. 30px is the floor the rest of
       the app is held to, and the global rule that sets it is scoped to
       max-width:820px, so it does not apply until the viewport is narrow. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await page.evaluate(() => renderFinal());
    await page.waitForTimeout(350);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('#finallayers select.fslayer')].map(s => {
        const r = s.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }));
    expect(boxes.length, 'there are controls to measure').toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.h, 'tall enough for a thumb').toBeGreaterThanOrEqual(30);
      expect(b.w, 'and not squeezed out of the tile').toBeGreaterThan(40);
    }
  });
});
