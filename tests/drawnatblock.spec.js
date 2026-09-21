/* A TYPED RUN SAYS WHAT THE PICTURE WAS DRAWN AT.

   The documented workflow types 8 and saves at 1280. On that path
   fixStepFor works the cell count out on the canvas and returns the step
   without ever asking what the picture is drawn in, so a trait drawn at 10px
   or 5px blocks is re-cut with every block boundary landing inside a drawn
   block - and the run said "medium confidence (forced)", which is the engine
   repeating the instruction it was given.

   Measured over the 311 working traits: 43 are drawn at 8px, 166 are on no
   grid at all, and 101 are drawn at a size the 160 cell grid cuts across -
   89 at 10px, 12 at 5px. hats/Make Solana Great Again Hat is one of the 5px
   ones: 0.97% of its paint lost, IoU 0.98, every gate fact passed, and its
   lettering comes out unreadable. The block size is the one number that
   predicts that, and the page measures it already.

   ONLY WHEN NEITHER DIVIDES THE OTHER. 8px art typed at 4 is two whole cells
   per block and loses nothing - saying "re-cut" about that would be a clause
   that fires on work it has no complaint about. What is pinned here: the
   sentence appears when the grid cuts across the blocks, does NOT appear
   when it was drawn at the size being used, does NOT appear when the cells
   divide the blocks, and the decision - which size wins - is untouched. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A 1280 picture drawn in whole blocks of `cell` pixels. */
const blocks = (cell) => `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const n = W / ${cell};
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
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
  return { said: document.getElementById('fixout').textContent, cols: r.width, step: r.stepX };
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
  return { said: document.getElementById('fixbatchout').textContent,
    cells: fixBatchFiles.map(r => r.cells) };
}, srcs);

test.describe('what the picture was drawn at', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('A PICTURE DRAWN AT ANOTHER BLOCK SIZE IS SAID, WITH THE SIZE',
    async ({ page }) => {
      const r = await single(page, blocks(10));
      expect(r.cols, 'the typed size still decides the count').toBe(160);
      expect(r.step, 'and the step is the typed one').toBe(8);
      expect(r.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across');
      expect(r.said, 'which replaces the engine repeating its instruction')
        .not.toContain('confidence (forced)');
    });

  test('and a picture already drawn at the size being used says nothing',
    async ({ page }) => {
      /* The control, one number different. Without it the assertion above
         could be passing on a clause that is printed for every typed run. */
      const r = await single(page, blocks(8));
      expect(r.cols).toBe(160);
      expect(r.step).toBe(8);
      expect(r.said, 'nothing cuts across anything').not.toContain('cuts across');
      expect(r.said, 'so the run says what it always said').toContain('confidence (forced)');
    });

  test('A FOLDER RUN COUNTS THEM AND NAMES THE SIZES IT SAW',
    async ({ page }) => {
      /* Three files, two of them drawn at something else and at two
         different sizes, so the clause has to count files and list sizes
         rather than do either one twice. */
      const r = await batch(page, [blocks(10), blocks(8), blocks(5)]);
      expect(r.cells, 'every one of them lands on the collection grid').toEqual([160, 160, 160]);
      expect(r.said).toContain('2 were drawn at a block size the 160 cell grid cuts across (5px, 10px)');
    });

  test('and a folder where none of them was says nothing at all',
    async ({ page }) => {
      const r = await batch(page, [blocks(8), blocks(8)]);
      expect(r.cells).toEqual([160, 160]);
      expect(r.said, 'a clause that fires on every run is not a finding')
        .not.toContain('drawn at a block size');
    });

  test('AND CELLS THAT DIVIDE THE BLOCKS ARE NOT A COMPLAINT',
    async ({ page }) => {
      /* 8px art typed at 4: each block becomes exactly two cells across and
         two down, and not one boundary lands inside a block. A rule that
         fired on "the size is not what it was drawn at" would say so here,
         about a run that loses nothing - and nativegrid.spec.js:295 catches
         exactly that, which is how this case was found. */
      const r = await single(page, blocks(8), 4);
      expect(r.cols, 'four on the canvas is 320 cells').toBe(320);
      expect(r.said, 'nothing is cut across').not.toContain('cuts across');
      expect(r.said, 'and the blocks are not quoted at all').not.toContain('8px blocks');
    });
});
