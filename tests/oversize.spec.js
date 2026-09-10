/* THE ONE APPROVED TRAIT THE FIXER WOULD NOT TAKE AT ALL.

   "troubleshoot the fixer so it works 100% of the time ... make sure it
   actually does something last time you lied and said it was and it wasnt"

   Measured, whole approved set, batch path: 318 of 319 through, one refused -
   extras/Harambe Ghost, 2048x2048, "outside what this can take". 2048 square
   is 4,194,304 pixels against a limit of 4,000,000, so it missed by 5%.

   The limit is api.py's, transcribed as PF.MAX_PIXELS, and the engine checks
   it again itself. Raising the page's copy was tried first and did nothing
   but change which of the two refused - the run then said "image too large
   (4.2MP > 4MP limit)" instead. So the picture is brought under the limit by
   a whole-number factor instead: every source pixel in exactly one block,
   block edges where pixel edges already were, no interpolation.

   Measured after: 323 of 323 through, all at 1280x1280, none ragged. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixShrinkToFit === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Pixel art at any size, drawn in blocks of `cell`. */
const art = (W, cell) => `
  const c = document.createElement('canvas');
  c.width = ${W}; c.height = ${W};
  const g = c.getContext('2d', { willReadFrequently: true });
  const n = ${W} / ${cell};
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
  }
`;

const run = (page, src, name) => page.evaluate(async ({ s, name }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(s + '\nreturn c;')();
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const sn = document.getElementById('fixsnap');
  sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('fixgrid').checked = true;
  const ff = document.getElementById('fixforce'); ff.disabled = false; ff.value = '0';
  await fixBatch([new File([b], name, { type: 'image/png' })]);
  const got = fixBatchFiles[0];
  const said = document.getElementById('fixbatchout').textContent;
  if (!got) return { said };
  return { said, cells: got.cells, saved: got.w + 'x' + got.h };
}, { s: src, name });

test('A 2048 TRAIT GOES THROUGH INSTEAD OF BOUNCING', async ({ page }) => {
  await ready(page);
  const r = await run(page, art(2048, 16), 'big.png');
  /* 2048 halves to 1024, which the engine takes; 16px blocks become 8px
     blocks with nothing moved, so the art is still 128 pixels across. */
  expect(r.saved, 'and it saves at the collection size like everything else')
    .toBe('1280x1280');
  expect(r.cells, 'its own resolution, unchanged by the reduction').toBe(128);
  expect(r.said, 'and it is not silent about a step nobody asked for')
    .toContain('reduced');
  expect(r.said).not.toContain('outside what this can take');
});

test('and the reduction picks block colours, it does not resample', async ({ page }) => {
  await ready(page);
  /* THE MEASUREMENT. A resample would blend neighbouring blocks and produce
     colours that are in neither - which is the "blurry pixel art" complaint
     this whole tab exists to answer. */
  const r = await page.evaluate(() => {
    const W = 2048, c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true });
    const pal = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'];
    const n = W / 16;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = pal[(x * 5 + y * 3) % 4];
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    const d = g.getImageData(0, 0, W, W).data;
    c.width = 1; c.height = 1;
    const small = fixShrinkToFit(d, W, W);
    const seen = new Set();
    for (let i = 0; i < small.data.length; i += 4)
      seen.add(small.data[i] + ',' + small.data[i + 1] + ',' + small.data[i + 2]);
    return { factor: small.factor, w: small.width, colours: seen.size,
      block: fixNativeBlock(small.data, small.width, small.height) };
  });
  expect(r.factor, 'the smallest whole factor that fits').toBe(2);
  expect(r.w).toBe(1024);
  /* Four colours in, four colours out. A resample gives dozens. */
  expect(r.colours, 'no colour that was not already in the picture').toBe(4);
  /* And the grid is still there, at half the size. */
  expect(r.block, '16px blocks halved to 8, still exact').toBe(8);
});

test('and a picture already under the limit is left alone', async ({ page }) => {
  await ready(page);
  /* THE CONTROL. A reduction that ran on everything would pass the tests
     above and would be quietly halving every trait in the collection. */
  const r = await page.evaluate(() => {
    const W = 1280, c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#2e222f'; g.fillRect(0, 0, W, W);
    const d = g.getImageData(0, 0, W, W).data;
    c.width = 1; c.height = 1;
    return fixShrinkToFit(d, W, W);
  });
  expect(r, '1280 square is inside the limit, so there is nothing to do').toBe(null);
  const b = await run(page, art(1280, 10), 'normal.png');
  expect(b.said, 'and the run does not claim it reduced anything')
    .not.toContain('reduced');
});

