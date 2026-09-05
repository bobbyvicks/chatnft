/* "Floods in from the border, so a white shirt in the middle stays."

   Clear background is on the front of the editor and makes a precise claim
   about its own algorithm: it removes colour REACHABLE FROM THE EDGE, not
   every pixel of that colour. The label beside it says the same thing a second
   way - "Only colour touching the border is removed".

   The failure it names is the one a plain "delete every white pixel" would
   produce, and it is quiet: the trait looks fine on a dark shelf tile and has
   a hole through the middle of it the moment it is composited over anything.

   THE FIXTURE IS THE CLAIM. A white border, a white shirt in the middle, and a
   dark body between them, so the shirt is the same colour as the background
   and is not reachable from any edge. If the tool deletes by colour, the shirt
   goes; if it floods, the shirt stays. Nothing about the two can be confused,
   because they are the same RGB.

   The second test is the other half nobody would notice missing: that the
   background actually goes. A tool that removed nothing at all would satisfy
   "the shirt stays" perfectly.
*/
import { test, expect } from '@playwright/test';

const WHITE = { r: 255, g: 255, b: 255 };
const BODY = { r: 40, g: 40, b: 60 };

/* A 24x24 character: white all round the edge, a dark ring inside it, and a
   white square in the very middle. */
const run = (page, opts) => page.evaluate(async (o) => {
  const S = 24;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  projectGrid = 160;
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));

  const d = new Uint8ClampedArray(S * S * 4);
  const put = (x, y, c) => {
    const i = (y * S + x) * 4;
    d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; d[i + 3] = 255;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const inRing = x >= 6 && x < 18 && y >= 6 && y < 18;
    const inShirt = x >= 10 && x < 14 && y >= 10 && y < 14;
    put(x, y, inShirt ? o.white : inRing ? o.body : o.white);
  }
  fileName = 'char';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));
  document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));

  const pix = () => {
    const c = document.createElement('canvas');
    c.width = art.width; c.height = art.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(art, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const at = (p, x, y) => {
    const i = (y * art.width + x) * 4;
    return { r: p[i], g: p[i + 1], b: p[i + 2], a: p[i + 3] };
  };
  const before = pix();
  /* Asserted, not assumed: the shirt and the background must really be the
     same colour, or this measures nothing at all. */
  const s0 = at(before, 12, 12), c0 = at(before, 0, 0);
  if (s0.r !== c0.r || s0.g !== c0.g || s0.b !== c0.b)
    throw new Error('the shirt is not the background colour, so the test is not the claim');
  if (s0.a === 0 || c0.a === 0) throw new Error('the fixture is not opaque to begin with');

  if (typeof o.tolerance === 'number') document.getElementById('bgtol').value = String(o.tolerance);
  const realToast = window.toast;
  window.toast = () => {};
  try {
    document.getElementById('debg').click();
    await new Promise(r => setTimeout(r, 600));
  } finally { window.toast = realToast; }

  const after = pix();
  let opaque = 0;
  for (let i = 3; i < after.length; i += 4) if (after[i] > 0) opaque++;
  return {
    corner: at(after, 0, 0),
    shirt: at(after, 12, 12),
    body: at(after, 7, 7),
    opaque,
  };
}, Object.assign({ white: WHITE, body: BODY }, opts));

test.describe('Clear background floods rather than deleting a colour', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
  });

  test('the white shirt in the middle stays', async ({ page }) => {
    /* The claim on the button, word for word. The shirt is the same RGB as the
       background and is not reachable from any edge. */
    const r = await run(page, {});
    expect(r.shirt.a, 'still opaque').toBeGreaterThan(0);
    expect([r.shirt.r, r.shirt.g, r.shirt.b], 'and still white').toEqual([255, 255, 255]);
  });

  test('while the background actually goes', async ({ page }) => {
    /* The half that would go unnoticed. A tool that removed nothing at all
       satisfies the test above perfectly. */
    const r = await run(page, {});
    expect(r.corner.a, 'the corner is gone').toBe(0);
  });

  test('and the body it surrounds is untouched', async ({ page }) => {
    const r = await run(page, {});
    expect(r.body.a).toBeGreaterThan(0);
    expect([r.body.r, r.body.g, r.body.b]).toEqual([40, 40, 60]);
  });

  test('the tolerance does not open a path through the body', async ({ page }) => {
    /* "Keep within" widens what counts as the same colour. At its maximum the
       flood still cannot cross the dark ring - the ring is 215 points away per
       channel - so the shirt survives even the most permissive setting. If it
       did not, the control would be a way to lose the middle of a trait by
       typing a bigger number. */
    const r = await run(page, { tolerance: 120 });
    expect(r.shirt.a, 'the shirt survives the widest tolerance').toBeGreaterThan(0);
    expect(r.corner.a, 'and the background still goes').toBe(0);
  });
});
