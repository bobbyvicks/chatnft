/* WHAT A TRAIT KEEPS WHEN ITS FILE MOVES, AND ONE ANSWER TO "WHICH COLOUR".

   Both found by sweeping the file for defects and verified by reading the
   code, not by trusting the report.

   A trait id encodes name, layer and status, so moving Hoodie.png from
   clothing/wip into clothing/approved on disk and re-importing writes a NEW
   record and deletes the old one - correctly, the old file is gone. What was
   missing is that the new record inherited nothing. The same-id replacement
   path carries shelfOrder, rarity and rowId across with some care; these two
   delete paths carried none of it, so approving forty traits by moving
   folders sent forty rarity weights back to the default.

   And patch450 moved "Change colours to palette" onto CIEDE2000 but left
   specCheck - what the agent panel prints - on squared RGB, so the panel
   named a repair the button would not perform.
*/
import { test, expect } from '@playwright/test';

const landing = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bulkImport === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    activeWs = null;
  });
  await page.waitForTimeout(250);
  await page.evaluate(async () => { try { await dbClear(); } catch (_) {} });
};

/* One PNG, handed to bulkImport the way a folder drop would, at the path
   that carries its layer and its status. `tint` decides the bytes, so two
   calls can be the same picture or deliberately different ones. */
const importOne = (page, path, tint) => page.evaluate(async ([path, tint]) => {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = tint; g.fillRect(0, 0, 32, 32);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], path.split('/').pop(), { type: 'image/png' });
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  await bulkImport([f]);
  await new Promise(r => setTimeout(r, 250));
}, [path, tint]);

const traits = (page) => page.evaluate(async () =>
  (await dbAll()).filter(r => r.kind === 'trait')
    .map(r => ({ id: r.id, status: r.status, rarity: r.rarity,
      shelfOrder: r.shelfOrder })));

test('A TRAIT APPROVED BY MOVING ITS FILE KEEPS ITS RARITY', async ({ page }) => {
  await landing(page);
  await importOne(page, 'clothing/wip/Hoodie.png', '#c87800');
  /* The weight somebody set in the rarity plan, and the place they dragged
     the tile to. Neither can be worked out again from the file. */
  await page.evaluate(async () => {
    const t = (await dbAll()).find(r => r.kind === 'trait');
    t.rarity = 7; t.shelfOrder = 300;
    await dbPut(t);
  });
  const before = await traits(page);
  expect(before.length).toBe(1);
  expect(before[0].id).toBe('t_Hoodie_clothing_wip');

  /* The ordinary way to approve a trait when the folder is the source of
     truth: move the file and import the folder again. */
  await importOne(page, 'clothing/approved/Hoodie.png', '#c87800');
  const after = await traits(page);
  expect(after.length, 'one trait went in and one is there').toBe(1);
  expect(after[0].id, 'under its new status').toBe('t_Hoodie_clothing_approved');
  expect(after[0].rarity, 'and it kept the weight it was given').toBe(7);
  expect(after[0].shelfOrder, 'and its place on the shelf').toBe(300);
});

test('and a renamed file merged onto its old record keeps it too', async ({ page }) => {
  await landing(page);
  await importOne(page, 'hats/approved/cap.png', '#3aa0ff');
  await page.evaluate(async () => {
    const t = (await dbAll()).find(r => r.kind === 'trait');
    t.rarity = 40; t.shelfOrder = 12;
    await dbPut(t);
  });
  /* The same picture under a new name. The import merges the old record away
     because the bytes match - one trait, renamed - and the weight belongs to
     the trait rather than to the filename. */
  await importOne(page, 'hats/approved/cap v2.png', '#3aa0ff');
  const after = await traits(page);
  expect(after.length, 'merged, not duplicated').toBe(1);
  expect(after[0].id).toBe('t_cap v2_hats_approved');
  expect(after[0].rarity).toBe(40);
  expect(after[0].shelfOrder).toBe(12);
});

test('and a weight the import just decided is never overwritten by an older one',
  async ({ page }) => {
    await landing(page);
    await importOne(page, 'clothing/wip/Hoodie.png', '#c87800');
    await page.evaluate(async () => {
      const t = (await dbAll()).find(r => r.kind === 'trait');
      t.rarity = 7; await dbPut(t);
    });
    /* THE CONTROL. Carrying is only ever into an empty field. A version that
       copied unconditionally would walk back over a value that was just set
       deliberately - and would do it every time a folder is re-imported. */
    await importOne(page, 'clothing/approved/Hoodie.png', '#c87800');
    await page.evaluate(async () => {
      const t = (await dbAll()).find(r => r.kind === 'trait');
      t.rarity = 55; await dbPut(t);
    });
    await importOne(page, 'clothing/rejected/Hoodie.png', '#c87800');
    const after = await traits(page);
    expect(after.length).toBe(1);
    expect(after[0].rarity, 'the newer decision stands').toBe(55);
  });

test('and a trait with no weight set does not gain one from nowhere',
  async ({ page }) => {
    await landing(page);
    await importOne(page, 'clothing/wip/Plain.png', '#c87800');
    await importOne(page, 'clothing/approved/Plain.png', '#c87800');
    const after = await traits(page);
    /* The other control: nothing is invented. An import that wrote a rarity
       onto every moved trait would look identical in the test above. */
    expect(after.length).toBe(1);
    expect(after[0].rarity).toBe(undefined);
  });

