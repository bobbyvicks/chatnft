/* Hiding the base a trait was drawn on.

   The traits in this collection are drawn on top of a flat two-colour
   character and then cropped out of the render, and whatever the crop misses
   arrives as base that has to be erased by hand. Every number in these tests
   came off the real files:

     a render is 94.5% base at the lowest, over sixteen of them
     a finished trait is 79.1% two-colour at the highest, over 264 of them
     the base cloud is complete by radius 12 and flat past it
     the same base re-encodes between renders - two greens 29.9 apart

   THE FIXTURES CARRY THAT NOISE ON PURPOSE. A base painted as one exact value
   would pass every one of these tests against code that only ever removed one
   exact value, which is the version that does not help anybody: the real
   difficulty is that a render holds 36,070 distinct colours and its commonest
   single shade is 4.7% of the picture.

   Four things are load-bearing and each has its own test rather than being
   implied by a bigger one: what counts as a base, that a finished trait is
   never touched unasked, that a REMEMBERED base is recognised across the
   re-encoding, and that the button refuses when it does not know. */
import { test, expect } from '@playwright/test';

/* A picture made of two flat colours plus a small shape in its own colour,
   with per-pixel noise so the base is a cloud rather than a value. `share` is
   how much of it is base; the rest is the shape. */
const paint = ({ w = 120, h = 120, a, b, art = [20, 20, 20], share = 0.95, jitter = 3 }) => ({
  w, h, a, b, art, share, jitter,
});

