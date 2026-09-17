/* A HALF TURN IS ONE TURN, AND A TURN THAT CHANGES NO SIZE KEEPS YOUR ZOOM.

   MEASURED before either was written. A 40x60 trait:

     rotateFree(180)
       undo depth     0 -> 2
       one undo       60 by 40   <- the art at 90 degrees, on a canvas it
                                    never had and is not going back to
       two undos      40 by 60
       said           "Turned a quarter right - now 60 by 40"
                      "Turned a quarter right - now 40 by 60"

   Pressing 180 ran rotateQuarter twice and each of those takes its own
   snapshot and says its own sentence. And:

     zoom at fit    12
     zoomed in to   36
     turned 37 degrees, canvas stays 40x60
     zoom now       12

   Both turn paths called fitZoom whatever happened. On a size change that is
   right; on no change there is nothing to refit. It bites hardest on the
   ordinary case, because this collection's traits are square and a quarter
   turn does not change their size either.

   THE CONTROLS. A turn that stopped refitting entirely would pass the zoom
   test and leave a grown canvas at a zoom chosen for a smaller one; a half
   turn that stopped turning would pass the undo test. Both are pinned.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* Asymmetric on both axes, so a half turn, a quarter turn and no turn at all
   are three different pictures. */
const DRAW = `
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [32, 64, 128]);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) set(x, y, [224, 192, 64]);
  for (let y = H - 4; y < H; y++) for (let x = 0; x < 4; x++) set(x, y, [200, 40, 40]);
`;

/* ART THAT DOES NOT FILL THE CANVAS, for the two refit controls only.

   DRAW above paints every pixel opaque, so contentBox covers the whole canvas
   and "fit the content" and "fit the canvas" are the SAME NUMBER. Both refit
   controls passed under a mutation that deleted the refit entirely, because
   the fixture could not tell the two apart - the second time that pair of
   assertions failed to see the defect they are named for. With the art in a
   corner the collapse is 9 against a correct 48. */
const CORNER = `
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) set(x, y, [224, 64, 64]);
`;

const bytes = (page) => page.evaluate(() =>
  Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join());

const turn = (page, deg) => page.evaluate(async (d) => {
  const said = []; const realToast = window.toast;
  window.toast = m => said.push(String(m));
  const depth = undoStack.length;
  rotateFree(d);
  await new Promise(x => setTimeout(x, 250));
  window.toast = realToast;
  return { said, steps: undoStack.length - depth,
    size: art.width + 'x' + art.height };
}, deg);

