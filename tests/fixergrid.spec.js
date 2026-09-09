/* SAVING A FIXED TRAIT ONTO THE COLLECTION'S 1280x1280 CANVAS.

   "I want a button that saves the trait so it will be 1280x1280 and i want it
   to stay in position (if its less or more X i want it to be sized to fit
   1280x1280 while keeping exact positioning bc i will be moving traits to
   their final position."

   The fixer's answer is the whole picture at one pixel per cell - 85x85 for a
   1024px input, say - and the collection is 1280. So the save scales all of
   it, which is what keeps position exact: a mark three tenths of the way
   across a 85-wide result is three tenths of the way across a 1280-wide one.
   Nothing is centred and nothing is padded, so there is no offset to check;
   what there IS to check is that the scale really is applied to the whole
   extent and not to a crop, and that it is nearest neighbour, because a
   smoothed resize of pixel art is the exact thing this tool exists to undo.

   The tests below drive fixGridCanvas, which is the one canvas both the
   single Download and the batch write through - so "the switch means one
   thing" is a fact about the code and not a promise. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixGridCanvas === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A result the way the worker hands one back: a plain grid of known colours
   with one marked cell, so where it lands can be read off afterwards. */
const RESULT = (w, h, markX, markY) => ({ w, h, markX, markY });

const build = (page, r) => page.evaluate(({ w, h, markX, markY }) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const on = (x === markX && y === markY);
    d[i] = on ? 255 : 0; d[i + 1] = on ? 0 : 128; d[i + 2] = on ? 0 : 64; d[i + 3] = 255;
  }
  window.__r = { data: d, width: w, height: h };
  return true;
}, r);

const draw = (page, on) => page.evaluate((sw) => {
  document.getElementById('fixgrid').checked = sw;
  const c = fixGridCanvas(window.__r);
  const g = c.getContext('2d');
  const px = g.getImageData(0, 0, c.width, c.height).data;
  /* Where the red cell ended up, as a box. */
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, reds = 0, others = new Set();
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    const k = px[i] + ',' + px[i + 1] + ',' + px[i + 2];
    if (k === '255,0,0') {
      reds++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    } else others.add(k);
  }
  const out = { w: c.width, h: c.height, reds, colours: [...others],
    box: x1 < 0 ? null : { x0, y0, x1, y1 } };
  c.width = 1; c.height = 1;
  return out;
}, on);

test('the switch on writes 1280x1280 whatever came out of the fixer', async ({ page }) => {
  await ready(page);
  for (const [w, h] of [[85, 85], [128, 128], [40, 90], [300, 210]]) {
    await build(page, RESULT(w, h, 1, 1));
    const r = await draw(page, true);
    expect(`${w}x${h} -> ${r.w}x${r.h}`).toBe(`${w}x${h} -> 1280x1280`);
  }
});

test('the switch off writes the size the fixer found', async ({ page }) => {
  await ready(page);
  for (const [w, h] of [[85, 85], [40, 90]]) {
    await build(page, RESULT(w, h, 1, 1));
    const r = await draw(page, false);
    expect(`${w}x${h} -> ${r.w}x${r.h}`).toBe(`${w}x${h} -> ${w}x${h}`);
  }
});

test('a pixel lands at the same fraction across, on an uneven size', async ({ page }) => {
  await ready(page);
  /* 1280/85 is 15.06, the awkward case the readout warns about: the cell has
     to land at the same fraction anyway, within one scaled pixel. */
  const W = 85, mx = 21, my = 63;
  await build(page, RESULT(W, W, mx, my));
  const r = await draw(page, true);
  expect(r.box).not.toBeNull();
  const k = 1280 / W;
  /* The cell covers [mx*k, (mx+1)*k) - the same span it covered in the small
     picture, measured as a fraction of the whole. */
  expect(Math.abs(r.box.x0 - Math.round(mx * k))).toBeLessThanOrEqual(1);
  expect(Math.abs(r.box.y0 - Math.round(my * k))).toBeLessThanOrEqual(1);
  expect(Math.abs((r.box.x1 + 1) - Math.round((mx + 1) * k))).toBeLessThanOrEqual(1);
  /* AND THE EXTENT IS THE WHOLE PICTURE, not a crop of it. A crop would put
     the mark somewhere else entirely and this is what would catch it. */
  const fracIn = mx / W, fracOut = r.box.x0 / 1280;
  expect(Math.abs(fracIn - fracOut)).toBeLessThan(0.005);
});

test('an even size gives every pixel the same width', async ({ page }) => {
  await ready(page);
  /* 1280/128 is 10 exactly. One marked cell must come out exactly 10x10 -
     the whole point of the readout that tells you which sizes do this. */
  await build(page, RESULT(128, 128, 7, 9));
  const r = await draw(page, true);
  expect(r.reds).toBe(100);
  expect(r.box).toEqual({ x0: 70, y0: 90, x1: 79, y1: 99 });
});

