/* A TRAIT SHRUNK TO FIT THE CHARACTER WAS SAVED AS A SMALL FILE.

   "i need a save as x size option where it keeps the trait where it should be
   if it was on the base trait (thats what im lining it up to) so i can
   specifically save my traits as 1280x1280 rn when i shrink them it saves
   them as a smaller size"

   The base character is pinned to a footprint when it is attached and holds
   still after that, and the art canvas is centred on the same box - that is
   what makes lining a trait up work at all. So a trait shrunk to fit is a
   small picture in the middle of a 1280 square, and the save wrote the
   shrunken canvas: a 640 file that says nothing about where in the
   character's 1280 it belongs.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof saveCanvas === 'function');
};

/* Open a trait, optionally pin a base to its footprint, optionally shrink the
   canvas the way the Resize panel does, then save and read the file back. */
const run = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  projectGrid = 160;

  const S = o.open;
  const d = new Uint8ClampedArray(S * S * 4);
  /* A square of paint in the middle, so the placement has something to say. */
  const lo = Math.floor(S / 4), hi = S - lo;
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
    const i = (y * S + x) * 4;
    d[i] = 200; d[i + 1] = 40; d[i + 2] = 40; d[i + 3] = 255;
  }
  fileName = 'probe.png';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 200));

  if (o.base) {
    /* THROUGH THE REAL ATTACH, because pinning the footprint is what it does
       and a test that set basePin by hand would prove nothing about it. */
    const bc = document.createElement('canvas'); bc.width = 64; bc.height = 64;
    const bg = bc.getContext('2d');
    bg.fillStyle = 'rgb(20,90,200)'; bg.fillRect(0, 0, 64, 64);
    const bb = await new Promise(r => bc.toBlob(r, 'image/png'));
    await setBaseFromBlob(bb);
    await new Promise(r => setTimeout(r, 200));
  }

  if (o.shrink) {
    /* Art mode: the artwork and the canvas both come down, which is the mode
       the Resize panel opens on. */
    const op = resizeOp('art', ctx.getImageData(0, 0, art.width, art.height).data,
      art.width, art.height, o.shrink, o.shrink);
    art.width = op.w; art.height = op.h;
    ctx = art.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(new ImageData(new Uint8ClampedArray(op.data), op.w, op.h), 0, 0);
    resizeBoxes();
  }

  const box = document.getElementById('savesize');
  box.value = String(o.at === undefined ? 0 : o.at);
  box.dispatchEvent(new Event('input', { bubbles: true }));

  document.getElementById('tname').value = 'probe';
  document.getElementById('tlayer').value = 'skins';
  const realToast = window.toast;
  let said = '';
  window.toast = (m) => { said += String(m) + ' | '; };
  let ok;
  try { ok = await saveTrait(); } finally { window.toast = realToast; }
  if (!ok) throw new Error('the save was refused: ' + said);

  const rec = (await dbAll()).find(x => x.kind === 'trait' && x.name === 'probe');
  if (!rec) throw new Error('nothing was saved');
  const bm = await createImageBitmap(rec.blob);
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false; g.drawImage(bm, 0, 0);
  if (bm.close) bm.close();
  const W = cv.width, H = cv.height;
  const p = g.getImageData(0, 0, W, H).data;
  cv.width = 1; cv.height = 1;

  let x0 = W, y0 = H, x1 = -1, y1 = -1, base = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (p[i + 3] <= 8) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    /* Anything nearer the base's blue than the trait's red. */
    const db = Math.abs(p[i] - 20) + Math.abs(p[i + 1] - 90) + Math.abs(p[i + 2] - 200);
    const dt = Math.abs(p[i] - 200) + Math.abs(p[i + 1] - 40) + Math.abs(p[i + 2] - 40);
    if (db < dt) base++;
  }
  return { file: W + 'x' + H, recSize: rec.w + 'x' + rec.h,
    canvas: art.width + 'x' + art.height,
    paint: x1 < 0 ? null : (x1 - x0 + 1) + 'x' + (y1 - y0 + 1) + '@' + x0 + ',' + y0,
    basePixels: base, said, note: document.getElementById('savesizenote').textContent };
}, opts);