test.describe('turning a trait', () => {
  test('A HALF TURN IS ONE UNDO STEP', async ({ page }) => {
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const before = await bytes(page);
    const r = await turn(page, 180);
    expect(r.steps, 'one step, not two').toBe(1);
    expect(r.size, 'on the canvas it started on').toBe('40x60');
    const after = await page.evaluate(async () => {
      document.getElementById('undo').click();
      await new Promise(x => setTimeout(x, 250));
      return { d: Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join(),
        size: art.width + 'x' + art.height };
    });
    expect(after.size, 'and ONE undo comes back to the right size').toBe('40x60');
    expect(after.d, 'and to the right pixels').toBe(before);
  });

  test('AND IT SAYS SO, once', async ({ page }) => {
    /* It said "Turned a quarter right" twice - the first too fast to read and
       the second describing a turn nobody asked for. */
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const r = await turn(page, 180);
    expect(r.said.length, 'one message').toBe(1);
    expect(r.said[0]).toContain('180');
    expect(r.said[0]).not.toContain('quarter');
  });

  test('and it really is a half turn - the control', async ({ page }) => {
    /* Written out rather than composed from two quarters, so this is what
       says the arithmetic is right: every pixel at the opposite corner, and
       two halves are where you started. */
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const before = await bytes(page);
    await turn(page, 180);
    const half = await bytes(page);
    expect(half, 'a half turn changes the picture').not.toBe(before);
    /* The corner that was top-left is bottom-right. */
    const corners = await page.evaluate(() => {
      const g = ctx, W = art.width, H = art.height;
      const at = (x, y) => { const d = g.getImageData(x, y, 1, 1).data;
        return d[0] + ',' + d[1] + ',' + d[2]; };
      return { tl: at(0, 0), br: at(W - 1, H - 1), tr: at(W - 1, 0) };
    });
    /* THE MAPPING, WRITTEN OUT, because I got it wrong here first and
       asserted the red block landed top-LEFT. A half turn sends (x,y) to
       (W-1-x, H-1-y): the yellow block at the top left goes to the bottom
       right, and the red one at the BOTTOM left goes to the TOP right. The
       top left ends up holding whatever was at the far corner, which is
       background. */
    expect(corners.br, 'the yellow block is in the far corner now').toBe('224,192,64');
    expect(corners.tr, 'the red one crossed both axes').toBe('200,40,40');
    expect(corners.tl, 'and the corner they left is the background').toBe('32,64,128');
    await turn(page, 180);
    expect(await bytes(page), 'and two halves are where you started').toBe(before);
  });

  test('A TURN THAT CHANGES NO SIZE KEEPS THE ZOOM', async ({ page }) => {
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const r = await page.evaluate(async () => {
      const fit = zoom;
      zoom = fit * 3; resizeBoxes();
      await new Promise(x => setTimeout(x, 120));
      const set = zoom;
      const realToast = window.toast; window.toast = () => {};
      rotateFree(37);
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
      return { fit, set, after: zoom, size: art.width + 'x' + art.height,
        keeps: turnKeepsCanvas() };
    });
    expect(r.keeps, 'Keep size is the default, so the canvas does not move').toBe(true);
    expect(r.size).toBe('40x60');
    expect(r.set, 'somebody zoomed in').toBeGreaterThan(r.fit);
    expect(r.after, 'and is still zoomed in afterwards').toBe(r.set);
  });

  test('and a half turn keeps it too', async ({ page }) => {
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const r = await page.evaluate(async () => {
      const fit = zoom;
      zoom = fit * 3; resizeBoxes();
      await new Promise(x => setTimeout(x, 120));
      const set = zoom;
      const realToast = window.toast; window.toast = () => {};
      rotateFree(180);
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
      return { set, after: zoom };
    });
    expect(r.after).toBe(r.set);
  });

  test('AND A QUARTER TURN ON A SQUARE TRAIT KEEPS IT - the ordinary case',
    async ({ page }) => {
      /* Where this actually bit. Every trait in this collection is square, so
         a quarter turn does not change the canvas either - and the view went
         back to fit on every one of them. */
      await openTrait(page, { w: 64, h: 64, draw: DRAW });
      const r = await page.evaluate(async () => {
        const fit = zoom;
        zoom = fit * 3; resizeBoxes();
        await new Promise(x => setTimeout(x, 120));
        const set = zoom;
        const realToast = window.toast; window.toast = () => {};
        rotateFree(90);
        await new Promise(x => setTimeout(x, 300));
        window.toast = realToast;
        return { set, after: zoom, size: art.width + 'x' + art.height };
      });
      expect(r.size, 'a square trait is the same size after a quarter turn').toBe('64x64');
      expect(r.after).toBe(r.set);
    });

  test('but a turn that DOES change the size refits - the control',
    async ({ page }) => {
      /* Otherwise "keep the zoom" is just "never refit", which leaves a grown
         canvas at a zoom chosen for a smaller one and the art off the screen.
         Grow is what makes the canvas change at a free angle. */
      await openTrait(page, { w: 40, h: 60, draw: CORNER });
      const r = await page.evaluate(async () => {
        setChip('turncan', 'grow');
        const fit = zoom;
        zoom = fit * 3; resizeBoxes();
        await new Promise(x => setTimeout(x, 120));
        const set = zoom;
        const realToast = window.toast; window.toast = () => {};
        rotateFree(37);
        await new Promise(x => setTimeout(x, 300));
        const after = zoom;
        /* What a refit answers with the pixels actually on the canvas. */
        fitZoom();
        await new Promise(x => setTimeout(x, 100));
        const refit = zoom;
        window.toast = realToast;
        return { set, after, refit, fitBefore: fit, size: art.width + 'x' + art.height,
          keeps: turnKeepsCanvas() };
      });
      expect(r.keeps, 'Grow really is on').toBe(false);
      expect(r.size, 'so the canvas grew').not.toBe('40x60');
      /* THE VALUE, NOT "IT CHANGED". This asserted only .not.toBe(r.set),
         which a collapse satisfies as well as a correct refit - and that is
         exactly what happened: patch486 removed the refit from the turn paths
         believing restoreImage's was equivalent, and restoreImage refits TEN
         LINES BEFORE putImageData. fitZoom fits the CONTENT, so on a canvas
         resized and not yet painted it falls back to the whole canvas.
         Measured on an 80x40: zoom 48 before, 9 after, 48 when refitted with
         the pixels present. This test passed on the 9.

         Compared against what fitZoom answers NOW rather than a literal,
         because the number depends on the stage size. */
      expect(r.after, 'and the zoom fits the ART on the new canvas').toBe(r.refit);
      expect(r.after, 'which is not the collapse this test used to allow')
        .toBeGreaterThan(r.fitBefore / 2);
    });

  test('and a quarter turn on a NON-square trait refits - the other control',
    async ({ page }) => {
      await openTrait(page, { w: 80, h: 40, draw: CORNER });
      const r = await page.evaluate(async () => {
        const fit = zoom;
        zoom = fit * 3; resizeBoxes();
        await new Promise(x => setTimeout(x, 120));
        const set = zoom;
        const realToast = window.toast; window.toast = () => {};
        rotateFree(90);
        await new Promise(x => setTimeout(x, 300));
        const after = zoom;
        fitZoom();
        await new Promise(x => setTimeout(x, 100));
        const refit = zoom;
        window.toast = realToast;
        return { set, after, refit, size: art.width + 'x' + art.height };
      });
      expect(r.size, 'the canvas swapped').toBe('40x80');
      expect(r.after, 'so it refitted').not.toBe(r.set);
      /* AND TO THE RIGHT NUMBER. Measured on an 80x40 with the art in a
         corner, this came back 9 against a correct 48 for as long as the turn
         paths had no refit of their own. */
      expect(r.after, 'and to what fits the art, not the bare canvas').toBe(r.refit);
    });

  test('THE SELECTION COMES WITH A HALF TURN', async ({ page }) => {
    /* A half turn does not change the canvas size, so restoreImage never
       reaches selReset. Before this was written out as one turn it WAS two
       quarter turns, each of which changed the size and cleared the mask on
       the way past - so making it one turn left a selection pointing at pixels
       that had moved to the opposite corner, and Delete or a fill inside it
       hit artwork nobody chose.

       Carried rather than cleared: a selection is drawn around something, and
       the something moved. WHERE it lands is the assertion - a stale mask and
       a carried one hold the same number of cells. */
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const r = await page.evaluate(async () => {
      const box = () => {
        if (!selMask) return 'none';
        const W = art.width;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let i = 0; i < selMask.length; i++) if (selMask[i]) {
          const x = i % W, y = (i / W) | 0;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return x1 < 0 ? 'empty' : x0 + ',' + y0 + ' to ' + x1 + ',' + y1;
      };
      const m = new Uint8Array(art.width * art.height);
      for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) m[y * art.width + x] = 1;
      selSet(m);
      const before = box();
      const cells = selMask.reduce((a, b) => a + b, 0);
      const realToast = window.toast; window.toast = () => {};
      rotateFree(180);
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
      return { before, cells, after: box(),
        cellsAfter: selMask ? selMask.reduce((a, b) => a + b, 0) : null,
        size: art.width + 'x' + art.height };
    });
    expect(r.before, 'the selection starts in the top left').toBe('0,0 to 19,19');
    expect(r.cells).toBe(400);
    expect(r.size, 'a half turn changes no size, which is why selReset never fires')
      .toBe('40x60');
    /* (x,y) -> (W-1-x, H-1-y): 0..19 becomes 20..39 across, 40..59 down. */
    expect(r.after, 'and ends in the bottom right, with the artwork').toBe('20,40 to 39,59');
    expect(r.cellsAfter, 'nothing gained or lost on the way').toBe(400);
  });
});