test('and the page and the engine still draw the same line', async ({ page }) => {
  await ready(page);
  /* The two limits have to agree, or the page accepts a picture the engine
     then refuses - which is exactly what raising one of them did.

     The engine is not loaded into the page: it is the text of #pfcore, which
     the worker is built from. Asking the page for PF.MAX_PIXELS returns
     undefined, so a check written that way passes by never running - which
     is how this one was written first. */
  const r = await page.evaluate(() => {
    const el = document.getElementById('pfcore');
    const m = el && el.textContent.match(/PF\.MAX_PIXELS\s*=\s*(\d+)/);
    return { page: FIX_MAX_PIXELS, engine: m ? +m[1] : null,
      inPage: typeof PF !== 'undefined' };
  });
  expect(r.inPage, 'the engine is worker text, not page script').toBe(false);
  expect(r.engine, 'and its limit was found, not skipped').toBe(4000000);
  expect(r.page, 'which is the number the page draws too').toBe(r.engine);
});

test('and something genuinely too big is still refused, with what to do', async ({ page }) => {
  await ready(page);
  /* THE OTHER CONTROL. 4104 is past MAX_SIDE, the ceiling the rest of the
     page draws, and it is prime-ish enough that no small whole factor brings
     it under - so it is refused, and the refusal says the number and the
     size to resize to rather than "outside what this can take". */
  const r = await run(page, art(4104, 8), 'huge.png');
  expect(r.cells, 'nothing came out').toBe(undefined);
  expect(r.said).toContain('could not do');
  expect(r.said).toContain('4104');
});

test('AND THE SINGLE TAB TAKES THE SAME PICTURE THE FOLDER DOES', async ({ page }) => {
  await ready(page);
  /* The reduction went into fixBatch only, so the same 2048 file bounced off
     the single tab with "Too big - 4.2 megapixels, and the limit is 4". Same
     picture, same page, two answers, and no way to tell which is the rule. */
  const r = await page.evaluate(async (s) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(s + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    showPage('fixer', false);
    const ok = await fixLoad(new File([b], 'big.png', { type: 'image/png' }));
    return { ok, said: document.getElementById('fixout').textContent,
      cap: document.getElementById('fixbeforecap').textContent,
      src: FIX.src ? FIX.src.width + 'x' + FIX.src.height : null };
  }, art(2048, 16));
  expect(r.ok, 'it is taken').toBe(true);
  expect(r.said, 'and not refused').not.toContain('Too big');
  /* The engine is handed the reduced picture at the reduced size - telling it
     1024 while passing 2048 pixels is the mistake this shape invites. */
  expect(r.src, 'and the source is recorded at the size it now is').toBe('1024x1024');
  expect(r.cap, 'and the caption says a reduction happened').toContain('reduced 2');
});

test('and the single tab still refuses what it cannot reduce', async ({ page }) => {
  await ready(page);
  /* THE CONTROL for the test above. 4104 is past MAX_SIDE. */
  const r = await page.evaluate(async (s) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(s + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    showPage('fixer', false);
    const ok = await fixLoad(new File([b], 'huge.png', { type: 'image/png' }));
    return { ok, said: document.getElementById('fixout').textContent };
  }, art(4104, 8));
  expect(r.ok).toBe(false);
  expect(r.said).toContain('Too big');
  expect(r.said).toContain('4104');
});

test('and a normal trait is not reduced on the single tab either', async ({ page }) => {
  await ready(page);
  /* THE OTHER CONTROL. Everything in the collection is 1280, and if this
     started halving those the whole library would come back at half size. */
  const r = await page.evaluate(async (s) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(s + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    showPage('fixer', false);
    await fixLoad(new File([b], 'normal.png', { type: 'image/png' }));
    return { src: FIX.src.width + 'x' + FIX.src.height,
      cap: document.getElementById('fixbeforecap').textContent };
  }, art(1280, 10));
  expect(r.src).toBe('1280x1280');
  expect(r.cap).not.toContain('reduced');
});
