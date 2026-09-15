/* WHAT IS ON SCREEN LINES UP WITH THE ARTWORK UNDER IT.

   THE RESTORED-DRAFT BAR named no grid-area. .app is a named-area grid and
   every other child claims one, so the bar auto-placed into an implicit sixth
   row - below the footer, not under the header where the markup puts it. Worse,
   column one is an `auto` track, so it was then sized by the bar's own
   max-content width and the canvas lost exactly that much. Measured at
   1280x900 through the real path: stage 1105px -> 710px, rail 175px -> 570px.

   THE PIXEL NUMBERS MOVE WITH THE CLOCK, which is why none is asserted here.
   The bar's text carries a wall-clock time - "Unsaved changes from 9:05 AM" -
   so the width it inflates the column to depends on the hour. What is asserted
   is the relation: the bar sits above the stage, and the stage does not shrink
   when it appears.

   ZOOMING left the text, Adjust and Pixel-QA previews at the old scale. Each is
   drawn at the art's pixel resolution and stretched to art.width*zoom by
   whoever draws it, and each is absolutely positioned at the frame's top-left -
   so one left at the old size is anchored right and drawn wrong, every pixel in
   it displaced by its own distance from that corner.
*/
import { test, expect } from '@playwright/test';

/* Two saved traits with different pixels, so a draft is distinguishable from
   the record it belongs to. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 80; c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 80, 80);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  for (const [n, v] of [['Alpha', 90], ['Beta', 150]])
    await dbPut({ id: 't_' + n + '_eyes_approved', kind: 'trait', name: n,
      layer: 'eyes', status: 'approved', blob: await png(v), w: 80, h: 80, at: 1000 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

const openByName = (page, name) => page.evaluate(async (n) => {
  const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === n);
  const realToast = window.toast; window.toast = () => {};
  try { await openTraitRecord(rec); } finally { window.toast = realToast; }
  await new Promise(r => setTimeout(r, 200));
}, name);

const layout = (page) => page.evaluate(() => {
  const bar = $('draftbar'), st = document.querySelector('.stage'),
    ft = document.querySelector('footer'), nv = document.querySelector('nav.tools');
  const box = (el) => { const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  return { barHidden: bar.hidden, bar: box(bar), stage: box(st),
    footer: box(ft), rail: box(nv),
    area: getComputedStyle(bar).gridArea };
});

test.describe('what is on screen lines up with the art', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await seed(page);
  });

  test('THE DRAFT BAR SITS UNDER THE HEADER AND COSTS THE CANVAS NOTHING',
    async ({ page }) => {
      /* The real path: edit Alpha, open Beta without saving, come back. */
      await openByName(page, 'Alpha');
      const before = await layout(page);
      expect(before.barHidden, 'no bar before there is a draft').toBe(true);
      await page.evaluate(async () => {
        snapshot();
        ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0, 0, 8, 8);
        await autosaveNow();
      });
      await openByName(page, 'Beta');
      await openByName(page, 'Alpha');
      const after = await layout(page);
      /* The precondition. Without the bar actually up, everything below is a
         measurement of nothing. */
      expect(after.barHidden, 'the draft really was restored').toBe(false);
      expect(after.bar.h, 'and the bar has a height').toBeGreaterThan(0);
      /* ABOVE the stage, not below the footer. */
      expect(after.bar.y + after.bar.h, 'the bar ends where the stage begins or above it')
        .toBeLessThanOrEqual(after.stage.y);
      expect(after.bar.y, 'and well above the footer').toBeLessThan(after.footer.y);
      /* AND THE CANVAS KEEPS ITS WIDTH. A threshold rather than equality, and
         not because the measurement is shaky - because a few pixels ARE
         expected. The tool rail is documented to wrap to the columns its
         height forces, and the bar takes 50px of height, so the rail can need
         one more column and take a few pixels with it. Measured in a browser
         at 1280x900: stage 1105 -> 1101 with the fix, against 1105 -> 710
         without it. Anything in between is not a thing this can produce.

         No absolute pixel count either: the bar carries a wall-clock time, so
         the width it used to steal depends on the hour it is run. */
      expect(before.stage.w - after.stage.w,
        'the stage lost the rail wrap at most, not a third of itself')
        .toBeLessThan(40);
      expect(after.rail.w - before.rail.w,
        'and the tool rail did not inflate to fit the bar')
        .toBeLessThan(40);
    });

  test('and it claims the row rather than landing wherever there is space',
    async ({ page }) => {
      /* The mechanism, named. A future child of .app that also forgets its
         area would reproduce this exactly, and "draft / draft / draft / draft"
         is what says this one did not. */
      await openByName(page, 'Alpha');
      const l = await layout(page);
      expect(l.area.split('/').map(s => s.trim())[0]).toBe('draft');
    });

  test('A ZOOM TAKES THE TEXT PREVIEW WITH IT', async ({ page }) => {
    await openByName(page, 'Alpha');
    const out = await page.evaluate(async () => {
      /* The text tool builds its preview at the current zoom. */
      selectTool('text');
      $('txtext').value = 'AB';
      textBuild(); textDraw();
      await new Promise(r => setTimeout(r, 60));
      const pv = $('txpv');
      const was = { art: art.style.width, pv: pv.style.width, zoom };
      setZoom(zoom * 2);
      await new Promise(r => setTimeout(r, 60));
      return { was, art: art.style.width, pv: pv.style.width,
        shown: pv.style.display, zoom };
    });
    /* The precondition: a preview that was never up cannot be misaligned. */
    expect(out.shown, 'the preview is showing').not.toBe('none');
    expect(out.was.pv, 'and it had a size before the zoom').toBe(out.was.art);
    expect(out.zoom, 'the zoom really changed').toBeGreaterThan(out.was.zoom);
    expect(out.pv, 'the preview is the size of the art it sits on').toBe(out.art);
  });

  test('and so does the Adjust preview', async ({ page }) => {
    await openByName(page, 'Alpha');
    const out = await page.evaluate(async () => {
      const pv = $('fxpv');
      /* Drawn the way the Adjust panel draws it, at the current zoom. */
      pv.width = art.width; pv.height = art.height;
      pv.style.width = (art.width * zoom) + 'px';
      pv.style.height = (art.height * zoom) + 'px';
      pv.style.display = 'block';
      setZoom(zoom * 2);
      await new Promise(r => setTimeout(r, 60));
      return { art: art.style.width, pv: pv.style.width };
    });
    expect(out.pv).toBe(out.art);
  });

  test('and a preview that was never drawn is left alone - the control',
    async ({ page }) => {
      /* Sizing a canvas nobody has drawn would give it a size it never had,
         and #qapv is display:none with width 0 until a scan runs. */
      await openByName(page, 'Alpha');
      const out = await page.evaluate(async () => {
        const pv = $('qapv');
        pv.width = 0; pv.style.width = ''; pv.style.display = 'none';
        setZoom(zoom * 2);
        await new Promise(r => setTimeout(r, 60));
        return { pv: pv.style.width, display: pv.style.display };
      });
      expect(out.pv, 'it was not given one').toBe('');
    });
});
