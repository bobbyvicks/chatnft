/* A PICTURE WITH NO PIXEL GRID STILL HAS A SHAPE.

   "troubleshoot the fixer so it works 100% of the time"

   68 of the 323 approved traits have no measurable block structure - photos,
   gradients, soft edges - and those fell to the declared 160 cells. Measured
   on all 68, reduced and compared with the source:

     onto 160   26 lost 1% or more, 4 lost 10% or more, worst 27.5%
                2 had their bounding box move by more than 2% of the canvas,
                the worst by 29.4%

   That last row is "half the trait is missing" written as a number.
   eyes/Sleepy Neutral Eyes has eyelashes one soft pixel wide; they lose the
   majority vote in every 8px cell they touch, and the top of the art stops
   existing. hats/Blue Patterned Yarmulke moved 21.3% the same way.

   The fallback searches now - coarsest first, first count that keeps the
   shape and 95% of the paint. Measured across the whole set afterwards:

     lost 10% or more   4 -> 1
     moved over 2%      4 -> 1
     worst loss     27.5% -> 11.4%
     Sleepy Neutral Eyes   29.4% moved -> 0.2%, 11.6% lost -> 3.4%
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixGridlessCells === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A picture with NO block structure - every pixel a slightly different
   colour, so fixNativeBlock has nothing to find - and, optionally, a thin
   band near the top standing in for an eyelash: three pixels tall, which is
   a minority of an 8px cell and a majority of a 5px one. */
const draw = (thin) => `
  const W = 1280, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W);
  for (let y = 400; y < 900; y++) for (let x = 300; x < 1000; x++) {
    const i = (y * W + x) * 4;
    im.data[i] = (x * 3 + y) % 256; im.data[i + 1] = (y * 5) % 256;
    im.data[i + 2] = (x + y * 7) % 256; im.data[i + 3] = 255;
  }
  if (${thin ? 'true' : 'false'}) {
    for (let y = 100; y < 103; y++) for (let x = 400; x < 800; x++) {
      const i = (y * W + x) * 4;
      im.data[i] = 46; im.data[i + 1] = 34; im.data[i + 2] = 47; im.data[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
`;