test('ONE ANSWER TO WHICH PALETTE COLOUR A TRAIT SHOULD BECOME', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof specCheck === 'function');
  const r = await page.evaluate(() => {
    const S = 8, d = new Uint8ClampedArray(S * S * 4);
    /* The dark green the perceptual metric was measured on: squared RGB sent
       it to a near-black and CIEDE2000 sends it to a dark green. */
    for (let i = 0; i < S * S; i++) {
      d[i * 4] = 0x00; d[i * 4 + 1] = 0x2d; d[i * 4 + 2] = 0x1e; d[i * 4 + 3] = 255;
    }
    const spec = specCheck(d, S, S, 'clothing');
    /* What the button would actually write, through the same bytes. */
    const copy = new Uint8ClampedArray(d);
    snapToPalette(copy, S * S);
    const wrote = '#' + [copy[0], copy[1], copy[2]]
      .map(v => v.toString(16).padStart(2, '0')).join('');
    return { named: spec.offPalette && spec.offPalette[0]
      ? spec.offPalette[0].nearest : null,
      distance: spec.offPalette && spec.offPalette[0]
        ? spec.offPalette[0].distance : null,
      wrote };
  });
  /* The panel names the repair and the button performs it. They were two
     different rules for one question, so the panel said #1c131d - a
     near-black - while the button wrote #264943. */
  expect(r.named, 'the report names a colour').toBeTruthy();
  expect(r.named, 'and it is the one the button writes').toBe(r.wrote);
  /* AND THE DISTANCE IS ON THE SCALE THE BUTTON REPORTS. It was a squared-RGB
     distance, which reads as a number with no meaning beside a dE. */
  expect(r.distance, 'a dE, not a distance in the RGB cube').toBeLessThan(40);
});

test('THE RARITY WEIGHT CAN BE TAPPED ON A TOUCH SCREEN', async ({ browser }) => {
  /* The per-tile fix button was placed "on the other corner" from the remove
     button, and the other corner already held the rarity input and the status
     dot. It is appended last and opaque, so it won the hit test: on a touch
     screen, where it shows without a hover, tapping a trait's weight sent the
     trait to Fix pixels instead - and the shelf has no other way to set one. */
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  const r = await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false); activeWs = null; await dbClear();
    const S = 64, c = document.createElement('canvas');
    c.width = S; c.height = S; c.getContext('2d').fillRect(0, 0, S, S);
    const blob = await new Promise(r2 => c.toBlob(r2, 'image/png'));
    c.width = 1; c.height = 1;
    for (const n of ['Hoodie', 'Cap'])
      await dbPut({ id: 't_' + n + '_clothing_wip', kind: 'trait', name: n,
        layer: 'clothing', status: 'wip', blob, w: S, h: S, at: Date.now() });
    await dbPut({ id: 'settings.layers', kind: 'settings',
      layers: ['clothing', 'unsorted'], hidden: [], at: 1 });
    showPage('project', false);
    await renderShelf();
    await new Promise(x => setTimeout(x, 600));
    const tile = document.querySelector('#projbody .item');
    /* ON SCREEN FIRST: elementFromPoint answers nothing for a point outside
       the viewport. Since patch559 a line above the shelf says when traits
       are left out for being wip, as these two are, and at 844 px that
       pushed the first tile below the fold - this read "nothing" with the
       weight box uncovered. */
    tile.scrollIntoView({ block: 'center' });
    await new Promise(x => setTimeout(x, 100));
    const rar = tile.querySelector('.rar');
    const fx = tile.querySelector('.fx');
    const b = rar.getBoundingClientRect();
    /* What actually answers at the middle of the weight box. */
    const at = document.elementFromPoint(Math.round(b.left + b.width / 2),
      Math.round(b.top + b.height / 2));
    const f = fx.getBoundingClientRect();
    const overlap = !(f.right <= b.left || f.left >= b.right
      || f.bottom <= b.top || f.top >= b.bottom);
    return {
      fxShown: getComputedStyle(fx).display !== 'none',
      hits: at ? (at.className || at.tagName) : 'nothing',
      overlap,
      fxTarget: Math.round(Math.min(f.width, f.height)),
    };
  });
  /* The precondition: on touch the fix button really is showing, so this is
     testing the collision rather than an absent element. */
  expect(r.fxShown, 'the fix button is there without a hover').toBe(true);
  expect(r.overlap, 'and it no longer covers the weight box').toBe(false);
  expect(r.hits, 'so the weight box is what answers at its own centre')
    .toContain('rar');
  /* And it did not shrink under the touch floor on the way. */
  expect(r.fxTarget).toBeGreaterThanOrEqual(30);
  await ctx.close();
});

test('and the tile still says its status, which is why the dot could go',
  async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false); activeWs = null; await dbClear();
      const S = 64, c = document.createElement('canvas');
      c.width = S; c.height = S; c.getContext('2d').fillRect(0, 0, S, S);
      const blob = await new Promise(r2 => c.toBlob(r2, 'image/png'));
      c.width = 1; c.height = 1;
      await dbPut({ id: 't_Crown_clothing_stfp', kind: 'trait', name: 'Crown',
        layer: 'clothing', status: 'stfp', blob, w: S, h: S, at: Date.now() });
      await dbPut({ id: 'settings.layers', kind: 'settings',
        layers: ['clothing', 'unsorted'], hidden: [], at: 1 });
      showPage('project', false);
      await renderShelf();
      await new Promise(x => setTimeout(x, 600));
      const tile = document.querySelector('#projbody .item');
      return { dots: tile.querySelectorAll('.st').length,
        cyc: tile.querySelector('.cyc').textContent };
    });
    /* The dot was 9px under an opaque 46px input from the day it was added, so
       it had never been seen - the stylesheet gave colours to wip, approved
       and rejected and never to stfp, which is what an invisible element
       looks like. The word on the cycle button is what people actually read,
       and it gets stfp right. */
    expect(r.dots, 'the dot that was never visible is gone').toBe(0);
    expect(r.cyc, 'and the tile still says the status').toBe('stfp');
  });
