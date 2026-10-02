/* THE RUN SAYS WHAT CHANGED, AND NOTHING IT CANNOT KNOW (patch626).

   The owner, 2026-09-25: "the backrounds arent going great in fix pallete".
   Every one of the 47 saved backgrounds was told it "kept 100% of the paint"
   and was "ready for the collection" whatever happened to it: the paint count
   is alpha only, so on a picture painted edge to edge it is 100 by
   construction, and the palette clause gave only the single furthest move, a
   maximum with no area. Asked "say how much of the picture plainly changed
   colour?" the owner said "5 yes".

   Each positive claim has a control one thing away, so a clause printed on
   every run, or never, cannot pass. Fixtures are made in the page; no
   collection art is in the repo. RUN AGAINST THE PAGE BEFORE patch626 every
   test here is red. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function' && typeof snapToPalette === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} showPage('fixer', false); });
};

/* A smooth square ramp with no block grid, painted edge to edge - a rendered
   background. CLEAR is the same ramp inside a transparent border, so its
   paint count can be less than 100. */
const RAMP = `
  const W = 1024, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; d[i] = (x * 255 / W) | 0; d[i + 1] = (y * 255 / W) | 0; d[i + 2] = ((x + y) * 127 / (2 * W)) | 0;
    d[i + 3] = (BORDER && (x < 100 || y < 100 || x >= W - 100 || y >= W - 100 || ((x - 512) ** 2 + (y - 512) ** 2 < 900))) ? 0 : 255;
  }
  g.putImageData(im, 0, 0);
`;
const OPAQUE = 'const BORDER = false;' + RAMP;
/* 128x128 at one pixel per cell, every pixel its own colour: no block grid,
   narrower than the collection's 160. */
const SPRITE128 = `
  const W = 128, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pal = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7', '#45293f', '#c85368'];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    g.fillStyle = pal[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 6];
    g.fillRect(x, y, 1, 1);
  }
`;
const CLEAR = 'const BORDER = true;' + RAMP;

/* 1280 drawn at 10px blocks, painted edge to edge. */
const TEN = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 10, y * 10, 10, 10);
  }