test('A TRAIT SHRUNK ONTO THE BASE IS SAVED ON THE BASE, NOT CROPPED TO ITSELF',
  async ({ page }) => {
    await ready(page);
    const r = await run(page, { open: 1280, base: true, shrink: 640 });
    /* The canvas really did come down - or the file being 1280 means nothing. */
    expect(r.canvas, 'the canvas on screen is the shrunken one').toBe('640x640');
    /* And the file is the footprint the trait is lined up against. */
    expect(r.file, 'the file is the base footprint').toBe('1280x1280');
    expect(r.recSize, 'and the shelf record says the same').toBe('1280x1280');
    /* THE PLACEMENT. The art was the middle half of a 1280 canvas; shrunk to
       640 it is the middle half of that, which is 320 across, and the 640
       canvas sits centred in the 1280 footprint at 320,320 - so the paint
       lands at 480 and is 320 wide. */
    expect(r.paint, 'the trait keeps its size and its place').toBe('320x320@480,480');
    /* And nothing of the character came with it. */
    expect(r.basePixels, 'no base pixel in the file').toBe(0);
  });

test('and with no base attached nothing changes at all', async ({ page }) => {
  await ready(page);
  /* THE CONTROL. The footprint is the canvas when there is no base, so this
     is the path every save took before and has to still take - a version that
     always padded to 1280 would pass the test above and quietly enlarge every
     trait in a project drawn at a smaller size. */
  const r = await run(page, { open: 1280, shrink: 640 });
  expect(r.canvas).toBe('640x640');
  expect(r.file, 'the canvas as it is').toBe('640x640');
  expect(r.paint, 'and the art where it is').toBe('320x320@160,160');
});

test('and a size typed in the box takes the whole thing to that size',
  async ({ page }) => {
    await ready(page);
    /* The second half of the ask: a width for anyone who wants one the base
       does not already give. Everything scales together, so the placement is
       the same picture at a different size. */
    const r = await run(page, { open: 1280, shrink: 640, at: 1280 });
    expect(r.file).toBe('1280x1280');
    expect(r.paint, 'the same picture, twice the size').toBe('640x640@320,320');
  });

test('and the box says what it will write before anything is pressed',
  async ({ page }) => {
    await ready(page);
    const r = await run(page, { open: 1280, base: true, shrink: 640 });
    /* A size box that only tells you what it did after it did it is the shape
       of every complaint on this tab so far. */
    expect(r.note).toContain('1280×1280');
    expect(r.note).toContain('the trait 640×640');
    expect(r.note).toContain('where it sits on the base');
  });

test('and the wrong-size warning is about the file, not the canvas',
  async ({ page }) => {
    await ready(page);
    /* 640 is not a whole multiple of 160 cells at 1280, and the file is 1280,
       which is. Warning about the canvas while the file is correct would put a
       false alarm on every single save of a shrunken trait. */
    const r = await run(page, { open: 1280, base: true, shrink: 640 });
    expect(r.said, 'the file is on the grid, so nothing is said')
      .not.toContain('not on the');
  });

test('but a file that really is off the grid is still named', async ({ page }) => {
  await ready(page);
  /* THE POSITIVE CONTROL for the line above. Without it, "says nothing" could
     mean the warning was removed rather than aimed at the right number. */
  const r = await run(page, { open: 1280, shrink: 600 });
  expect(r.file).toBe('600x600');
  expect(r.said, 'and it says which size it was').toContain('600×600');
  expect(r.said).toContain('not on the');
});

test('and the three downloads that promise not to rescale still do not',
  async ({ page }) => {
    await ready(page);
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      const S = 1280;
      const d = new Uint8ClampedArray(S * S * 4);
      for (let i = 0; i < S * S; i++) { d[i * 4] = 200; d[i * 4 + 3] = 255; }
      fileName = 'probe.png';
      startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
      await new Promise(r2 => setTimeout(r2, 200));
      const bc = document.createElement('canvas'); bc.width = 64; bc.height = 64;
      bc.getContext('2d').fillRect(0, 0, 64, 64);
      await setBaseFromBlob(await new Promise(r2 => bc.toBlob(r2, 'image/png')));
      const op = resizeOp('art', ctx.getImageData(0, 0, art.width, art.height).data,
        art.width, art.height, 640, 640);
      art.width = op.w; art.height = op.h;
      ctx = art.getContext('2d', { willReadFrequently: true });
      ctx.putImageData(new ImageData(new Uint8ClampedArray(op.data), op.w, op.h), 0, 0);
      document.getElementById('savesize').value = '0';
      /* The two side by side, on the same canvas, in the same moment. */
      const grid = (() => { const c = document.createElement('canvas');
        c.width = art.width; c.height = art.height; return c.width + 'x' + c.height; })();
      const saved = saveCanvas();
      const out = saved.width + 'x' + saved.height;
      return { grid, out, title: document.getElementById('dlNative').title };
    });
    /* Grid downloads the canvas; the project save writes the footprint. Two
       buttons, two jobs, and the one that promised not to rescale still says
       so in its own words. */
    expect(r.grid, 'Grid is still the canvas as it is').toBe('640x640');
    expect(r.out, 'and the save is the footprint').toBe('1280x1280');
    expect(r.title).toContain('at its own size, unscaled');
  });

