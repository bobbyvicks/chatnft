/* RESET TO ORIGINAL LEFT COLOURS THE ARTWORK NO LONGER HAS.

   MEASURED. A 40x60 trait of two colours, a block painted in a third, then
   Reset to original:

     before the edit   #204080 #e0c040
     after the edit    #204080 #20c060 #e0c040
     after Reset       #204080 #20c060 #e0c040
     #20c060 pixels left on the canvas    0

   The palette offered a colour that existed nowhere in the picture. Picking
   it paints with it; Replace matches nothing.

   THE POPULATION, ENUMERATED. Eight places put an ImageData back on the
   canvas: rotateQuarter and rotateHalf deliberately do not rebuild the list
   and say why (a permutation cannot change the set of colours), rotateFree
   calls repalette, both resize paths build it inline, undo and redo call
   repalette - and reset did nothing at all, on the line directly under them.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const DRAW = `
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [32, 64, 128]);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) set(x, y, [224, 192, 64]);
`;

const swatches = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex));

/* Paints a block in a colour the trait does not have, through the canvas
   rather than a tool, so this is about what Reset does and not about which
   tool was used. */
const paintNew = (page) => page.evaluate(async () => {
  snapshot();
  ctx.fillStyle = '#20c060'; ctx.fillRect(10, 10, 12, 12);
  repalette();
  await new Promise(x => setTimeout(x, 200));
});

const reset = (page) => page.evaluate(async () => {
  const realToast = window.toast; const said = [];
  window.toast = m => said.push(String(m));
  document.getElementById('reset').click();
  await new Promise(x => setTimeout(x, 350));
  window.toast = realToast;
  const d = ctx.getImageData(0, 0, art.width, art.height).data;
  let green = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i] === 0x20 && d[i + 1] === 0xc0 && d[i + 2] === 0x60) green++;
  return { said, green };
});

test.describe('Reset to original', () => {
  test('TAKES THE COLOURS WITH IT', async ({ page }) => {
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const before = await swatches(page);
    await paintNew(page);
    const edited = await swatches(page);
    /* The precondition: the edit really did put a new colour in the list, or
       the check below passes on a list that never changed. */
    expect(edited, 'the edit added a colour').toContain('#20c060');
    expect(before, 'which was not there before').not.toContain('#20c060');

    const r = await reset(page);
    expect(r.green, 'and Reset really did take it off the canvas').toBe(0);
    const after = await swatches(page);
    expect(after, 'so it is not offered any more').not.toContain('#20c060');
    expect(after, 'and the ones that are really there still are').toEqual(before);
  });

  test('and Replace stops matching it', async ({ page }) => {
    /* What the swatch is FOR. A colour in the list that is on no pixel is a
       Replace that reports nothing changed, and a paint colour the artwork
       never had. */
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    await paintNew(page);
    await reset(page);
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('#pal .sw')].filter(s => s.dataset.hex === '#20c060').length);
    expect(n).toBe(0);
  });

  test('and the artwork itself is what it was - the control', async ({ page }) => {
    /* Rebuilding a list is not the job. If Reset stopped restoring the pixels
       the list would be right for the wrong reason, and this file would say
       it was fixed. */
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    const before = await page.evaluate(() =>
      Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join());
    await paintNew(page);
    await reset(page);
    const after = await page.evaluate(() =>
      Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join());
    expect(after).toBe(before);
  });

  test('and it is still one undo step - the other control', async ({ page }) => {
    /* Reset takes a snapshot first, so it is undoable like anything else.
       A rebuild that crept in before the snapshot, or an extra one, would
       show up here. */
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    await paintNew(page);
    const r = await page.evaluate(async () => {
      const depth = undoStack.length;
      const realToast = window.toast; window.toast = () => {};
      document.getElementById('reset').click();
      await new Promise(x => setTimeout(x, 300));
      const steps = undoStack.length - depth;
      document.getElementById('undo').click();
      await new Promise(x => setTimeout(x, 250));
      window.toast = realToast;
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let green = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] === 0x20 && d[i + 1] === 0xc0 && d[i + 2] === 0x60) green++;
      const list = [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex);
      return { steps, green, list };
    });
    expect(r.steps, 'one step').toBe(1);
    expect(r.green, 'and undoing the reset brings the edit back').toBeGreaterThan(0);
    expect(r.list, 'with its colour').toContain('#20c060');
  });

  test('and it still says it happened', async ({ page }) => {
    await openTrait(page, { w: 40, h: 60, draw: DRAW });
    await paintNew(page);
    const r = await reset(page);
    expect(r.said.join(' ')).toContain('Reset to original');
  });
});