`;

const load = (page, src, name, size, pal = false, grid = true) => page.evaluate(async ({ src, name, size, pal, grid }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = pal;
  document.getElementById('fixgrid').checked = grid;
  const sn = document.getElementById('fixsnap'); sn.checked = true;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(size);
  f.dispatchEvent(new Event('input', { bubbles: true }));
  return fixLoad(new File([blob], name, { type: 'image/png' }));
}, { src, name, size, pal, grid });

const run = (page) => page.evaluate(async () => {
  const realToast = window.toast; window.toast = () => {};
  const r = await fixRun();
  window.toast = realToast;
  return { cols: r.width, said: document.getElementById('fixout').textContent };
});

/* TWO-COLOUR 1280 PICTURES IN 8PX BLOCKS for the palette clause. One half is
   a palette colour exactly (it does not move); the other half is a colour the
   page itself finds 12 or more from every palette colour (FAR), or between 3
   and 8 from the nearest (NEAR) - chosen in the page by the page's own
   CIEDE2000, so the fixture is about this palette and not a remembered one. */
const pickColours = (page) => page.evaluate(() => {
  const pal = paletteRGB(), exact = new Set(pal.map(p => p.h));
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  let far = null, near = null;
  for (let r = 0; r < 256 && (!far || !near); r += 17) for (let g = 0; g < 256 && (!far || !near); g += 17) for (let b = 0; b < 256 && (!far || !near); b += 17) {
    const h = hex(r, g, b); if (exact.has(h)) continue;
    const n = nearestPaletteColour(r, g, b);
    if (!far && n.dE >= 12) far = h;
    if (!near && n.dE >= 3 && n.dE <= 8) near = h;
  }
  return { far, near, keep: pal[3].h };
});

/* Run one two-colour picture through the tab at 8 with the palette on, and
   measure independently, from the input and output pixels and the page's
   own deltaE2000, the share of the picture that moved by 10 or more. */
const palRun = (page, a, b, name) => page.evaluate(async ({ a, b, name }) => {
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) { g.fillStyle = x < 80 ? a : b; g.fillRect(x * 8, y * 8, 8, 8); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = true;
  document.getElementById('fixgrid').checked = true;
  document.getElementById('fixsnap').checked = true;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
  f.dispatchEvent(new Event('input', { bubbles: true }));
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], name, { type: 'image/png' }));
  const r = await fixRun();
  window.toast = realToast;
  const src = FIX.src, out = r;
  let opaque = 0, clear = 0;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const o = (y * out.width + x) * 4; if (!out.data[o + 3]) continue;
    const sx = Math.floor((x + 0.5) * src.width / out.width), sy = Math.floor((y + 0.5) * src.height / out.height), s = (sy * src.width + sx) * 4;
    const A = labOf(src.data[s], src.data[s + 1], src.data[s + 2]), B = labOf(out.data[o], out.data[o + 1], out.data[o + 2]);
    opaque++; if (deltaE2000(A[0], A[1], A[2], B[0], B[1], B[2]) >= 10) clear++;
  }
  return { said: document.getElementById('fixout').textContent, share: Math.round(clear / opaque * 100), blob: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}, { a, b, name });

test.describe('the run says what changed', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('A PICTURE PAINTED EDGE TO EDGE IS NOT TOLD IT KEPT 100% OF ITS PAINT, and 16 says what it may lose', async ({ page }) => {
    await load(page, OPAQUE, 'ramp.png', 16);
    const at16 = await run(page);
    expect(at16.cols).toBe(80);
    expect(at16.said).toContain('no block grid found; resampled from 1024 across onto the 80 cell grid');
    expect(at16.said, 'a figure that cannot be anything but 100 is not said').not.toContain('of the paint');
    expect(at16.said).toContain('resampled from 1024 across onto the 80 cell grid - small details (text, thin lines, stars) may be lost at 80 cells; 8 keeps more');
    /* CONTROL, ONE THING DIFFERENT: the same ramp with a clear border keeps
       its measured paint figure, below 100. */
    await load(page, CLEAR, 'ramp-clear.png', 16);
    const clear16 = await run(page);
    const m = clear16.said.match(/which kept (\d+)% of the paint/);
    expect(m, 'the clear one still gets its figure: ' + clear16.said).not.toBeNull();
    expect(+m[1]).toBeLessThan(100);
    expect(clear16.said, 'and the coarse note, which is about the grid, not the paint').toContain('may be lost at 80 cells; 8 keeps more');
    /* CONTROL: at 8 the grid is the collection's own, and nothing is said. */
    await load(page, OPAQUE, 'ramp.png', 8);
    const at8 = await run(page);
    expect(at8.cols).toBe(160);
    expect(at8.said).not.toContain('may be lost');
    /* A SOURCE NARROWER THAN 160: 8 keeps it at its own 128 cells, which is
       still more than 80 - so "8 keeps more" holds, and nothing names 160.
       The review found the first wording ("8 gives the collection's own 160")
       false here. */
    await load(page, SPRITE128, 'sprite.png', 16);
    const sp16 = await run(page);
    expect(sp16.said).toContain('resampled from 128 across onto the 80 cell grid - small details (text, thin lines, stars) may be lost at 80 cells; 8 keeps more');
    await load(page, SPRITE128, 'sprite.png', 8);
    const sp8 = await run(page);
    expect(sp8.cols, 'and 8 does keep more: its own 128').toBe(128);
    /* WITH SAVE AT 1280 OFF a cell count is picture pixels per cell, and the
       canvas advice does not apply: no note. */
    await load(page, OPAQUE, 'ramp.png', 16, false, false);
    const off16 = await run(page);
    expect(off16.said).toContain('no block grid found; resampled from 1024 across onto the 64 cell grid');
    expect(off16.said).not.toContain('may be lost');
  });

  test('THE GRIDLESS SEARCH WITH THE BOX EMPTY says no paint figure on an opaque picture, and keeps it on a clear one', async ({ page }) => {
    await load(page, OPAQUE, 'ramp.png', 0);
    const op = await run(page);
    expect(op.said).toMatch(/no pixel grid found; put on \d+ cells/);
    expect(op.said).not.toContain('of the paint');
    await load(page, CLEAR, 'ramp-clear.png', 0);
    const cl = await run(page);
    expect(cl.said).toMatch(/no pixel grid found; put on \d+ cells, (which kept \d+% of the paint|the count that kept the most)/);
  });

  test('THE SIZE ADVICE leaves the paint figure out on an opaque picture, and keeps it on a clear one', async ({ page }) => {
    const advice = async (src) => {
      await load(page, src, 'adv.png', 2);
      return page.evaluate(() => fixTryThese());
    };
    const op = await advice(OPAQUE);
    expect(op).toMatch(/^Try 8 \(160 cells\)/);
    expect(op).not.toContain('keeps');
    const cl = await advice(CLEAR);
    expect(cl).toMatch(/^Try 8 \(160 cells, keeps \d+% of the paint\)/);
  });

  test('"TYPE 10 TO KEEP THEM" SAYS THE COLLECTION WILL NOT TAKE 10', async ({ page }) => {
    await load(page, TEN, 'ten.png', 0);
    const hint = await page.evaluate(() => document.getElementById('fixsize').textContent);
    expect(hint, 'the readout before the run').toContain('type 10 to keep them, though the collection\'s 8px blocks will not take 10');
    const r = await run(page);
    expect(r.said).toContain('type 10 to keep them, though the collection\'s 8px blocks will not take 10');
    const folder = await page.evaluate(async ({ src }) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(src + '\nreturn c;')();
      const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([fileWithPath(bytes, 'hats/ten.png')]);
      window.toast = realToast;
      return document.getElementById('fixbatchout').textContent;
    }, { src: TEN });
    expect(folder, 'and the folder').toContain('type 10 to keep them, though the collection\'s 8px blocks will not take 10');
    /* CONTROL: a block the 8px check does take carries no caveat. */
    const c = await page.evaluate(() => ({ ten: fixRecutCaveat(10), sixteen: fixRecutCaveat(16), twenty: fixRecutCaveat(20) }));
    expect(c.sixteen).toBe('');
    expect(c.ten).not.toBe('');
    expect(c.twenty).toContain('will not take 20');
  });

  test('THE PALETTE CLAUSE SAYS HOW MUCH OF THE PICTURE MOVED BY A CLEAR CHANGE, measured, and nothing when none did', async ({ page }) => {
    const col = await pickColours(page);
    expect(col.far, 'the page found a colour 12 or more from every palette colour').toBeTruthy();
    expect(col.near, 'and one 3 to 8 from its nearest').toBeTruthy();
    const far = await palRun(page, col.keep, col.far, 'far.png');
    expect(far.share, 'independently measured: half the picture moved 10 or more').toBe(50);
    expect(far.said).toContain('% of the picture, ' + far.share + '% plainly changed colour - the furthest by ');
    const near = await palRun(page, col.keep, col.near, 'near.png');
    expect(near.share).toBe(0);
    expect(near.said, 'it moved, so the clause is there').toContain('moved to the palette');
    expect(near.said, 'but not plainly').not.toContain('plainly changed colour');
  });

  test('A FOLDER SAYS THE PIXELS MOVED BY A CLEAR CHANGE AND WHICH FILE HAD THE MOST, in either order', async ({ page }) => {
    const col = await pickColours(page);
    const far = await palRun(page, col.keep, col.far, 'far.png');
    const near = await palRun(page, col.keep, col.near, 'near.png');
    const folder = (order) => page.evaluate(async ({ far, near, order }) => {
      const realToast = window.toast; window.toast = () => {};
      const files = { far: fileWithPath(new Uint8Array(far), 'backgrounds/far.png'), near: fileWithPath(new Uint8Array(near), 'backgrounds/near.png') };
      await fixBatch(order.map(k => files[k]));
      window.toast = realToast;
      return document.getElementById('fixbatchout').textContent;
    }, { far: far.blob, near: near.blob, order });
    const a = await folder(['near', 'far']);
    const b = await folder(['far', 'near']);
    for (const note of [a, b]) {
      expect(note).toContain('2 put on the palette');
      /* half of one picture, none of the other: a quarter of the painted area */
      expect(note).toContain(' pixels, and 25% of the painted area plainly changed colour - the furthest by ');
      expect(note).toContain('most changed: backgrounds/far.png (50% plainly changed colour)');
    }
    /* CONTROL: a folder where nothing moves by 10 says nothing about it. */
    const onlyNear = await page.evaluate(async ({ near }) => {
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([fileWithPath(new Uint8Array(near), 'backgrounds/near.png'), fileWithPath(new Uint8Array(near), 'backgrounds/near2.png')]);
      window.toast = realToast;
      return document.getElementById('fixbatchout').textContent;
    }, { near: near.blob });
    expect(onlyNear).toContain('put on the palette');
    expect(onlyNear).not.toContain('plainly changed colour');
  });

  test('A FOLDER RESAMPLED ONTO 80 CELLS SAYS WHAT IT MAY LOSE; at 8 it does not', async ({ page }) => {
    const note = (size) => page.evaluate(async ({ src, size }) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(src + '\nreturn c;')();
      const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixpal').checked = false;
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(size);
      f.dispatchEvent(new Event('input', { bubbles: true }));
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([fileWithPath(bytes, 'backgrounds/a.png'), fileWithPath(bytes, 'backgrounds/b.png')]);
      window.toast = realToast;
      return document.getElementById('fixbatchout').textContent;
    }, { src: OPAQUE, size });
    const at16 = await note(16);
    expect(at16).toContain('2 with no block grid were resampled onto the 80 cell grid - small details (text, thin lines, stars) may be lost at 80 cells; 8 keeps more');
    const at8 = await note(8);
    expect(at8).not.toContain('may be lost');
  });

  /* The no-picture-change claim rests on the harness run in the commit (every
     step of the 47 backgrounds at 16 and 8, byte for byte); this only pins the
     two new counts against the answer's own totals. */
  test('THE PALETTE ANSWER CARRIES ITS TWO NEW COUNTS, consistent with its own totals', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = 64, d = new Uint8ClampedArray(W * W * 4);
      for (let i = 0; i < W * W; i++) { d[i * 4] = (i * 7) & 255; d[i * 4 + 1] = (i * 13) & 255; d[i * 4 + 2] = (i * 3) & 255; d[i * 4 + 3] = 255; }
      const a = new Uint8ClampedArray(d), res = snapToPalette(a, W * W, W);
      return { keys: Object.keys(res), clear: res.clear, clearShare: res.clearShare, opaque: res.opaque, pixels: res.pixels };
    });
    expect(r.keys).toContain('clear');
    expect(r.keys).toContain('clearShare');
    expect(r.clear).toBeLessThanOrEqual(r.pixels);
    expect(r.clearShare).toBeCloseTo(r.clear / r.opaque, 10);
  });

  test('A FOLDER DOES NOT SAY A PICTURE PAINTED EDGE TO EDGE KEPT 95% OF ITS PAINT; a clear one still does', async ({ page }) => {
    const note = (src) => page.evaluate(async ({ src }) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(src + '\nreturn c;')();
      const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixpal').checked = false;
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '0';
      f.dispatchEvent(new Event('input', { bubbles: true }));
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([fileWithPath(bytes, 'backgrounds/a.png'), fileWithPath(bytes, 'backgrounds/b.png')]);
      window.toast = realToast;
      return document.getElementById('fixbatchout').textContent;
    }, { src });
    const op = await note(OPAQUE);
    expect(op).toMatch(/2 are not drawn on any pixel grid: 2 painted edge to edge put on \d+ cells, and lost detail/);
    expect(op).not.toContain('of its paint');
    const cl = await note(CLEAR);
    expect(cl).toMatch(/2 are not drawn on any pixel grid: 2 put on the coarsest grid that kept its shape and 95% of its paint \(\d+ cells\)/);
    expect(cl).not.toContain('painted edge to edge');
  });
});
