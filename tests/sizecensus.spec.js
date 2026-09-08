/* The size warning compared PIXELS against a count of CELLS.

   sizeCensus asked whether each trait was key(projectGrid, projectGrid).
   projectGrid is how many CELLS across the art is, 160 by default; w and h are
   PIXELS. At one pixel per cell those are the same number - which is every
   fixture the older specs use, and why nobody caught it - and at eight they
   are not. This collection is 160 cells of 8 pixels, so 1280.

   Measured against the real shape, 1280px traits on a 160-cell grid:

     it wants:     160x160
     it calls odd: 3 of 3

   The shelf told the owner all 272 of their traits were the wrong size, and
   the zip download said "A mint needs one size" about a collection that was
   fine. A warning that fires on everything is one people stop reading, and
   that costs the true warnings standing beside it.

   THE RULE IS THE ONE snapToGrid ALREADY ENFORCES: a canvas is right when it
   divides into projectGrid whole cells, which is w % projectGrid. 1280 is 8
   pixels per cell; 40 in a 160-cell collection is a quarter of a cell and
   cannot be drawn.

   THAT KEEPS THE DECISION collection-size.spec RECORDS IN WRITING - "a
   collection that agrees with itself but not with the grid is still wrong",
   the case a "are these all the same size" check calls clean. The first
   attempt at this fix compared against the size most traits shared, which
   would have called that collection clean and deleted the guard while
   appearing to fix a bug. It is pinned again below.

   AND THE OTHER PREMISE HAS MOVED. "A set holding two sizes is broken output"
   was true when the canvas was the biggest trait in the draw and paintTrait
   could only grow by whole numbers. autoCanvas picks a canvas now and scales
   everything into it, so two sizes that both sit on the grid is two sizes. */
import { test, expect } from '@playwright/test';

const census = (page, traits, grid) => page.evaluate(([list, g]) => {
  projectGrid = g;
  const c = sizeCensus(list.map(t => ({ kind: 'trait', name: t[0], w: t[1], h: t[2] })));
  return { want: c.want, oddCount: c.oddCount, detail: c.detail };
}, [traits, grid]);