const open = (page, spec) => page.evaluate(async (s) => {
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const x = c.getContext('2d', { willReadFrequently: true });
  const im = x.createImageData(s.w, s.h);
  const d = im.data;
  /* A deterministic wobble - Math.random would make a red unreproducible. */
  let seed = 12345;
  const wob = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 7) - 3; };
  const artRows = Math.round(s.h * (1 - s.share));
  for (let y = 0; y < s.h; y++) {
    for (let xx = 0; xx < s.w; xx++) {
      const i = (y * s.w + xx) * 4;
      let col;
      if (y < artRows) col = s.art;                       /* the trait */
      else if (y % 3 === 0) col = s.b;                    /* the ink */
      else col = s.a;                                     /* the fill */
      const j = (col === s.art) ? 0 : s.jitter;
      d[i] = Math.max(0, Math.min(255, col[0] + (j ? wob() : 0)));
      d[i + 1] = Math.max(0, Math.min(255, col[1] + (j ? wob() : 0)));
      d[i + 2] = Math.max(0, Math.min(255, col[2] + (j ? wob() : 0)));
      d[i + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  const pal = palette(d, s.w * s.h, 24, 64);
  fileName = 'fixture.png';
  startEditor(d, s.w, s.h, s.w, s.h, pal, false);
  await new Promise(r => setTimeout(r, 120));
  const after = ctx.getImageData(0, 0, art.width, art.height).data;
  let opaque = 0;
  for (let i = 3; i < after.length; i += 4) if (after[i] >= 128) opaque++;
  const pl = basePlan();
  return {
    opaque, total: s.w * s.h,
    source: pl && pl.source, cover: pl && pl.cover, tol: pl && pl.tol,
    colours: pl ? pl.list.map(q => hex(q.r, q.g, q.b)) : [],
    remembered: BASE_KEEP.map(q => hex(q.r, q.g, q.b)),
    label: document.getElementById('hidebase').textContent,
    disabled: document.getElementById('hidebase').disabled,
    undo: undoStack.length,
  };
}, spec);

/* The real pair, near enough: a deep pink and a green, as the renders use. */
const PINK = [230, 3, 124], GREEN = [6, 214, 1];

test.describe('the base a trait was drawn on', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof basePlan === 'function');
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      activeWs = null;
      await dbClear();
      BASE_KEEP = [];
    });
  });

  test('the button is in the page and something wired a handler to it', async ({ page }) => {
    /* The cheapest catch for the whole class. A feature can be measured
       perfect and still be unreachable, and this file would not notice. */
    const r = await page.evaluate(() => {
      const b = document.getElementById('hidebase');
      return { there: !!b, wired: !!(b && typeof b.onclick === 'function') };
    });
    expect(r.there, 'the button exists').toBe(true);
    expect(r.wired, 'and is connected to something').toBe(true);
  });

  test('a render clears itself on open, and is remembered', async ({ page }) => {
    /* 95% base over two saturated colours is a render. Measured over sixteen
       real ones the lowest is 94.5%. */
    const r = await open(page, paint({ a: PINK, b: GREEN, share: 0.95 }));
    expect(r.opaque, 'the base is gone and the trait is not')
      .toBeLessThan(r.total * 0.10);
    expect(r.opaque, 'the trait itself survived').toBeGreaterThan(0);
    expect(r.remembered.length, 'and its colours were written down').toBe(2);
    expect(r.undo, 'undo can put it back').toBeGreaterThan(0);
  });

  test('but a finished trait is never touched without being asked', async ({ page }) => {
    /* THE ONE THAT PROTECTS THE COLLECTION. hats/Coinbase Cap.png is two blues
       covering 79.1% of itself, the highest of the 264 approved traits, and it
       is a trait rather than a render. Nothing may clear it on open. */
    const r = await open(page, paint({ a: [0, 57, 253], b: [0, 36, 174], share: 0.79 }));
    expect(r.opaque, 'every pixel is still there').toBe(r.total);
    expect(r.source, 'and it is not mistaken for a render').not.toBe('render');
  });

  test('and the button refuses when it does not know what the base is',
    async ({ page }) => {
      /* Pressed on that same two-blue trait with nothing remembered, the old
         version took the two biggest saturated colours and removed 79% of it.
         Refusing is the feature. */
      const before = await open(page, paint({ a: [0, 57, 253], b: [0, 36, 174], share: 0.79 }));
      expect(before.source, 'nothing here is a known base').toBe('guess');
      expect(before.disabled, 'so the button is not offered').toBe(true);
      const after = await page.evaluate(() => {
        hideBaseClicked();
        const d = ctx.getImageData(0, 0, art.width, art.height).data;
        let opaque = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i + 3 - 3] >= 0 && d[i] >= 128) opaque++;
        return { opaque, note: document.getElementById('toast').textContent };
      });
      expect(after.opaque, 'and pressing it anyway changes nothing').toBe(before.total);
    });

  test('a remembered base is found again although it re-encoded', async ({ page }) => {
    /* THE TEST THAT MATTERS FOR THE ACTUAL COMPLAINT, and the one that caught
       the defect worth catching. The crop is where the base is a fringe, so it
       can only be removed if it is known - and it is never the same value
       twice. Measured across the sixteen renders the green runs #03D105 to
       #08E401, 29.9 apart, and a pink remembered from one sits 13.9 from the
       pink in another.

       At a recognition radius of 12 that green was simply not found: five of
       the sixteen crops came out with a third to all of the base still in
       them, and the code reported success. */
    await open(page, paint({ a: PINK, b: GREEN, share: 0.95 }));
    const learnt = await page.evaluate(() => BASE_KEEP.map(q => hex(q.r, q.g, q.b)));
    expect(learnt.length, 'a base was learnt from the render').toBe(2);

    /* A different render of the same base: both colours shifted about 25,
       which is what re-encoding does, and only a fringe of it left after a
       crop. */
    const r = await open(page, paint({
      a: [PINK[0] - 14, PINK[1] + 3, PINK[2] - 20],
      b: [GREEN[0] + 4, GREEN[1] - 25, GREEN[2] + 12],
      share: 0.30,
    }));
    expect(r.source, 'it is recognised from memory, not detected').toBe('remembered');
    expect(r.disabled, 'so the button is offered').toBe(false);
    expect(r.label, 'and says what share it would take').toMatch(/\d+%/);

    const cleaned = await page.evaluate(() => {
      const total = art.width * art.height;
      hideBaseClicked();
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let opaque = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] >= 128) opaque++;
      return { opaque, total };
    });
    /* The fringe was 30% of it; what remains is the trait, and nearly all of
       the trait. */
    expect(cleaned.opaque, 'the base fringe went').toBeLessThan(cleaned.total * 0.78);
    expect(cleaned.opaque, 'and the trait did not').toBeGreaterThan(cleaned.total * 0.62);
  });

  test('a remembered base does NOT clear itself on open', async ({ page }) => {
    /* THE CONTROL on the test above, and a deliberate retreat. A picture that
       merely contains the remembered colours cannot be told from a crop
       leftover by how much of it there is - measured over the 264 approved
       traits, clearing on that footing took 19.2% of backgrounds/I Heart
       Boobies.png, which is simply pink. So it waits to be asked. */
    await open(page, paint({ a: PINK, b: GREEN, share: 0.95 }));
    const r = await open(page, paint({
      a: [PINK[0] - 14, PINK[1] + 3, PINK[2] - 20],
      b: [GREEN[0] + 4, GREEN[1] - 25, GREEN[2] + 12],
      share: 0.30,
    }));
    expect(r.source, 'the memory recognised it').toBe('remembered');
    expect(r.opaque, 'and nothing was removed until asked').toBe(r.total);
  });

  test('the cloud is removed, not just its commonest shade', async ({ page }) => {
    /* The whole reason this exists. A render holds 36,070 distinct colours and
       its commonest single shade is 4.7% of the picture, so anything that
       removes one value leaves the base essentially untouched. The fixture's
       jitter is what makes this test capable of failing. */
    const r = await page.evaluate(async ([pink, green]) => {
      const W = 120, H = 120;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      const im = x.createImageData(W, H), d = im.data;
      let seed = 999;
      const wob = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 9) - 4; };
      for (let p = 0; p < W * H; p++) {
        const i = p * 4;
        const col = ((p / W) | 0) < 8 ? [20, 20, 20] : (p % 3 === 0 ? green : pink);
        const j = col[0] === 20 ? 0 : 1;
        d[i] = col[0] + (j ? wob() : 0);
        d[i + 1] = col[1] + (j ? wob() : 0);
        d[i + 2] = col[2] + (j ? wob() : 0);
        d[i + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      const shades = new Set();
      for (let i = 0; i < d.length; i += 4)
        if (((i / 4 / W) | 0) >= 8) shades.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      fileName = 'cloud.png';
      startEditor(d, W, H, W, H, palette(d, W * H, 24, 64), false);
      await new Promise(r2 => setTimeout(r2, 120));
      const after = ctx.getImageData(0, 0, art.width, art.height).data;
      let left = 0;
      for (let i = 3; i < after.length; i += 4) if (after[i] >= 128) left++;
      return { shades: shades.size, left, total: W * H, artRows: 8 * W };
    }, [PINK, GREEN]);
    expect(r.shades, 'the base really is many shades, not one')
      .toBeGreaterThan(50);
    expect(r.left, 'and all of them went, leaving the trait')
      .toBeLessThan(r.artRows * 1.35);
  });
});

