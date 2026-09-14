/* GRAB A LAYER AND DRAG IT, AND TURN ONE OFF FROM THE SAME ROW.

   "i asked before about having it so that i could just grab and drag a layer
   (for making glasses go above skins and skins above background etc, rn it
   lags so much when you click one of the arrow that its a 20 minute job to
   change them around, also make it so that you can hide layers"

   The arrows move a layer one place per press, each press is its own write,
   and the row moves out from under the cursor every time - so crossing a
   list of nine is eight presses you have to re-aim between. A drag is one
   gesture and one write however far it goes.

   The set switch already existed on the shelf headings. This puts it on the
   row, which is where you are looking when you are thinking about what draws
   in front of what - the same HIDDEN_LAYERS and the same saveLayers, so
   there is one meaning of a set being off rather than two controls that can
   disagree.
*/
import { test, expect } from '@playwright/test';

const LAYERS = ['backgrounds', 'skins', 'clothing', 'glasses', 'hats', 'unsorted'];

const ready = async (page) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof buildLayerPanel === 'function');
  await page.evaluate(async (layers) => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    activeWs = null;
    await dbClear();
    const S = 64, c = document.createElement('canvas');
    c.width = S; c.height = S;
    c.getContext('2d').fillRect(0, 0, S, S);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    for (const l of layers)
      await dbPut({ id: 't_' + l + '_' + l + '_wip', kind: 'trait', name: l,
        layer: l, status: 'wip', blob, w: S, h: S, at: Date.now() });
    await dbPut({ id: 'settings.layers', kind: 'settings', layers, hidden: [], at: 1 });
    showPage('settings', false);
    await renderShelf();
  }, LAYERS);
  /* The panel is on the settings page, and a section that is not being laid
     out has no rows to drag - every measurement of this before the page was
     shown came back as a zero-sized box. */
  await expect(page.locator('#layerbody .lrow').first()).toBeVisible();
};

/* Top down, which is front first - the reverse of LAYERS. */
const shown = (page) => page.$$eval('#layerbody .lrow',
  rows => rows.map(r => r.dataset.layer));

/* A real pointer, moved in steps: one jump from start to finish fires a
   single pointermove and would pass a handler that only ever moves a row one
   place per event. */
const dragRow = async (page, from, to) => {
  const grip = page.locator('#layerbody .lrow[data-layer="' + from + '"] .lgrip');
  const target = page.locator('#layerbody .lrow[data-layer="' + to + '"]');
  const a = await grip.boundingBox();
  const b = await target.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const y0 = a.y + a.height / 2;
  /* PAST the target, not onto it. A row moves when the pointer crosses the
     MIDDLE of a neighbour, so stopping at that middle leaves it on the near
     side - which is the row landing one short of where it was aimed. */
  const up = b.y < a.y;
  const y1 = up ? b.y + 2 : b.y + b.height - 2;
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(a.x + a.width / 2, y0 + (y1 - y0) * (i / 12));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
};

test('A LAYER IS DRAGGED PAST THE OTHERS IN ONE GESTURE', async ({ page }) => {
  await ready(page);
  const before = await shown(page);
  /* unsorted is last in the list, so it draws in FRONT of everything - which
     is the thing that prompted this. Top of the panel is the front. */
  expect(before[0]).toBe('unsorted');
  expect(before[before.length - 1]).toBe('backgrounds');

  /* All the way across: backgrounds from the bottom of the panel to the top.
     With the arrows that is five presses, each one re-aimed. */
  await dragRow(page, 'backgrounds', 'unsorted');
  const after = await shown(page);
  expect(after[0], 'it went where it was dragged').toBe('backgrounds');
  /* AND NOTHING ELSE MOVED. A reorder that loses or repeats a layer is the
     one that matters: the layer is in every trait id and every rule. */
  expect(after.slice().sort()).toEqual(before.slice().sort());
  expect(after.length).toBe(before.length);

  /* THE DRAW ORDER, not just the rows. The panel is painted front-first and
     LAYERS runs back to front, so a drag that wrote the rows straight into
     LAYERS would reverse the whole collection silently. */
  const live = await page.evaluate(() => LAYERS.slice());
  expect(live).toEqual(after.slice().reverse());

  /* AND IT SURVIVES A RELOAD, which is what says it was written rather than
     only shown. */
  await page.reload();
  await page.waitForFunction(() => typeof buildLayerPanel === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    showPage('settings', false);
    await renderShelf();
  });
  await expect(page.locator('#layerbody .lrow').first()).toBeVisible();
  expect(await shown(page)).toEqual(after);
});