/* ---- saving big, and keeping the pixels square ---------------------- */

/* "we should have an option to save to the highest resolution because 8x is
   so clear ... i need it to be crisper than crisp and high def/res"

   Measured on 1280 art in 8px blocks, reading run lengths along the middle
   row of the saved file:

     as it is  1280   every block 8
     2560      x2     every block 16
     3840      x3     every block 24
     4096      x3.2   blocks of 25 AND 26

   4096 is the ceiling the rest of the page draws, so asking for the biggest
   number was the one thing that came out not crisp. */

const openBlockArt = (page, S, cell) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  const c = document.createElement('canvas'); c.width = o.S; c.height = o.S;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < o.S / o.cell; y++) for (let x = 0; x < o.S / o.cell; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * o.cell, y * o.cell, o.cell, o.cell);
  }
  const d = g.getImageData(0, 0, o.S, o.S).data;
  c.width = 1; c.height = 1;
  fileName = 'probe.png';
  startEditor(new Uint8ClampedArray(d), o.S, o.S, o.S, o.S,
    palette(d, o.S * o.S, 24, 64), false);
  await new Promise(r => setTimeout(r, 250));
}, { S, cell });

/* The saved file at a given box value: its size, and the set of run lengths
   along the middle row - one entry means every art pixel is the same size. */
const savedAt = (page, side) => page.evaluate((v) => {
  const box = document.getElementById('savesize');
  box.value = String(v);
  box.dispatchEvent(new Event('input', { bubbles: true }));
  const c = saveCanvas();
  const g = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, H = c.height;
  const p = g.getImageData(0, 0, W, H).data;
  const y = Math.floor(H / 2), runs = [];
  let last = -1, n = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const k = p[i] + ',' + p[i + 1] + ',' + p[i + 2] + ',' + p[i + 3];
    if (k === last) n++; else { if (n) runs.push(n); last = k; n = 1; }
  }
  if (n) runs.push(n);
  c.width = 1; c.height = 1;
  return { out: W + 'x' + H,
    /* First and last run dropped: they run off the edge of the picture. */
    widths: [...new Set(runs.slice(1, -1))].sort((a, b) => a - b),
    note: document.getElementById('savesizenote').textContent };
}, side);

test('A WHOLE MULTIPLE KEEPS EVERY ART PIXEL THE SAME SIZE', async ({ page }) => {
  await ready(page);
  await openBlockArt(page, 1280, 8);
  const two = await savedAt(page, 2560);
  const three = await savedAt(page, 3840);
  expect(two.out).toBe('2560x2560');
  expect(two.widths, 'every block 16 across').toEqual([16]);
  expect(three.out).toBe('3840x3840');
  expect(three.widths, 'every block 24 across').toEqual([24]);
});

test('AND A SIZE THAT WOULD NOT IS TAKEN DOWN TO ONE THAT DOES',
  async ({ page }) => {
    await ready(page);
    await openBlockArt(page, 1280, 8);
    const r = await savedAt(page, 4096);
    /* WAS 4096x4096 with blocks of 25 and 26 - the one size that is not
       crisp, reached by asking for the biggest number there is. */
    expect(r.out, 'the whole multiple below it').toBe('3840x3840');
    expect(r.widths, 'and the pixels are all one size').toEqual([24]);
    /* Said before anything is pressed, with the reason. */
    expect(r.note).toContain('not 4096');
    expect(r.note).toContain('3.2×');
    expect(r.note).toContain('uneven');
  });

test('and a reduction is left alone, because that is a different question',
  async ({ page }) => {
    await ready(page);
    await openBlockArt(page, 1280, 8);
    /* THE CONTROL. Snapping everything to whole multiples would pass the two
       tests above and would quietly refuse to save anything smaller than the
       trait - half of what the box is for. */
    const r = await savedAt(page, 640);
    expect(r.out).toBe('640x640');
    expect(r.note, 'and it does not claim it moved anything').not.toContain('not 640');
  });

test('and Max fills in the biggest one that fits', async ({ page }) => {
  await ready(page);
  await openBlockArt(page, 1280, 8);
  const r = await page.evaluate(() => {
    document.getElementById('savemax').click();
    return { value: document.getElementById('savesize').value,
      note: document.getElementById('savesizenote').textContent };
  });
  /* 4096 is the ceiling the rest of the page draws, and 3 x 1280 is the
     largest whole multiple under it. */
  expect(r.value).toBe('3840');
  expect(r.note).toContain('3840×3840');
  /* Nothing to apologise for - it is exactly what was asked for. */
  expect(r.note).not.toContain('not ');
});
