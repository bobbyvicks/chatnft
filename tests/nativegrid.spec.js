/* THE TRAIT'S OWN GRID, NOT A NUMBER DECLARED SOMEWHERE ELSE.

   "troubleshoot the fixer so it works 100% of the time"

   Measured on all 319 approved traits - the largest N dividing 1280 for which
   every NxN square of the source is one colour:

     128 cells (10px)   192 traits
    1280 cells  (1px)    63 traits   no block structure at all
     160 cells  (8px)    35 traits   and that is all 33 skins
     256 cells  (5px)    28 traits

   projectGrid says 160 and the snap forced it on everything. 8px cells cut
   through 10px art - neither divides the other - so boundaries land mid-block
   and thin strokes lose the vote. What that cost, as source pixels with
   nothing opaque left in the same place:

     forcing 160          202 of 319 lost 1% or more, 24 lost 10% or more
     the trait's own grid  26 of 319 lost 1% or more,  4 lost 10% or more

   The 26 that remain are the ones with no grid, where any reduction is a real
   loss - and the run says how many those were rather than averaging somebody's
   artwork in silence. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Pixel art at 1280 drawn in blocks of `cell`. */
const art = (cell) => `
  const W = 1280, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const g = c.getContext('2d');
  const n = W / ${cell};
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = (x * 5 + y * 3) % 4;
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][k];
    g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
  }
`;
/* And something with no block structure at all. */
const noise = `
  const W = 1280, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const g = c.getContext('2d');
  const im = g.createImageData(W, W);
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i] = (i * 7) % 256; im.data[i + 1] = (i * 13) % 256;
    im.data[i + 2] = (i * 29) % 256; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;

const run = (page, src) => page.evaluate(async (s) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(s + '\nreturn c;')();
  const before = c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice();
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  const W = c.width, H = c.height;
  c.width = 1; c.height = 1;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixsnap').dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('fixgrid').checked = true;
  const ff = document.getElementById('fixforce');
  ff.disabled = false; ff.value = '0';
  await fixBatch([new File([b], 'trait.png', { type: 'image/png' })]);
  const got = fixBatchFiles[0];

  const bm = await createImageBitmap(new Blob([got.data], { type: 'image/png' }));
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
  const gg = cv.getContext('2d', { willReadFrequently: true });
  gg.drawImage(bm, 0, 0); if (bm.close) bm.close();
  const d = gg.getImageData(0, 0, cv.width, cv.height).data;
  const OW = cv.width; cv.width = 1; cv.height = 1;

  /* Source pixels with nothing opaque left in the same place. */
  let lost = 0, srcN = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (before[i + 3] <= 8) continue;
    srcN++;
    if (d[(y * OW + x) * 4 + 3] <= 8) lost++;
  }
  const per = 1280 / got.cells;
  let ragged = 0;
  if (Number.isInteger(per)) {
    for (let by = 0; by + per <= OW; by += per) for (let bx = 0; bx + per <= OW; bx += per) {
      const i0 = (by * OW + bx) * 4;
      let m = false;
      for (let y = by; y < by + per && !m; y++) for (let x = bx; x < bx + per; x++) {
        const i = (y * OW + x) * 4;
        if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1]
          || d[i + 2] !== d[i0 + 2] || d[i + 3] !== d[i0 + 3]) { m = true; break; }
      }
      if (m) ragged++;
    }
  } else ragged = -1;

  return { cells: got.cells, saved: got.w + 'x' + got.h, per,
    lostPct: srcN ? Math.round(lost / srcN * 1000) / 10 : 0, ragged,
    said: document.getElementById('fixbatchout').textContent };
}, src);

test('THE BLOCK SIZE IS MEASURED, AND IT IS EXACT', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(({ ten, eight, rough }) => {
    const grab = (s) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(s + '\nreturn c;')();
      const d = c.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, c.width, c.height).data;
      const W = c.width, H = c.height;
      c.width = 1; c.height = 1;
      return fixNativeBlock(d, W, H);
    };
    return { ten: grab(ten), eight: grab(eight), rough: grab(rough) };
  }, { ten: art(10), eight: art(8), rough: noise });
  /* No engine and no randomness - if it says 10, every 10x10 square really is
     flat, so reducing on those boundaries cannot lose anything. */
  expect(r.ten).toBe(10);
  expect(r.eight).toBe(8);
  /* And a picture with no block structure says so rather than guessing. */
  expect(r.rough).toBe(0);
});

test('A 10px TRAIT KEEPS ITS 10px PIXELS AND LOSES NOTHING', async ({ page }) => {
  await ready(page);
  const r = await run(page, art(10));
  /* This is the case that was losing up to 23%: 192 of the 319 approved
     traits are drawn at 10px and were being forced onto 8. */
  expect(r.cells, 'the trait own count, not the declared 160').toBe(128);
  expect(r.per).toBe(10);
  expect(r.lostPct, 'nothing is lost').toBe(0);
  expect(r.ragged, 'and the pixels are square').toBe(0);
  expect(r.saved).toBe('1280x1280');
});

test('and an 8px trait still gets 8 - the skins are all 8', async ({ page }) => {
  await ready(page);
  const r = await run(page, art(8));
  /* THE CONTROL. A version that always answered 128 would pass the test above
     and would be wrong for every skin in the collection. */
  expect(r.cells).toBe(160);
  expect(r.per).toBe(8);
  expect(r.lostPct).toBe(0);
  expect(r.ragged).toBe(0);
});

test('a 5px trait too, so it is following the picture', async ({ page }) => {
  await ready(page);
  const r = await run(page, art(5));
  expect(r.cells).toBe(256);
  expect(r.per).toBe(5);
  expect(r.lostPct).toBe(0);
  expect(r.ragged).toBe(0);
});

test('a picture with no grid still comes out square, and is reported', async ({ page }) => {
  await ready(page);
  const r = await run(page, noise);
  /* Letting the detectors answer here was tried and is worse - their counts
     are things like 510 and 127, which do not divide 1280, so the blocks come
     out ragged: 48 traits of 319 against 3. A picture with no grid loses
     detail under any reduction, so the declared grid at least keeps the
     pixels square. */
  expect(Number.isInteger(1280 / r.cells), 'the count divides the canvas').toBe(true);
  expect(r.ragged, 'so the pixels are square').toBe(0);
  /* And it is said, rather than averaging somebody artwork in silence. */
  expect(r.said).toContain('not drawn on any pixel grid');
});

test('and a trait that does have a grid is not reported', async ({ page }) => {
  await ready(page);
  const r = await run(page, art(10));
  /* THE POSITIVE CONTROL for the line above: a warning that appears on every
     run is one nobody reads. */
  expect(r.said).not.toContain('not drawn on any pixel grid');
});

test('the batch hands its own pixels over, which is what makes any of this work',
  async ({ page }) => {
    await ready(page);
    /* WAS a check that fixBatch contains the literal "fixStepFor(W,px,H)".
       That went red the moment the oversize reduction renamed those to sw and
       sh - which is a spelling change, not a behaviour one, and the test
       could not tell the difference. Measured instead: two pictures of
       DIFFERENT sizes in one batch get different answers, which a version
       reading FIX.src or reusing one size cannot do.

       The first version of the code read FIX.src, which a batch never sets -
       that is the single-image path only. It measured nothing, changed no
       answer, and the corpus reported identical loss before and after. */
    const r = await page.evaluate(async ({ ten, five }) => {
      const mk = async (s, name) => {
        // eslint-disable-next-line no-new-func
        const c = new Function(s + '\nreturn c;')();
        const b = await new Promise(res => c.toBlob(res, 'image/png'));
        c.width = 1; c.height = 1;
        return new File([b], name, { type: 'image/png' });
      };
      document.getElementById('fixsnap').checked = true;
      document.getElementById('fixgrid').checked = true;
      const ff = document.getElementById('fixforce'); ff.disabled = false; ff.value = '0';
      await fixBatch([await mk(ten, 'ten.png'), await mk(five, 'five.png')]);
      return fixBatchFiles.map(f => f.name + ':' + f.cells);
    }, { ten: art(10), five: art(5) });
    /* Two pictures, two grids, one run. A step read once for the batch gives
       both files the same count and this comes back [128, 128]. */
    expect(r).toEqual(['ten-fixed.png:128', 'five-fixed.png:256']);
  });

test('A MEASUREMENT DOES NOT OUTLIVE THE RUN THAT MADE IT', async ({ page }) => {
  await ready(page);
  /* The flag that says "this step was measured off the picture" was set and
     never cleared. So a measured run followed by a typed one - the exact
     order somebody uses when the measured answer was not what they wanted -
     reported the typed answer as measured, quoting a block size from the
     picture before it. */
  const r = await page.evaluate(async ({ src }) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    showPage('fixer', false);
    await fixLoad(new File([b], 'trait.png', { type: 'image/png' }));
    const sn = document.getElementById('fixsnap');
    sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
    const first = await fixRun();
    const measured = { cons: first && first.consensus, block: fixMeasuredBlock };
    /* Now the person turns the snap off and types a size. */
    sn.checked = false; sn.dispatchEvent(new Event('change', { bubbles: true }));
    const ff = document.getElementById('fixforce');
    ff.disabled = false; ff.value = '4';
    const second = await fixRun();
    return { measured, typed: { cons: second && second.consensus, block: fixMeasuredBlock },
      said: document.getElementById('fixout').textContent };
  }, { src: art(10) });
  /* THE POSITIVE CONTROL: the first run really did measure, so the second
     one is not passing because nothing ever sets the flag. */
  expect(r.measured.cons, 'the first run measured').toBe('measured');
  expect(r.measured.block, 'and says which block').toBe(10);
  expect(r.typed.block, 'and the typed run measured nothing').toBe(0);
  expect(r.typed.cons, 'so it is not reported as measured').not.toBe('measured');
  expect(r.said, 'nor does the readout quote the last picture blocks')
    .not.toContain('10px blocks');
});
