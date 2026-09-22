/* A RUN SAYS HOW MUCH OF THE PICTURE IS ONE BLOCK WIDE.

   patch515 says when the 8px cells cut across the blocks a picture was drawn
   in. For most of the 101 traits that is harmless. What dies is detail one
   block wide - a letter stroke - because a 5px block is 0.625 of a cell and
   no stroke can be 0.625 cells wide. The Make Solana Great Again Hat is
   drawn at 5px with every stroke one block; the words come out as rubble
   while every per-trait number looks fine.

   The measure is a STROKE, not a colour change: one block wide, continuing
   along its length, the same surround on both sides. A first attempt counted
   runs of one block and fired on every cut-across trait, because dither is a
   run of one. So this file carries the cases that separate the two:

     stems       one-block vertical lines, 4 columns x 126 rows = 504 strokes
     bars        the same colours four blocks wide: 0 strokes, still cut across
     checker     a dither: 0 strokes - the case the loose measure got wrong
     8px blocks  nothing cut across, nothing said

   Palette off throughout - the count is on the source, before anything. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A 1280 picture in whole blocks of `cell` px, in one of four patterns. */
const art = (cell, kind) => `
  const W = 1280, B = ${cell}, N = W / B, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    let v = '#2e222f';
    if ('${kind}' === 'stems') v = (bx % 32 === 2) ? '#e8d5b7' : '#2e222f';
    /* three on, five off: 30px and 50px stripes, so the picture still
       measures as 10px blocks - four-and-four would be 40px stripes, which
       measure as 40px blocks, which 8 divides, and nothing would be cut. */
    if ('${kind}' === 'bars') v = (bx % 8 < 3) ? '#e8d5b7' : '#2e222f';
    if ('${kind}' === 'checker') v = ((bx + by) % 2) ? '#e8d5b7' : '#2e222f';
    if ('${kind}' === 'four') v = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(bx * 5 + by * 3) % 4];
    g.fillStyle = v; g.fillRect(bx * B, by * B, B, B);
  }
`;

const single = (page, src, typed) => page.evaluate(async ({ src, typed }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'one.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(typed || 8);
  const r = await fixRun();
  window.toast = realToast;
  f.value = '0';
  return { said: document.getElementById('fixout').textContent, cols: r.width };
}, { src, typed });

const batch = (page, srcs) => page.evaluate(async (srcs) => {
  const files = [];
  for (let i = 0; i < srcs.length; i++) {
    // eslint-disable-next-line no-new-func
    const c = new Function(srcs[i] + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    files.push(new File([blob], 'f' + i + '.png', { type: 'image/png' }));
  }
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  f.value = '0';
  return document.getElementById('fixbatchout').textContent;
}, srcs);

test.describe('how much of the picture is one block wide', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('ONE-BLOCK STEMS ARE COUNTED AND SAID, with the count', async ({ page }) => {
    const r = await single(page, art(10, 'stems'));
    expect(r.cols).toBe(160);
    expect(r.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across');
    expect(r.said).toContain('- 504 strokes one block wide will not survive it');
  });

  test('and the same colours four blocks wide are cut across but say nothing about strokes',
    async ({ page }) => {
      /* The control that makes the count a finding: cut across, nothing thin. */
      const r = await single(page, art(10, 'bars'));
      expect(r.said).toContain('cell grid cuts across');
      expect(r.said, 'no stroke to report').not.toContain('one block wide');
    });

  test('A DITHER IS NOT A STROKE', async ({ page }) => {
    /* The case the loose measure got wrong: every block of a checkerboard is
       a run of one, and none of it is a stroke. */
    const r = await single(page, art(10, 'checker'));
    expect(r.said).toContain('cell grid cuts across');
    expect(r.said, 'dither is not detail that a cell loses').not.toContain('one block wide');
  });

  test('and nothing is said when the cells divide the blocks', async ({ page }) => {
    /* Stems at 10px typed at 10: every block is a whole cell, so the strokes
       survive and there is nothing to say. */
    const r = await single(page, art(10, 'stems'), 10);
    expect(r.cols).toBe(128);
    expect(r.said).not.toContain('cuts across');
    expect(r.said).not.toContain('one block wide');
  });

  test('A FOLDER RUN COUNTS THE ONES HOLDING DETAIL AND NAMES THE WORST', async ({ page }) => {
    const said = await batch(page, [art(10, 'bars'), art(10, 'stems'), art(8, 'four')]);
    expect(said).toContain('2 were drawn at a block size the 160 cell grid cuts across (10px), '
      + '1 of them holding detail one block wide (most in f1)');   /* the display name, as the shelf shows it */
  });

  test('and a folder where nothing thin is cut across says only the cut', async ({ page }) => {
    const said = await batch(page, [art(10, 'bars'), art(10, 'checker')]);
    expect(said).toContain('2 were drawn at a block size the 160 cell grid cuts across (10px)');
    expect(said).not.toContain('holding detail');
  });
});
