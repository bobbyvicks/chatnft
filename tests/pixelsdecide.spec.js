/* A DRAFT IS SKIPPED ONLY WHEN THE PIXELS MATCH.

   autosaveNow used to decide "nothing changed" from the undo depth:

     if(of && undoStack.length===savedDepth) return Promise.resolve(true);

   That is sound for the case its comment argues - a fresh open, where
   startEditor empties the stack, so a non-empty one really does mean edited.
   saveTrait then set savedDepth to undoStack.length, which put the same
   equality in front of a case nobody had argued, and the depth is not an edit
   counter in either direction. Undo makes it SMALLER. snapshot() caps it, so
   past saturation it stops growing at all. Both let the canvas differ from the
   record while the number said it did not, and the draft was silently skipped.

   The first two tests here are those two routes. The controls after them are
   the point: the guard still has to REFUSE for an untouched canvas, or every
   open would leave a draft identical to the record and the next open would
   announce unsaved changes that do not exist - which is what the guard was
   written for in the first place.
*/
import { test, expect } from '@playwright/test';

/* One saved trait, plain grey so nothing in the open path reads it as a base
   render and cleans it away. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(90,90,90)'; g.fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_Alpha_eyes_approved', kind: 'trait', name: 'Alpha',
    layer: 'eyes', status: 'approved', blob, w: 16, h: 16, at: 1000 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

const openAlpha = (page) => page.evaluate(async () => {
  const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === 'Alpha');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 150));
});

/* A stroke, pushed onto the undo stack the way a real one is. */
const paint = (page, rgb) => page.evaluate(async (c) => {
  snapshot();
  ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
  ctx.fillRect(0, 0, 4, 4);
}, rgb);

/* saveTrait toasts, and a toast in a test is noise rather than signal. */
const save = (page) => page.evaluate(async () => {
  const realToast = window.toast; window.toast = () => {};
  try { await saveTrait(); } finally { window.toast = realToast; }
});

const draftRows = (page) => page.evaluate(async () =>
  (await dbAll()).filter(r => r.kind === 'autosave')
    .map(r => ({ id: r.id, w: r.w, h: r.h })));

/* What a draft would actually restore, rather than merely that a row exists.
   A row carrying the pre-edit pixels passes a count and loses the work. */
const draftCorner = (page) => page.evaluate(async () => {
  const rec = (await dbAll()).find(r => r.kind === 'autosave');
  if (!rec) return null;
  const bmp = await createImageBitmap(rec.blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c.getContext('2d').getImageData(0, 0, 1, 1).data[0];
});

test.describe('a draft is skipped only when the pixels match', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await seed(page);
  });

  test('AFTER A SAVE, AN UNDO AND A REDRAW IS STILL KEPT', async ({ page }) => {
    /* Route one. Save at depth d, press undo (d-1), draw one replacement
       stroke (d): equal to savedDepth again, and the canvas is nothing like
       the record. saveTrait has just deleted this trait's draft keys, so there
       was nothing underneath to fall back to either. */
    await openAlpha(page);
    await paint(page, 200);
    await save(page);
    await page.evaluate(async () => {
      $('undo').click();
      snapshot();
      ctx.fillStyle = 'rgb(240,240,240)'; ctx.fillRect(0, 0, 4, 4);
      await autosaveNow();
    });
    expect(await draftRows(page), 'the redrawn stroke is kept').toHaveLength(1);
    expect(await draftCorner(page), 'and it is the REDRAWN pixels, not the undone ones')
      .toBe(240);
  });

  test('AND A SAVE ON A SATURATED UNDO STACK DOES NOT STOP THE DRAFTS',
    async ({ page }) => {
      /* Route two, and the worse of the pair: past the cap the depth is a
         constant, so once a save lands on a saturated stack EVERY later stroke
         reads as unchanged and the trait is never drafted again. */
      await openAlpha(page);
      const capped = await page.evaluate(() => {
        for (let i = 0; i < 70; i++) { snapshot(); ctx.fillRect(0, 0, 1, 1); }
        return undoStack.length;
      });
      expect(capped, 'the stack really is saturated, or this tests nothing')
        .toBe(60);
      await save(page);
      await page.evaluate(async () => {
        const before = undoStack.length;
        snapshot();
        ctx.fillStyle = 'rgb(9,250,9)'; ctx.fillRect(0, 0, 4, 4);
        window.__depthHeldStill = (undoStack.length === before);
        await autosaveNow();
      });
      expect(await page.evaluate(() => window.__depthHeldStill),
        'the precondition: a stroke that left the depth exactly where it was')
        .toBe(true);
      expect(await draftRows(page), 'and it is still drafted').toHaveLength(1);
      expect(await draftCorner(page)).toBe(9);
    });

  test('a trait opened and closed without a stroke leaves no draft - the control',
    async ({ page }) => {
      /* The behaviour the guard exists for. If this goes red the fix has
         traded one silent lie for another: every open would leave a draft
         identical to the record, and the next open would announce unsaved
         changes that were never made. */
      await openAlpha(page);
      await page.evaluate(async () => { await autosaveNow(); });
      expect(await draftRows(page)).toHaveLength(0);
    });

  test('and work undone back to exactly the saved pixels leaves no draft',
    async ({ page }) => {
      /* The control the old guard could not have passed for the right reason,
         and the new one passes for the right reason: the depth is back to
         where it started AND so are the pixels. Paired with the test above it
         says the guard is reading the canvas, not the bookkeeping. */
      await openAlpha(page);
      await paint(page, 200);
      await page.evaluate(async () => {
        $('undo').click();
        await autosaveNow();
      });
      expect(await page.evaluate(() => ctx.getImageData(0, 0, 1, 1).data[0]),
        'the canvas really is back at the saved pixels').toBe(90);
      expect(await draftRows(page)).toHaveLength(0);
    });

  test('THE SAME PIXELS AT A DIFFERENT SIZE ARE NOT THE SAME CANVAS',
    async ({ page }) => {
      /* The size is folded into the signature BEFORE the pixels, and this is
         the case that needs it: 16x16 and 256x1 hold the same 256 words in the
         same order, so a signature over the pixels alone cannot tell them
         apart and the draft is skipped for a canvas that changed shape.

         A first version of this test grew 16x16 to 24x24 with the artwork in
         the corner. That passes against the OLD undo-depth guard and against a
         signature with no size in it, because padding changes the word
         sequence anyway - it asserted nothing. This one fails if the size
         comes out of canvasSig, which is what makes it evidence. */
      await openAlpha(page);
      const samePixels = await page.evaluate(async () => {
        const im = ctx.getImageData(0, 0, 16, 16);
        const flat = new ImageData(new Uint8ClampedArray(im.data), 256, 1);
        snapshot();
        restoreImage(flat);
        await autosaveNow();
        return true;
      });
      expect(samePixels).toBe(true);
      const rows = await draftRows(page);
      expect(rows, 'the reshape is drafted').toHaveLength(1);
      expect(rows[0].w, 'at the shape it actually is now').toBe(256);
      expect(rows[0].h).toBe(1);
    });
});