test.describe('the blended edge between the base and the trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof basePlan === 'function');
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      activeWs = null; await dbClear(); BASE_KEEP = [];
    });
  });

  test('is decided by the palette, and does not eat the trait', async ({ page }) => {
    /* THE MEASUREMENT THIS EXISTS TO PROTECT, and it came from a suggestion
       rather than from me: the Clean up colours button snaps every pixel to
       the nearest colour the art really uses, which answers the blend exactly
       instead of guessing at it.

       Over 26 cropped renders, through the page's own functions:

         a ball plus an edge peel   0.6% base left, 4.2% OF THE TRAIT LOST
         judged by the palette      0.7% base left, 0.0% of the trait lost

       The 4.2% was the trait's own anti-aliased edge, removed for being near
       the base. This fixture is that edge and nothing else: a hard band of
       trait, then eight rows blending from trait colour to base colour, then
       base. Every row past the halfway point of the blend belongs to the
       trait and must still be there. */
    const r = await page.evaluate(async () => {
      const W = 160, H = 160, BAND = 40, BLEND = 8;
      const PINKC = [230, 3, 124], ART = [30, 40, 200];
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      const im = x.createImageData(W, H), d = im.data;
      let seed = 4242;
      const wob = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 5) - 2; };
      for (let y = 0; y < H; y++) {
        for (let xx = 0; xx < W; xx++) {
          const i = (y * W + xx) * 4;
          let col, jitter = true;
          if (y < BAND) { col = ART; jitter = false; }
          else if (y < BAND + BLEND) {
            /* The halo: a straight mix, which is what an anti-aliased edge is. */
            const t = (y - BAND + 1) / (BLEND + 1);
            col = [Math.round(ART[0] + (PINKC[0] - ART[0]) * t),
                   Math.round(ART[1] + (PINKC[1] - ART[1]) * t),
                   Math.round(ART[2] + (PINKC[2] - ART[2]) * t)];
            jitter = false;
          } else col = PINKC;
          d[i] = col[0] + (jitter ? wob() : 0);
          d[i + 1] = col[1] + (jitter ? wob() : 0);
          d[i + 2] = col[2] + (jitter ? wob() : 0);
          d[i + 3] = 255;
        }
      }
      x.putImageData(im, 0, 0);
      /* Taught the base by hand rather than by a render, because this fixture
         is deliberately only 70% base and must not be mistaken for one. */
      await saveBaseColours([{ r: PINKC[0], g: PINKC[1], b: PINKC[2] }]);
      fileName = 'edge.png';
      startEditor(d, W, H, W, H, palette(d, W * H, 24, 64), false);
      await new Promise(rr => setTimeout(rr, 80));
      hideBaseClicked();
      await new Promise(rr => setTimeout(rr, 80));
      const out = ctx.getImageData(0, 0, W, H).data;
      /* Counted by row, so a failure says WHERE it ate rather than how much. */
      const solidTrait = [], deepBase = [], blend = [];
      for (let y = 0; y < H; y++) {
        let opaque = 0;
        for (let xx = 0; xx < W; xx++) if (out[(y * W + xx) * 4 + 3] >= 128) opaque++;
        if (y < BAND) solidTrait.push(opaque);
        /* The blend, all of it, so the halo left behind can be COUNTED rather
           than asserted away. This is the honest half of the test and it is
           written to the measured limit rather than to the wish.

           The judgement is made on the palette the Clean up colours button
           builds, whose tolerance is 30, so eight rows of gradient arrive as
           three entries and each entry decides for every row inside it. Dumped
           for this fixture: heads at 74, 122 and 171 from the base against 219
           across the whole blend. The cut lands at the palette's resolution,
           which leaves about one row.

           A pass that reclassified those middle entries by whether they were
           nearer the base than the trait's heavy colours WAS built and is not
           here: it cleared the base completely and took 51.1% OF THE TRAIT on
           the sixteen real crops, because real artwork is full of light
           shading colours that are nearer a pink base than they are to the
           trait's own dominant blue. Measured, reverted, and recorded so it is
           not tried a third time. */
        if (y >= BAND && y < BAND + BLEND) blend.push(opaque);
        if (y >= BAND + BLEND + 4) deepBase.push(opaque);
      }
      return { W, BLEND, solidTrait, deepBase, blend };
    });
    expect(Math.min(...r.solidTrait), 'not one row of the trait was touched').toBe(r.W);
    expect(Math.max(...r.deepBase), 'and the base itself is gone').toBe(0);
    /* THE HALO, AND WHAT IS HONESTLY CLAIMED ABOUT IT.

       The rows of the blend that fall within the palette's own tolerance of
       the base join the base entry and go. The rest do not: measured on this
       fixture, seven of eight survive, and on the sixteen real crops the
       leftover is 0.7% of the base. So a thin anti-aliased edge is still
       there afterwards and this test says so rather than asserting it away.

       That is NOT fixed by cleaning the palette first, which was the obvious
       thing to try: clean-then-hide leaves the same 0.7%. The difference
       cleaning makes is to the TRAIT - 4.2% lost against 0.0% - which is why
       the palette decides here and does not snap.

       The last row is asserted because it is the one the mechanism guarantees,
       and asserting it stops this test passing on a picture nothing touched. */
    expect(r.blend[r.blend.length - 1],
      'the row of blend nearest the base goes with it').toBe(0);
  });
});