test.describe('naming the traits that are not on the collection grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof sizeCensus === 'function');
  });

  test('a collection at eight pixels per cell is not warned about',
    async ({ page }) => {
      /* THE ONE THAT WAS BROKEN, and it was broken at maximum volume: every
         trait in the project named as wrong. The grid is 160 cells and the
         traits are 1280 pixels, which is that same grid at 8px a cell - and
         is exactly the shape of the real collection. */
      const r = await census(page, [['cap', 1280, 1280], ['visor', 1280, 1280],
        ['bob', 1280, 1280]], 160);
      expect(r.oddCount, 'nothing is odd').toBe(0);
      expect(r.want, 'and it names the grid, not a pixel size')
        .toBe('on the 160 cell grid');
    });

  test('and one that does not divide into cells is still named', async ({ page }) => {
    /* THE CONTROL. Without it "never warn" passes the test above and the
       feature is gone rather than fixed. 1254 is the real number: two files
       in the collection are that size, and 1254 / 160 is 7.8375. */
    const r = await census(page, [['cap', 1280, 1280], ['visor', 1280, 1280],
      ['eyes', 1254, 1254]], 160);
    expect(r.oddCount, 'one of the three').toBe(1);
    expect(r.detail, 'and it says which').toContain('eyes');
    expect(r.detail).toContain('1254');
  });

  test('a collection that agrees with itself but not with the grid is still wrong',
    async ({ page }) => {
      /* THE RECORDED DECISION, restated here because the first attempt at this
         fix broke it. Comparing against "the size most of them share" calls two
         equal off-grid traits clean - they agree with each other perfectly and
         with nothing else. BOTH are wrong.

         THE SIZE MOVED FROM 40 TO 100, and the reason is a second correction.
         40 IS on the grid of a 160-cell collection: it is a whole division of
         it, so it draws at exactly x32 onto a 1280 canvas and lands perfectly -
         measured, by reading the scale drawImage is given. The rule is a whole
         multiple OR a whole division, which is also exactly what snapToGrid
         offers, and 40 was a false positive. 100 is neither. */
      const r = await census(page, [['body', 100, 100], ['hat', 100, 100]], 160);
      expect(r.oddCount, 'both, not neither').toBe(2);
      expect(r.detail).toContain('body');
      expect(r.detail).toContain('hat');
    });

  test('two sizes that both sit on the grid are both fine', async ({ page }) => {
    /* THE PREMISE THAT MOVED. This was "broken output" when the canvas was the
       biggest trait and paintTrait could only grow by whole numbers. autoCanvas
       picks a canvas and scales into it, so 160 beside 1280 is one trait drawn
       at 1x and one at 8x of the same grid. */
    const r = await census(page, [['small', 160, 160], ['big', 1280, 1280]], 160);
    expect(r.oddCount, 'neither is off the grid').toBe(0);
  });

  test('a width that divides and a height that does not is still caught',
    async ({ page }) => {
      /* Both axes are asked, not just the width. A trait 1280 wide and 1000
         tall is on the grid across and a quarter cell short down it. */
      const r = await census(page, [['squat', 1280, 1000]], 160);
      expect(r.oddCount).toBe(1);
      expect(r.detail).toContain('squat');
    });

  test('and a small collection still works the way it always did',
    async ({ page }) => {
      /* The shape the old code was written for - traits at one pixel per cell,
         one outlier - still behaves. The fix was to stop assuming that shape,
         not to stop supporting it. */
      const r = await census(page, [['cap', 160, 160], ['visor', 160, 160],
        ['odd', 200, 200]], 160);
      expect(r.oddCount).toBe(1);
      expect(r.detail).toContain('odd');
    });

  test('an empty set says nothing rather than throwing', async ({ page }) => {
    const r = await census(page, [], 160);
    expect(r.oddCount).toBe(0);
    expect(r.detail).toBe('');
  });

  test('a grid of zero cannot divide by zero', async ({ page }) => {
    /* projectGrid comes back from a saved settings record and from the Cells
       field, and % 0 is NaN - which is falsy, so every trait would quietly be
       called correct. Floored at 1. */
    const r = await census(page, [['cap', 160, 160]], 0);
    expect(r.oddCount, 'not NaN, and not a crash').toBe(0);
  });

  test('and nothing on screen still states the old rule', async ({ page }) => {
    /* The claim lived in FIVE sentences and the first attempt at this fix
       anchored on two, which would have left three telling the old story while
       the code told a new one. Asserted against the page rather than against a
       list I wrote, so a sixth cannot be added quietly. */
    const r = await page.evaluate(async () => {
      const src = await (await fetch('index.html')).text();
      /* COMMENTS STRIPPED FIRST. The comment explaining this fix QUOTES the
         sentence it replaced, which is deliberate - a note nobody can find is
         not worth writing. Counting raw text found that quotation and called
         it a survivor, which is the exact trap patchkit strips comments for,
         walked into by a test. What reaches a person is the code. */
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
      return {
        mint: (code.match(/A mint needs one size/g) || []).length,
        share: (code.match(/has to share one canvas size/g) || []).length,
        /* And the two other places that read a cell count as a pixel size. */
        equals: (code.match(/art\.width!==projectGrid/g) || []).length,
        /* The explanation really is still there, unbroken enough to grep for -
           a strip that removed everything would make this pass by deleting the
           subject. */
        explained: (src.match(/A mint needs one size/g) || []).length,
      };
    });
    expect(r.mint, 'no sentence claims a mint needs one size').toBe(0);
    expect(r.share, 'and none claims they must all share a canvas size').toBe(0);
    expect(r.equals, 'and no check compares a pixel size to a cell count').toBe(0);
    expect(r.explained, 'but the comment explaining why still quotes it').toBe(1);
  });
});