test('the resize is nearest neighbour, so no colour is invented', async ({ page }) => {
  await ready(page);
  await build(page, RESULT(85, 85, 21, 63));
  const r = await draw(page, true);
  /* Smoothing would blend the red cell into its neighbours and put a ring of
     in-between colours around it. Two colours went in; two come out. */
  expect(r.colours).toEqual(['0,128,64']);
  expect(r.reds).toBeGreaterThan(0);
});

test('the readout says which of the two sizes you are about to get', async ({ page }) => {
  await ready(page);
  const hint = (w, step, on) => page.evaluate(({ w, step, on }) => {
    FIX.src = { width: w, height: w };
    document.getElementById('fixgrid').checked = on;
    const f = document.getElementById('fixforce');
    f.value = String(step);
    fixSizeHint();
    return document.getElementById('fixsize').textContent;
  }, { w, step, on });

  /* 1024 at 8 gives 128 across, and 1280/128 is 10. */
  const even = await hint(1024, 8, true);
  expect(even).toContain('128×128 pixels');
  expect(even).toContain('×10 to 1280');
  expect(even).not.toContain('uneven');

  /* 1020 at 12 gives 85, and 1280/85 is 15.06. */
  const odd = await hint(1020, 12, true);
  expect(odd).toContain('85×85 pixels');
  expect(odd).toContain('uneven');

  /* AND THE SIZES IT OFFERS INSTEAD HAVE TO ACTUALLY WORK. The offer is
     computed from the image in hand, so every number in it must divide the
     image AND land on a count that divides 1280 - a rule of thumb here would
     name sizes that do not exist for this picture. */
  const offered = [...odd.matchAll(/(\d+) gives (\d+)×\d+/g)].map(m => [+m[1], +m[2]]);
  expect(offered.length).toBeGreaterThan(0);
  for (const [s, cols] of offered) {
    expect({ size: s, divides1020: 1020 % s === 0, count: 1020 / s, onGrid: 1280 % cols === 0 })
      .toEqual({ size: s, divides1020: true, count: cols, onGrid: true });
  }

  /* With the switch off it says the size and nothing about the grid, because
     nothing about the grid is true then. */
  const off = await hint(1020, 12, false);
  expect(off).toContain('85×85 pixels');
  expect(off).not.toContain('1280');
});

test('an image that cannot land on the grid is told so, not given a number', async ({ page }) => {
  await ready(page);
  /* 1021 is prime, so no whole pixel size divides it onto a count that
     divides 1280. Naming one anyway would be worse than saying nothing. */
  const said = await page.evaluate(() => {
    FIX.src = { width: 1021, height: 1021 };
    document.getElementById('fixgrid').checked = true;
    const f = document.getElementById('fixforce');
    f.value = '12';
    fixSizeHint();
    return document.getElementById('fixsize').textContent;
  });
  expect(said).toContain('Nothing divides this image onto that grid');
  expect(said).not.toMatch(/\d+ gives/);
});

test('the controls read as words, not as source', async ({ page }) => {
  await ready(page);
  /* THE ONE THE OTHER EIGHT MISSED. The switch shipped saying
     "Save at 1280×1280" on screen - a JavaScript escape written into
     markup, where nothing interprets it. Every test here checked what the
     switch DOES and none read what it SAYS, because they were all written
     from the same idea of what mattered. A screenshot found it in a glance.

     Asserted on the rendered text of every control in the tab, so this
     catches the next one wherever it lands rather than only this label. */
  const bad = await page.evaluate(() => {
    const out = [];
    const box = document.getElementById('fixer');
    for (const el of box.querySelectorAll('label, button, span, option, p, strong')) {
      const t = el.textContent || '';
      if (/\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}|&[a-z]+;|&#\d+;/.test(t))
        out.push((el.id || el.tagName) + ': ' + t.trim().slice(0, 60));
    }
    return out;
  });
  expect(bad).toEqual([]);
  /* From the checkbox outwards. A selector list matched the first label[for]
     in the document instead and read "Working in" off the header. */
  const said = await page.evaluate(() =>
    document.getElementById('fixgrid').closest('label').textContent.trim());
  expect(said).toBe('Save at 1280×1280');
});

test('the batch and the single save go through the same canvas', async ({ page }) => {
  await ready(page);
  /* ONE SWITCH, ONE ANSWER. Both call fixGridCanvas; if either grew its own
     resize there would be two answers to what a save is, and a batch of 320
     could differ from the one you checked by hand. */
  const src = await page.evaluate(() => ({
    download: String(fixDownload), batch: String(fixBatch),
  }));
  expect(src.download).toContain('fixGridCanvas(');
  expect(src.batch).toContain('fixGridCanvas(');
  expect(src.download).not.toContain('drawImage');
  expect(src.batch).not.toMatch(/drawImage\([^)]*,\s*0\s*,\s*0\s*,/);
});