const run = (page, src) => page.evaluate(async (s) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(s + '\nreturn c;')();
  const gg = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, H = c.height;
  const before = gg.getImageData(0, 0, W, H).data.slice();
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;

  const sn = document.getElementById('fixsnap');
  sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('fixgrid').checked = true;
  const ff = document.getElementById('fixforce'); ff.disabled = false; ff.value = '0';
  await fixBatch([new File([b], 'soft.png', { type: 'image/png' })]);
  const got = fixBatchFiles[0];
  if (!got) return { err: document.getElementById('fixbatchout').textContent };

  const bm = await createImageBitmap(new Blob([got.data], { type: 'image/png' }));
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
  const og = cv.getContext('2d', { willReadFrequently: true });
  og.drawImage(bm, 0, 0); if (bm.close) bm.close();
  const OW = cv.width, OH = cv.height;
  const d = og.getImageData(0, 0, OW, OH).data;
  cv.width = 1; cv.height = 1;

  const box = (data, W2, H2) => {
    let x0 = W2, y0 = H2, x1 = -1, y1 = -1;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (data[(y * W2 + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : [x0 / W2, y0 / H2, (x1 + 1) / W2, (y1 + 1) / H2];
  };
  const bs = box(before, W, H), bo = box(d, OW, OH);
  return { cells: got.cells, saved: got.w + 'x' + got.h, N: OW / got.cells,
    top: bo ? Math.round(bo[1] * 1000) / 10 : -1,
    srcTop: bs ? Math.round(bs[1] * 1000) / 10 : -1,
    drift: (bs && bo) ? Math.round(Math.max(...bs.map((v, i) => Math.abs(v - bo[i]))) * 1000) / 10 : -1,
    said: document.getElementById('fixbatchout').textContent };
}, src);

test('THE THIN PART OF A GRIDLESS TRAIT SURVIVES', async ({ page }) => {
  await ready(page);
  const r = await run(page, draw(true));
  /* The band is 3 source pixels tall. In an 8px cell that is a minority and
     it is voted away - which is what deleted the top of Sleepy Neutral Eyes.
     In a 5px cell it is a majority and it stays. */
  expect(r.cells, 'a finer grid than the declared 160').toBeGreaterThan(160);
  expect(Number.isInteger(1280 / r.cells), 'still a whole grid').toBe(true);
  expect(r.saved).toBe('1280x1280');
  /* THE MEASUREMENT THAT MATTERS: the top of the art is where it was. */
  expect(r.top, 'the top of the picture is still the top of the picture')
    .toBeCloseTo(r.srcTop, 0);
  expect(r.drift, 'and nothing moved').toBeLessThan(1);
});

test('and the declared grid really does destroy it, which is why', async ({ page }) => {
  await ready(page);
  /* THE POSITIVE CONTROL. Without this the test above passes on a page that
     never had a problem, and the count it lands on would just be a number
     somebody liked. */
  const r = await page.evaluate(async (s) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(s + '\nreturn c;')();
    const gg = c.getContext('2d', { willReadFrequently: true });
    const W = c.width, H = c.height;
    const d = gg.getImageData(0, 0, W, H).data;
    c.width = 1; c.height = 1;
    /* The picture really has no grid - or the search under test never runs. */
    const nat = fixNativeBlock(d, W, H);
    /* And this is what 160 does to it. */
    const at = (cells) => {
      const sw = W / cells, sh = H / cells;
      let y0 = cells;
      for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
        let op = 0, tot = 0;
        for (let y = Math.floor(cy * sh); y < Math.ceil((cy + 1) * sh); y++)
          for (let x = Math.floor(cx * sw); x < Math.ceil((cx + 1) * sw); x++) {
            tot++; if (d[(y * W + x) * 4 + 3] > 8) op++;
          }
        if (op * 2 > tot && cy < y0) y0 = cy;
      }
      return Math.round(y0 * sh / H * 1000) / 10;
    };
    return { nat, top160: at(160), top256: at(256), chose: fixGridlessCells(d, W, H) };
  }, draw(true));
  expect(r.nat, 'the fixture has no block structure').toBe(0);
  /* The band starts 7.8% down. At 160 cells the picture starts at 31% - the
     band is gone and the top of the art with it. */
  expect(r.top160, 'at the declared grid the top of the art is deleted')
    .toBeGreaterThan(20);
  /* 5px cells, three of which the band fills - a majority, so it stays. */
  expect(r.top256, 'and one step finer it is not').toBeLessThan(10);
  expect(r.chose, 'so the search takes the first count that keeps it').toBe(256);
});

test('and a gridless trait that survives the declared grid stays on it', async ({ page }) => {
  await ready(page);
  /* THE OTHER CONTROL. A search that always went finer would pass both tests
     above and would quietly stop reducing anybody art - the coarsest grid
     that does no harm is the one wanted, not the finest available. */
  const r = await run(page, draw(false));
  expect(r.cells, 'nothing thin to lose, so the declared grid holds').toBe(160);
  expect(r.drift).toBeLessThan(1);
});

test('the run says which grid it settled on', async ({ page }) => {
  await ready(page);
  const r = await run(page, draw(true));
  /* Putting a picture on a grid nobody asked for and not saying so is how
     the last round of this went unnoticed for a week. */
  expect(r.said).toContain('not drawn on any pixel grid');
  expect(r.said).toContain('coarsest grid that kept its shape');
  expect(r.said).toContain('256 cells');
});

test('and a trait with its own grid never reaches the search', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    const W = 1280, c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true });
    for (let y = 0; y < W / 10; y++) for (let x = 0; x < W / 10; x++) {
      g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
      g.fillRect(x * 10, y * 10, 10, 10);
    }
    const d = g.getImageData(0, 0, W, W).data;
    c.width = 1; c.height = 1;
    return { nat: fixNativeBlock(d, W, W), step: fixStepFor(W, d, W), pick: fixGridlessPick };
  });
  /* 10px art is exact, so the step is measured and the search - which is a
     choice between imperfect answers - is never consulted. */
  expect(r.nat).toBe(10);
  expect(r.step).toBe(10);
  expect(r.pick, 'and nothing pretends a grid was chosen for it').toBe(0);
});
