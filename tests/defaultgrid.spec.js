/* WHAT PIXEL SIZE 0 MEANS: REFINE ONTO THE COLLECTION'S GRID, NEVER COARSEN.

   The default used to follow the picture's own grid whatever it was, which
   left art drawn at 10px on 128 cells - a 10px block on the 1280 canvas,
   which the collection's gate refuses - at the tab's own default. Forcing
   everything onto 160 cells instead destroys art drawn FINER than a cell:
   measured on the real traits, hats/Make Solana Great Again Hat is drawn at
   5px, loses 0.97% of its pixels at 8px with an iou of 0.9801, and its
   lettering comes out unreadable. No number in the tab can see that.

   So the line is the collection's cell, and the direction decides:
     coarser than the cell and not a multiple of it (10px, 20px) -> re-cut
       onto the grid, which RAISES the cell count, and say which size gives
       the picture's own blocks back;
     on the cell or a whole multiple of it (8px, 16px) -> keep;
     finer than the cell (5px, 4px, 2px) -> keep, and the gate clause says
       it is not ready;
     no block structure at all -> unchanged, the gridless search decides;
     smaller than the grid -> unchanged, never upsample.

   Every fixture here is a real block size drawn at 1280, and each test
   names the canvas block it is about - the source block and the canvas
   block differ the moment the source is not 1280 (1024 drawn at 8px is
   10px on the canvas), and the gate only ever sees the canvas. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixStepFor === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* W across, drawn in whole `block` squares of four palette colours, with a
   transparent corner so the silhouette has an edge to keep. */
const art = (W, block) => `
  const W = ${W}, B = ${block}, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pal = paletteRGB();
  const pick = [pal[3], pal[17], pal[80], pal[200]].map(p => [p.r, p.g, p.b]);
  const im = g.createImageData(W, W), d = im.data;
  const cells = W / B;
  for (let by = 0; by < cells; by++) for (let bx = 0; bx < cells; bx++) {
    if (bx < cells / 8 && by < cells / 8) continue;
    const k = pick[(bx * 5 + by * 3) % pick.length];
    for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) {
      const i = (y * W + x) * 4; d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
`;

const single = (page, src, typed) => page.evaluate(async ({ src, typed }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'g.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  const sn = document.getElementById('fixsnap'); sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
  const gr = document.getElementById('fixgrid'); gr.checked = true; gr.dispatchEvent(new Event('change', { bubbles: true }));
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(typed || 0);
  f.dispatchEvent(new Event('input', { bubbles: true }));
  const hint = document.getElementById('fixsize').textContent;
  const r = await fixRun();
  window.toast = realToast;
  f.value = '0';
  return { hint, said: document.getElementById('fixout').textContent, cells: r && r.width, native: FIX.native, gate: fixGateOf(r) };
}, { src, typed });

test.describe('what Pixel size 0 means', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('10px BLOCKS ARE RE-CUT ONTO THE GRID, and the run says which size keeps them', async ({ page }) => {
    const r = await single(page, art(1280, 10), 0);
    expect(r.native, 'the fixture really is drawn at 10px').toBe(10);
    expect(r.cells, 'not its own 128 cells').toBe(160);
    expect(r.said).toContain('measured 10px blocks off the picture and re-cut them on the 160 cell grid - type 10 to keep them');
    expect(r.gate.ready, 'and that is what makes it collection-ready').toBe(true);
    expect(r.hint, 'the readout says it before the run too').toContain('10px blocks re-cut on the 160 cell grid - type 10 to keep them');
  });

  test('and typing 10 hands it its own blocks back', async ({ page }) => {
    /* THE ESCAPE HATCH THE RULE PROMISES. If this fails the rule is a trap. */
    const r = await single(page, art(1280, 10), 10);
    expect(r.cells).toBe(128);
    expect(r.said).not.toContain('re-cut them on the 160 cell grid');
    expect(r.gate.ready, 'its 10px blocks are not the collection\'s 8px cells').toBe(false);
  });

  test('8px BLOCKS ARE KEPT, untouched - the control', async ({ page }) => {
    const r = await single(page, art(1280, 8), 0);
    expect(r.cells).toBe(160);
    expect(r.said).toContain('measured 8px blocks off the picture');
    expect(r.said).not.toContain('re-cut');
    expect(r.gate.ready).toBe(true);
  });

  test('and so are 16px blocks, because 16 is two whole cells', async ({ page }) => {
    /* The gate asks whether every 8px block is one colour, which 16px art
       satisfies. A rule that tested "is it exactly 8" would re-cut this for
       nothing. */
    const r = await single(page, art(1280, 16), 0);
    expect(r.cells).toBe(80);
    expect(r.said).toContain('measured 16px blocks off the picture');
    expect(r.said).not.toContain('re-cut');
    expect(r.gate.ready).toBe(true);
  });

  test('5px BLOCKS ARE KEPT, because the grid is coarser than they are', async ({ page }) => {
    /* The measured case this rule exists to protect: forcing 5px art onto
       8px cells is a reduction, and on the real hats/Make Solana Great Again
       Hat it makes the lettering unreadable while losing under 1% of the
       pixels - invisible to every number the tab has. */
    const r = await single(page, art(1280, 5), 0);
    expect(r.cells).toBe(256);
    expect(r.said).toContain('measured 5px blocks off the picture');
    expect(r.said).not.toContain('re-cut');
    expect(r.gate.ready, 'and the run says it cannot go in as it is').toBe(false);
    expect(r.said).toContain('not ready for the collection: its 8px blocks are not one colour');
  });

  test('THE CANVAS BLOCK DECIDES, NOT THE SOURCE BLOCK: 1024 drawn at 8px is 10px on the canvas', async ({ page }) => {
    /* 1024/8 = 128 cells, and 1280/128 = 10. The blocks are 8px in the file
       and 10px in the saved picture, and the gate only sees the saved one. */
    const r = await single(page, art(1024, 8), 0);
    expect(r.native).toBe(8);
    expect(r.cells).toBe(160);
    expect(r.said).toContain('measured 10px blocks off the picture and re-cut them');
    expect(r.gate.ready).toBe(true);
  });

  test('A PICTURE WITH NO BLOCK STRUCTURE IS LEFT TO THE SEARCH', async ({ page }) => {
    /* The search already prefers the collection's grid and only takes a finer
       count where it has MEASURED that 160 loses the shape or the paint.
       gridless.spec.js pins what happens when that measurement is overridden. */
    const gridless = `
      const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      const im = g.createImageData(W, W), d = im.data;
      for (let y = 200; y < 1080; y++) for (let x = 200; x < 1080; x++) {
        const i = (y * W + x) * 4;
        d[i] = 120 + ((x * 7 + y * 13) & 15); d[i + 1] = 80 + ((x + y) & 7); d[i + 2] = 200 - ((x * 3) & 15); d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    `;
    const r = await single(page, gridless, 0);
    expect(r.native, 'no block structure').toBe(0);
    expect(r.said).toContain('no pixel grid found');
    expect(r.said).not.toContain('re-cut them on the');
  });
});
