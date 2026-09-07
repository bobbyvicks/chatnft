/* The canvas size, worked out from the collection instead of typed in.

   "can we make it auto fit though? i feel like we can (LMNFT can)".

   The rule: a trait of side s drawn on blocks of b lands whole on a canvas of
   side C exactly when C/s reduces to p/q and q divides b. Every candidate is
   scored on how many traits land whole; ties go to fewest shrunk, then to the
   larger, because shrinking is the only thing here that can lose detail.

   WHY THIS IS NOT JUST TIDIER THAN A CONSTANT. 1280 was chosen by running a
   script over the files and reading a table, and while these tests were being
   written the artwork moved underneath it - every trait was resized, a v7
   bundle appeared and the mouth count changed twice. A number arrived at by
   measuring once and typed in is right until the day it is not, and nothing
   about it says which day that is.

   The fixtures are built from sizes and block patterns rather than from real
   files, so each one states the case it is about. Every canvas here is a size
   some trait actually has - the candidates are the sizes present, and a test
   asserting a size nothing has would be asserting something the code cannot
   do by design. */
import { test, expect } from '@playwright/test';

/* A trait of side `s` painted in flat blocks of `b`, so pixelBlock measures
   exactly b. Anything else would make these tests about pixelBlock. */
const make = (page, list) => page.evaluate(async (specs) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const recs = [];
  let i = 0;
  for (const sp of specs) {
    for (let n = 0; n < sp.count; n++) {
      const c = document.createElement('canvas');
      c.width = sp.s; c.height = sp.s;
      const g = c.getContext('2d');
      /* Flat b-by-b squares in two alternating colours. A single flat fill
         would measure as an enormous block and prove nothing. */
      for (let y = 0; y < sp.s; y += sp.b)
        for (let x = 0; x < sp.s; x += sp.b) {
          g.fillStyle = ((x / sp.b + y / sp.b) % 2) ? '#204080' : '#c08040';
          g.fillRect(x, y, sp.b, sp.b);
        }
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      recs.push({ id: 't_' + (i++) + '_x_approved', kind: 'trait', name: 't' + i,
        layer: 'x', status: 'approved', blob, w: sp.s, h: sp.s, rarity: 1, at: 1 });
    }
  }
  cItems = recs;
  return recs.length;
}, list);

const chose = (page) => page.evaluate(async () => await autoCanvas(cItems));

test.describe('the canvas the collection asks for', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof autoCanvas === 'function');
  });

  test('one size everywhere is that size', async ({ page }) => {
    /* The floor. If a collection is all one size and this picks anything else,
       every trait is being scaled for no reason at all. */
    await make(page, [{ s: 512, b: 8, count: 6 }]);
    expect(await chose(page)).toBe(512);
  });

  test('takes the size that keeps the most pixel blocks whole', async ({ page }) => {
    /* THE RULE. Six traits at 400 on 5px blocks and two at 500 on 5px blocks.
       At 400 the 500s scale by 4/5 - q is 5, and 5 divides 5, so they land
       whole too: 8 of 8. At 500 the 400s scale by 5/4 - q is 4, and 4 does not
       divide 5, so 6 of them break. 400 wins on whole blocks even though it
       shrinks two traits and 500 shrinks none. */
    await make(page, [{ s: 400, b: 5, count: 6 }, { s: 500, b: 5, count: 2 }]);
    expect(await chose(page), 'the size that breaks nothing').toBe(400);
  });

  test('and prefers to shrink nothing when the blocks come out equal',
    async ({ page }) => {
      /* THE TIE-BREAK, and it needs its own test: without it the rule above is
         satisfied by either answer whenever the counts match, and which one
         you get would be whichever the loop saw first.

         512 on 8px blocks and 1024 on 16px blocks. Both land whole on both
         candidates - 1024/512 is 2 and 512/1024 is 1/2, and the blocks divide
         either way - so the whole-block count cannot separate them. 1024
         shrinks nothing; 512 shrinks four. */
      await make(page, [{ s: 512, b: 8, count: 4 }, { s: 1024, b: 16, count: 4 }]);
      expect(await chose(page), 'the one that shrinks nothing').toBe(1024);
    });

  test('a size that breaks every block does not win by being biggest',
    async ({ page }) => {
      /* The 1048 case, in miniature. 1310 is 2 x 5 x 131 and 131 is prime, so
         nothing reduces against it: eight 1024s on 8px blocks all break, and
         the single 1310 is the only trait that lands whole there. 1024 keeps
         eight whole and breaks one, so it wins - and it is the SMALLER
         candidate, which is what proves the score is doing the work rather
         than a preference for size. */
      await make(page, [{ s: 1024, b: 8, count: 8 }, { s: 1310, b: 2, count: 1 }]);
      expect(await chose(page), 'the size the collection actually fits').toBe(1024);
    });

  test('the answer is remembered until the collection changes', async ({ page }) => {
    /* Measuring a block decodes a bitmap. Over a real 272-trait collection the
       first call takes about three seconds, so doing it per preview would make
       every draw unusable - and doing it never would leave the size stale
       after an import. */
    await make(page, [{ s: 512, b: 8, count: 8 }]);
    const r = await page.evaluate(async () => {
      const t0 = performance.now();
      const first = await autoCanvas(cItems);
      const t1 = performance.now();
      const second = await autoCanvas(cItems);
      const t2 = performance.now();
      return { first, second, coldMs: t1 - t0, warmMs: t2 - t1 };
    });
    expect(r.second, 'the same answer').toBe(r.first);
    expect(r.warmMs, 'and it did not measure anything the second time')
      .toBeLessThan(Math.max(1, r.coldMs / 4));
  });

  test('and is worked out again when the sizes change', async ({ page }) => {
    /* THE CONTROL on the cache, and the reason it is keyed on sizes rather
       than on a count: a cache that never expires is indistinguishable from a
       constant, which is the thing this replaces. */
    await make(page, [{ s: 512, b: 8, count: 6 }]);
    expect(await chose(page)).toBe(512);
    await make(page, [{ s: 800, b: 8, count: 6 }]);
    expect(await chose(page), 'a different collection gets a different answer').toBe(800);
  });

  test('an empty project falls back rather than throwing', async ({ page }) => {
    const r = await page.evaluate(async () => {
      cItems = [];
      return { side: await autoCanvas([]), fallback: CANVAS_SIDE };
    });
    expect(r.side, 'the measured fallback').toBe(r.fallback);
  });

  test('and every trait then fills what it chose', async ({ page }) => {
    /* The point of the whole thing, asserted end to end: whatever size comes
       back, nothing is left sitting smaller than it. */
    await make(page, [{ s: 400, b: 5, count: 3 }, { s: 500, b: 5, count: 2 },
      { s: 800, b: 10, count: 2 }]);
    const r = await page.evaluate(async () => {
      const side = await autoCanvas(cItems);
      const out = [];
      for (const rec of cItems) {
        const bm = await cBitmap(rec);
        const c = document.createElement('canvas');
        c.width = side; c.height = side;
        const g = c.getContext('2d');
        let drew = null;
        const real = g.drawImage.bind(g);
        g.drawImage = (im, dx, dy, dw, dh) => { drew = dw; return real(im, dx, dy, dw, dh); };
        paintTrait(g, bm, 0, 0, side, side);
        out.push({ src: bm.width, drawn: drew });
      }
      return { side, out };
    });
    for (const t of r.out) {
      expect(t.drawn, 'a ' + t.src + ' trait fills the ' + r.side + ' canvas').toBe(r.side);
      expect(t.drawn, 'and does not overflow it').toBeLessThanOrEqual(r.side);
    }
  });
});