test('and one write for the whole drag, not one per row it passes', async ({ page }) => {
  await ready(page);
  const writes = await page.evaluate(() => {
    window.__saves = 0;
    const real = window.saveLayers;
    window.saveLayers = function () { window.__saves++; return real.apply(this, arguments); };
    return window.__saves;
  });
  expect(writes).toBe(0);
  await dragRow(page, 'backgrounds', 'unsorted');
  const saves = await page.evaluate(() => window.__saves);
  /* THE POINT OF THE WHOLE THING. Five arrow presses is five writes and five
     re-renders; this is one of each however far the row travels. */
  expect(saves, 'one write for the gesture').toBe(1);
});

test('and a press that moves nothing writes nothing', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.__saves = 0;
    const real = window.saveLayers;
    window.saveLayers = function () { window.__saves++; return real.apply(this, arguments); };
  });
  const before = await shown(page);
  const grip = page.locator('#layerbody .lrow[data-layer="clothing"] .lgrip');
  const a = await grip.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 2);
  await page.mouse.up();
  await page.waitForTimeout(300);
  /* THE CONTROL. Without the moved check every stray tap on the handle is a
     write, and in a group every write is a round trip. */
  expect(await page.evaluate(() => window.__saves), 'nothing moved, nothing saved').toBe(0);
  expect(await shown(page)).toEqual(before);
});

test('THE ARROWS STILL WORK', async ({ page }) => {
  await ready(page);
  const before = await shown(page);
  /* They are the keyboard path and the one that works without a precise
     pointer, so the drag is an addition and not a replacement. */
  await page.click('#layerbody .lrow[data-layer="backgrounds"] .lbtn[aria-label^="Move "]');
  await page.waitForTimeout(300);
  const after = await shown(page);
  expect(after.length).toBe(before.length);
  expect(after.indexOf('backgrounds'), 'one place towards the front')
    .toBe(before.indexOf('backgrounds') - 1);
});

test('A SET IS TURNED OFF FROM ITS OWN ROW', async ({ page }) => {
  await ready(page);
  const row = '#layerbody .lrow[data-layer="unsorted"]';
  expect(await page.locator(row + ' .leye').textContent()).toBe('on');
  await page.evaluate(() => { window.toast = () => {}; });
  await page.click(row + ' .leye');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    hidden: [...HIDDEN_LAYERS],
    label: document.querySelector('#layerbody .lrow[data-layer="unsorted"] .leye').textContent,
    pressed: document.querySelector('#layerbody .lrow[data-layer="unsorted"] .leye')
      .getAttribute('aria-pressed'),
    rowOff: document.querySelector('#layerbody .lrow[data-layer="unsorted"]')
      .classList.contains('off'),
    /* The shelf heading is the control this already had. Both read the one
       set, so turning it off here must turn it off there. */
    headingSaysOff: [...document.querySelectorAll('#projbody .layer')]
      .some(w => w.classList.contains('off')),
  }));
  expect(r.hidden, 'the one set every other screen reads').toEqual(['unsorted']);
  expect(r.label).toBe('off');
  expect(r.pressed).toBe('true');
  expect(r.rowOff, 'and the row says so').toBe(true);
  expect(r.headingSaysOff, 'the shelf heading agrees, because it is one set').toBe(true);

  /* AND IT COMES BACK ON. A toggle that only goes one way is a delete with a
     friendlier name. */
  await page.click(row + ' .leye');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => [...HIDDEN_LAYERS])).toEqual([]);
  expect(await page.locator(row + ' .leye').textContent()).toBe('on');
});

test('LAYERS IS THE FIRST THING ON SETTINGS, WITH RARITY UNDER IT', async ({ page }) => {
  await ready(page);
  /* "ive also asked for it to be at the top of settings with rarity below it
     and then the traits after" - it was under a changelog and a rule list. */
  const r = await page.evaluate(() => {
    const on = [...document.querySelectorAll('#land .pg-settings')]
      .filter(s => s.tagName === 'SECTION').map(s => s.id);
    const shelf = document.getElementById('proj');
    return { on, shelfOnSettings: shelf.classList.contains('pg-settings'),
      shelfVisible: shelf.getBoundingClientRect().height > 0 };
  });
  expect(r.on[0], 'layers first').toBe('layers');
  expect(r.on[1], 'then the rarity plan').toBe('plan');
  /* The traits are a page, not a section here - the shelf carries pg-project
     and the settings page hides it, so "after" is the next tab. Pinned so a
     later change that drags the shelf onto this page is a decision somebody
     makes rather than a thing that happens. */
  expect(r.shelfOnSettings).toBe(false);
  expect(r.shelfVisible).toBe(false);
});

test('and the handle does not scroll the page instead of dragging', async ({ page }) => {
  await ready(page);
  /* Without touch-action:none the browser claims the gesture as a scroll and
     the row never moves on a touch screen - the same trap the fix button on
     the shelf tiles walked into. */
  const touch = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#layerbody .lgrip')).touchAction);
  expect(touch).toBe('none');
});
