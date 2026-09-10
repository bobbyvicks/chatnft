/* The brush matches the size the art was drawn at.

   "if the art is done with 10x10 pixels mostly make the brush that size."

   Everything for this existed and was not joined up. transitions() + period()
   measure the block size - the analyse screen prints it as "Block size 8.000
   px" - and gridBlock holds it. But gridBlock was set in exactly one place,
   the analyse screen's open-raw button, while startEditor resets it to 1 on
   every open. Opening a saved trait from the shelf measured nothing, so
   gridBlock stayed 1 and every stroke was one pixel on art drawn in tens.
   startEditor also called setBrush(1) unconditionally, so even where the block
   HAD been measured the brush ignored it: the only thing reading gridBlock for
   a tool was the outline's "snap: auto".

   THE PAIR THAT MATTERS is auto-follows versus a size somebody chose. A brush
   that re-matches the art on every open is right until the moment you
   deliberately pick 1px to fix a stray pixel - and then re-matching on the
   next trait is overruling you, 317 times in this collection. So the slider
   and the bracket keys turn following off, and the last two tests here are
   that half.

   MEASURED against real block art rather than a fixture that agrees with the
   code: 10x10 art gives a 10x10 brush, 8x8 gives 8, native art gives 1.
*/
import { test, expect } from '@playwright/test';

/* Art genuinely drawn in b x b blocks: every block one flat greyscale value,
   which is what the period measurement is looking for. Greyscale so nothing in
   the open path reads it as a base render and cleans it away. */
const openBlockArt = (page, b, cells) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const S = o.b * o.cells;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  let n = 7;
  for (let cy = 0; cy < o.cells; cy++) for (let cx = 0; cx < o.cells; cx++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    const v = 40 + (n % 170);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.fillRect(cx * o.b, cy * o.b, o.b, o.b);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_Probe_eyes_approved', kind: 'trait', name: 'Probe',
    layer: 'eyes', status: 'approved', blob, w: S, h: S, at: Date.now() });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
  const rec = (await dbAll()).find(r => r.kind === 'trait');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 200));
  return { canvas: S, block: gridBlock, brush: brush,
    label: document.getElementById('bsize').textContent, auto: brushAuto };
}, { b, cells });

test.describe('the brush matches the block size the art was drawn at', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof adoptBlock === 'function');
  });

  test('TEN PIXEL ART GETS A TEN PIXEL BRUSH', async ({ page }) => {
    // The ask, in the words it was asked in.
    const r = await openBlockArt(page, 10, 20);
    expect(r.block, 'the block size was measured').toBe(10);
    expect(r.brush, 'and the brush took it').toBe(10);
    expect(r.label).toBe('10×10');
  });

  test('and eight pixel art gets an eight pixel brush', async ({ page }) => {
    /* A second size, because a build that hard-coded ten would pass the test
       above. Eight is also the real collection: 1280 over a 160 grid. */
    const r = await openBlockArt(page, 8, 40);
    expect(r.block).toBe(8);
    expect(r.brush).toBe(8);
  });

  test('and art drawn pixel by pixel keeps a one pixel brush', async ({ page }) => {
    /* THE CONTROL. Below the existing 1.5 threshold the honest answer is
       native art - one cell is one pixel - and a bigger brush would be a
       guess. Without this, "always enlarge the brush" passes both tests
       above. */
    const r = await openBlockArt(page, 1, 40);
    expect(r.block).toBe(1);
    expect(r.brush).toBe(1);
  });

  test('at the real 1280 canvas too', async ({ page }) => {
    // The size every trait in the collection actually is.
    const r = await openBlockArt(page, 8, 160);
    expect(r.canvas).toBe(1280);
    expect(r.brush).toBe(8);
  });

  test('A SIZE YOU CHOSE HOLDS FOR THAT TRAIT, AND NOT PAST IT', async ({ page }) => {
    /* REVERSED, and the reversal is the point of this comment.

       This test used to be called "BUT A SIZE YOU CHOSE SURVIVES THE NEXT
       TRAIT" and read: "Picking 1px to fix a stray pixel and having the next
       open overrule you is the difference between a default and a nuisance -
       and in a 317-trait pass it is 317 nuisances."

       That is a fair worry and it was wrong about which way round the
       nuisance falls, because brushAuto had no way back. Nothing anywhere set
       it true again, so one nudge turned following off for the rest of the
       session - and startEditor resets the brush to 1 and leaves the setting
       to the caller that measured a block, so the traits after it did not
       even keep the chosen size. Measured before the change:

         open a 5px trait       block 10, brush 10x10
         nudge the slider to 3  block 10, brush  3x3
         open an 8px trait      block 16, brush  1x1

       317 traits at 1x1 on art drawn in eights and tens, which is what
       "its not making the brush size automatically the pixel size" is.

       What the old reasoning got right is kept: a size you pick is not
       overruled while you are working on the trait you picked it for. It
       stops being carried into the next picture, which is a different
       picture, and whose pixel size is a fact about it rather than a
       preference. */
    await openBlockArt(page, 10, 20);
    await page.evaluate(() => {
      const sl = document.getElementById('bslider');
      sl.value = '1';
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    });
    /* THE HALF THAT STILL HOLDS: on this trait, the choice stands. */
    expect(await page.evaluate(() => ({ brush, auto: brushAuto })))
      .toEqual({ brush: 1, auto: false });
    const r = await openBlockArt(page, 8, 40);
    expect(r.block, 'the art is still measured').toBe(8);
    expect(r.brush, 'and the next picture gets its own pixel size').toBe(8);
    expect(r.auto, 'following starts again with a new picture').toBe(true);
  });

  test('and the bracket keys count as choosing too', async ({ page }) => {
    /* stepBrush is the other way a size gets picked on purpose. Leaving it out
       would make the keys silently temporary while the slider was permanent. */
    await openBlockArt(page, 10, 20);
    await page.evaluate(() => stepBrush(-1));
    const after = await page.evaluate(() => ({ brush, auto: brushAuto }));
    expect(after.auto, 'the keys turned following off').toBe(false);
    expect(after.brush).toBe(9);
  });

  test('and a measurement that throws does not stop the trait opening',
    async ({ page }) => {
      /* This now runs on every open, so it must be unable to take the editor
         down with it.

         BOTH MEASUREMENTS ARE STUBBED. There are two now: fixNativeBlock is
         asked first and answers exactly where the art has a grid, and this
         fixture is 10px block art, so breaking only the detector no longer
         reaches the throw at all - the test went green for a reason that had
         nothing to do with what it is about. */
      await page.evaluate(() => {
        window.__realT = transitions; window.__realN = fixNativeBlock;
        transitions = () => { throw new Error('boom'); };
        fixNativeBlock = () => { throw new Error('boom'); };
      });
      const r = await openBlockArt(page, 10, 20);
      expect(r.block, 'fell back to native').toBe(1);
      expect(r.brush).toBe(1);
      await page.evaluate(() => {
        transitions = window.__realT; fixNativeBlock = window.__realN;
      });
      const back = await openBlockArt(page, 10, 20);
      expect(back.brush, 'and it measures again once it can').toBe(10);
    });
});
