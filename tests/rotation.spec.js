/* Pixelorama's rotation and Scale3x, ported: rotxel, nn_rotate, scale_3x.

   EVERY EXPECTED PIXEL HERE WAS WORKED OUT BY HAND from DrawingAlgos.gd -
   the nine sub-cells turned back one at a time, roundi half away from zero,
   the odd-width shift, the nine edge rules on the neighbourhood the hit
   landed in - and NOT by running the port and copying what came out. The
   working is in REPORT.md beside the patch. A port that drifted by one
   sub-cell, one rounding rule or one clause of one edge rule changes at
   least one of these bytes, which is what makes them worth the arithmetic.

   Two layers. The algorithms are called directly first, because they are
   pure functions and a wrong byte there says exactly which function is
   wrong. Then the same numbers go through the panel - PB.rotate, the preset,
   Resize, Undo - which is the only way to know the chip actually decides
   what the button does.

   The colours are chosen so that every pair differs by at least 127 in R or
   B: similar_colors allows 100 (its default) or 49 (Scale3x's), so nothing
   here is accidentally "similar" and every edge rule is decided by the
   transparent border alone, which is derivable. */
import { test, expect } from '@playwright/test';
import { openTrait, setField } from './helpers.js';

const T = [0, 0, 0, 0];
const K = [0, 0, 0, 255], W = [255, 255, 255, 255];
/* The nine-colour 3x3: R by column, B by row. */
const A = (x, y) => [[0, 128, 255][x], 0, [0, 128, 255][y], 255];

/* Flatten a grid of [r,g,b,a] into the byte order getImageData uses. */
const bytes = grid => grid.flat(2);
const pixels = page => page.evaluate(() => Array.from(ctx.getImageData(0, 0, art.width, art.height).data));
const size = page => page.evaluate(() => art.width + 'x' + art.height);

/* Nine distinct colours on a 3x3 canvas. */
const NINE = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [[0, 128, 255][x], 0, [0, 128, 255][y]]);
};

test.describe('the ported algorithms, called directly', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 8, h: 8, draw: (set, W, H) => { set(0, 0, [10, 20, 30]); } });
  });

  test('scale_3x on a 2x2 diagonal gives the nine rules\' answer in every cell', async ({ page }) => {
    /* Black at (0,0) and (1,1), white elsewhere. Each of the four source
       pixels sees its clamped neighbourhood; the 36 cells below are the nine
       rules applied to each by hand (REPORT.md, "scale_3x on the diagonal").
       The corners that stay black are where an edge continues; the ones that
       turn white are where the rules see a step and not an edge. */
    const want = ['KKKWWW', 'KKWKWW', 'KWWKKW', 'WKKWWK', 'WWKWKK', 'WWWKKK'];
    const got = await page.evaluate(() => {
      const d = new Uint8ClampedArray(2 * 2 * 4);
      const put = (x, y, c) => d.set(c, (y * 2 + x) * 4);
      put(0, 0, [0, 0, 0, 255]); put(1, 1, [0, 0, 0, 255]);
      put(1, 0, [255, 255, 255, 255]); put(0, 1, [255, 255, 255, 255]);
      return Array.from(scale3x(d, 2, 2));
    });
    expect(got.length).toBe(6 * 6 * 4);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const o = (y * 6 + x) * 4, w = want[y][x] === 'K' ? K : W;
      expect(got.slice(o, o + 4), 'cell ' + x + ',' + y).toEqual(w);
    }
  });

  test('nn_rotate maps each destination onto the source pixel the maths says, and clips', async ({ page }) => {
    /* Nine colours, pivot (1.5,1.5) - the dialog's rule for a 3-wide -
       angle -PI/4, which is what the dialog hands its algorithms for a 45
       degree turn. ox = (x-px)cos - (y-py)sin + px, truncated; outside the
       image is transparent. With cos = -sin = 0.7071 that is
       ox = 0.7071(x+y-3)+1.5 and oy = 0.7071(y-x)+1.5, so the centre (1,1)
       reads 0.79,1.5 - source (0,1), not (1,1): a first draft of this table
       had the centre map to itself and the port refused it. Worked in
       REPORT.md. */
    const want = [[T, A(0, 0), A(0, 0)], [A(0, 2), A(0, 1), A(1, 0)], [A(0, 2), A(1, 2), A(2, 1)]];
    const got = await page.evaluate(() => {
      const d = new Uint8ClampedArray(9 * 4);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) d.set([[0, 128, 255][x], 0, [0, 128, 255][y], 255], (y * 3 + x) * 4);
      const p = pxPivot(3, 3);
      return { p, out: Array.from(nnRotate(d, 3, 3, -Math.PI / 4, p)) };
    });
    expect(got.p, 'half the size, and a 3-wide is odd so no half-pixel correction').toEqual({ x: 1.5, y: 1.5 });
    expect(got.out).toEqual(bytes(want));
  });

  test('rotxel finds the sub-cell, picks the rule, and clips where none lands', async ({ page }) => {
    /* Same image and angle. Every destination pixel's nine sub-cells were
       turned back by hand until one landed; that sub-cell's index picks the
       rule. Eight of the nine land on a border source pixel and copy it; the
       one interior hit (dest 2,1 -> source 1,1, index 5) has no similar
       neighbours so rule 5 falls through to e. Dest (0,2) is reached by no
       sub-cell at all and is transparent. */
    const want = [[A(0, 1), A(0, 1), A(1, 0)], [A(0, 2), A(1, 2), A(1, 1)], [T, A(2, 2), A(2, 2)]];
    const got = await page.evaluate(() => {
      const d = new Uint8ClampedArray(9 * 4);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) d.set([[0, 128, 255][x], 0, [0, 128, 255][y], 255], (y * 3 + x) * 4);
      return Array.from(rotxel(d, 3, 3, -Math.PI / 4, pxPivot(3, 3)));
    });
    expect(got).toEqual(bytes(want));
  });

  test('and an edge rule fires when the neighbourhood says so - and not when it does not', async ({ page }) => {
    /* The same turn lands dest (2,1) on source (1,1) at index 5, whose rule
       is: f if (bf && !db && !fh && !ei) or (fh && !bf && !dh && !ec), else
       e. White everywhere except f=(2,1), h=(1,2) and c=(2,0) black makes
       the second clause true - fh similar, bf and dh not, and ec not because
       c is black while e is white - so the pixel comes out BLACK though e
       is white. (A first draft left c white, which makes e and c similar,
       !ec false, and the clause dead: the port said so.) Making h white
       again breaks fh, and the same pixel comes out white. One source pixel
       apart, and the rule is the only thing that differs. c never reaches
       the output any other way: the eight border hits copy d, b, h, g and i. */
    const r = await page.evaluate(() => {
      const img = (hBlack) => {
        const d = new Uint8ClampedArray(9 * 4);
        for (let i = 0; i < 9; i++) d.set([255, 255, 255, 255], i * 4);
        d.set([0, 0, 0, 255], (1 * 3 + 2) * 4);            // f = (2,1)
        d.set([0, 0, 0, 255], (0 * 3 + 2) * 4);            // c = (2,0)
        if (hBlack) d.set([0, 0, 0, 255], (2 * 3 + 1) * 4); // h = (1,2)
        return d;
      };
      const at = (out, x, y) => Array.from(out.slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4));
      const fires = rotxel(img(true), 3, 3, -Math.PI / 4, pxPivot(3, 3));
      const quiet = rotxel(img(false), 3, 3, -Math.PI / 4, pxPivot(3, 3));
      return { fires: at(fires, 2, 1), quiet: at(quiet, 2, 1), firesLeft: at(fires, 1, 1), quietLeft: at(quiet, 1, 1) };
    });
    expect(r.fires, 'rule 5 picks f (black) over e (white)').toEqual(K);
    expect(r.quiet, 'with fh false the rule falls through to e').toEqual(W);
    /* The control beside it: dest (1,1) copies border source (1,2) - h -
       plain, so it follows h and not the rule. */
    expect(r.firesLeft).toEqual(K);
    expect(r.quietLeft).toEqual(W);
  });

  test('the special angles take their special paths: a half is rotate_180, a quarter is nn_rotate, nothing is nothing', async ({ page }) => {
    /* 4x4, pivot (1.5,1.5) - an even side is corrected by half a pixel.
       At PI, rotate_180 gives source (3-x, 3-y), exactly. At 0 and at TAU
       the bytes come back unchanged. At PI/2 rotxel hands over to nn_rotate,
       so the two must agree byte for byte - and that is ALL that is claimed
       of the quarter. On paper nn_rotate at PI/2 is the permutation
       (3-y, x); in doubles cos(PI/2) is 6.1e-17, and (x-1.5)*that pushes a
       source coordinate of 1 to 0.9999999999999999, which truncates to 0.
       Pixelorama computes in the same doubles and gets the same thing.
       A first draft of this test pinned the clean permutation and the port
       refused it; the honest claim is the routing. This editor never sends
       a quarter down this path - rotateFree takes 90, 180 and 270 to
       rotateQuarter, which is an exact permutation, tested below. */
    const r = await page.evaluate(() => {
      const d = new Uint8ClampedArray(16 * 4);
      for (let i = 0; i < 16; i++) d.set([i * 16, 7, 255 - i * 16, 255], i * 4);
      const p = pxPivot(4, 4);
      const px = (out, x, y) => Array.from(out.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
      const src = (x, y) => px(d, x, y);
      const q = rotxel(d, 4, 4, Math.PI / 2, p), qn = nnRotate(d, 4, 4, Math.PI / 2, p);
      const h = rotxel(d, 4, 4, Math.PI, p);
      const z = rotxel(d, 4, 4, 0, p), tau = rotxel(d, 4, 4, 2 * Math.PI, p);
      let halfOk = true;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
        if (px(h, x, y).join() !== src(3 - x, 3 - y).join()) halfOk = false;
      const same = (a, b) => Array.from(a).join() === Array.from(b).join();
      return { p, halfOk, quarterRouted: same(q, qn), zero: same(z, d), tau: same(tau, d), quarterMoved: !same(q, d) };
    });
    expect(r.p, 'even sides lose half a pixel').toEqual({ x: 1.5, y: 1.5 });
    expect(r.halfOk, 'PI is rotate_180').toBe(true);
    expect(r.quarterRouted, 'PI/2 is whatever nn_rotate says').toBe(true);
    expect(r.quarterMoved, 'and it is a turn, not a no-op').toBe(true);
    expect(r.zero).toBe(true);
    expect(r.tau).toBe(true);
  });

  test('similar_colors keeps both of Pixelorama\'s tolerances at the byte they were tuned to', async ({ page }) => {
    /* 0.392157 is 100/255 and a difference of 100 is inside it; 101 is not.
       0.196078 is a hair UNDER 50/255, so under Scale3x's tolerance 50 apart
       is NOT similar and 49 is. Alpha counts like any channel. */
    const r = await page.evaluate(() => {
      const pair = (a, b) => new Uint8ClampedArray([a, 0, 0, 255, b, 0, 0, 255]);
      const alpha = (a, b) => new Uint8ClampedArray([9, 9, 9, a, 9, 9, 9, b]);
      return {
        d100: pxSimilar(pair(0, 100), 0, 4), d101: pxSimilar(pair(0, 101), 0, 4),
        s49: pxSimilar(pair(0, 49), 0, 4, PX_TOL_S3X), s50: pxSimilar(pair(0, 50), 0, 4, PX_TOL_S3X),
        a100: pxSimilar(alpha(155, 255), 0, 4), a101: pxSimilar(alpha(154, 255), 0, 4),
        tol: [PX_TOL, PX_TOL_S3X],
      };
    });
    expect(r.tol).toEqual([0.392157, 0.196078]);
    expect(r.d100).toBe(true); expect(r.d101).toBe(false);
    expect(r.s49).toBe(true); expect(r.s50).toBe(false);
    expect(r.a100).toBe(true); expect(r.a101).toBe(false);
  });
});

test.describe('a turn through the Transform panel', () => {
  /* The nine-colour 3x3 turned 30 degrees. The canvas grows to 5x5 either
     way (ceil(3cos30 + 3sin30) = ceil(4.098)); the art is centred on it by
     recanvas's floor rule, at (1..3, 1..3); then each option samples.

     NEAREST is the loop this editor always had: dest centre turned back,
     floored. ROTXEL is Pixelorama's on the padded 5x5 about the dialog's
     pivot (2.5,2.5), with the odd-width shift. All fifty pixels are worked
     in REPORT.md; three art pixels vanish under Rotxel because an edge rule
     at a 1-pixel corner picks the transparent neighbour, and the whole lands
     one column to the right of Nearest - which is the pivot rule at work on
     a 5-wide, measured and recorded there too. */
  const NEAREST = [
    [T, T, T, T, T],
    [T, A(0, 1), A(1, 0), A(1, 0), T],
    [T, A(0, 2), A(1, 1), A(2, 1), T],
    [T, A(1, 2), A(2, 2), A(2, 1), T],
    [T, T, T, T, T]];
  const ROTXEL = [
    [T, T, T, T, T],
    [T, T, A(0, 1), A(1, 0), T],
    [T, T, A(1, 2), A(2, 1), A(2, 1)],
    [T, T, A(1, 2), A(2, 2), T],
    [T, T, T, T, T]];

  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 3, h: 3, draw: NINE });
    /* Precondition, asserted: the open path put the fixture down unchanged. */
    expect(await pixels(page)).toEqual(bytes([[A(0, 0), A(1, 0), A(2, 0)], [A(0, 1), A(1, 1), A(2, 1)], [A(0, 2), A(1, 2), A(2, 2)]]));
  });

  test('Nearest is the default and is the loop it always was', async ({ page }) => {
    const r = await page.evaluate(() => ({ chip: chipVal('rotalg'), turns: PB.turns(), res: PB.rotate(30) }));
    expect(r.chip).toBe('nearest');
    expect(r.turns).toEqual(['nearest', 'rotxel']);
    expect(r.res).toEqual({ ok: true, deg: 30, alg: 'nearest', turned: true, w: 5, h: 5 });
    expect(await pixels(page)).toEqual(bytes(NEAREST));
  });

  test('Rotxel is Pixelorama\'s, on the same canvas size, and the chip is what decides', async ({ page }) => {
    const r = await page.evaluate(() => PB.rotate(30, 'rotxel'));
    expect(r).toEqual({ ok: true, deg: 30, alg: 'rotxel', turned: true, w: 5, h: 5 });
    expect(await page.evaluate(() => chipVal('rotalg')), 'the panel shows the choice that was made').toBe('rotxel');
    expect(await pixels(page)).toEqual(bytes(ROTXEL));
    /* The two are different pictures - the positive control that the chip
       reached the sampler and did not merely change a label. */
    expect(bytes(ROTXEL)).not.toEqual(bytes(NEAREST));
  });

  test('one undo takes a Rotxel turn back, bytes and size', async ({ page }) => {
    const before = await pixels(page);
    await page.evaluate(() => PB.rotate(30, 'rotxel'));
    expect(await size(page)).toBe('5x5');
    await page.evaluate(() => $('undo').click());
    await page.waitForTimeout(100);
    expect(await size(page)).toBe('3x3');
    expect(await pixels(page)).toEqual(before);
  });

  test('a name that is not a turn is refused, and nothing moves', async ({ page }) => {
    const r = await page.evaluate(() => PB.rotate(30, 'bilinear'));
    expect(r.ok).toBe(false);
    expect(r.why).toContain('bilinear');
    expect(await size(page)).toBe('3x3');
  });

  test('a quarter stays exact under either option, and a turn of nothing is not an edit', async ({ page }) => {
    const r = await page.evaluate(() => {
      const depth = () => undoStack.length;
      const d0 = depth();
      const q = PB.rotate(90, 'rotxel');
      const d1 = depth();
      const z = PB.rotate(0, 'rotxel');
      return { q, z, steps: [d1 - d0, depth() - d1] };
    });
    expect(r.q.turned).toBe(true);
    expect(r.steps[0], 'the quarter is one undo step').toBe(1);
    /* rotateQuarter: dest (nx,ny) = (H-1-y, x) from source (x,y) - a pure
       permutation, so the nine colours are all still there, once each. */
    expect(await pixels(page)).toEqual(bytes([[A(0, 2), A(0, 1), A(0, 0)], [A(1, 2), A(1, 1), A(1, 0)], [A(2, 2), A(2, 1), A(2, 0)]]));
    expect(r.z.turned, 'zero degrees is refused').toBe(false);
    expect(r.steps[1], 'and costs no undo step').toBe(0);
  });

  test('the panel carries the controls, titled, and a typed angle previews without sampling', async ({ page }) => {
    const r = await page.evaluate(() => {
      railPanel('tf', true);
      const card = document.querySelector('#tfscrim .card');
      const chip = v => card.querySelector('#rotalg [data-v="' + v + '"]');
      const t = id => (card.querySelector('#' + id) || {}).title || '';
      $('rotdeg').value = '30'; $('rotdeg').dispatchEvent(new Event('input', { bubbles: true }));
      const preview = $('frame').style.transform;
      const bytesDuring = Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join();
      railPanel('tf', false);
      return {
        chips: ['nearest', 'rotxel'].map(v => !!chip(v)),
        chipTitles: ['nearest', 'rotxel'].map(v => (chip(v).title || '').length > 20),
        titles: [t('rotdeg').length > 20, t('rotgo').length > 20],
        close: !!card.querySelector('#tfclose'),
        preview, bytesDuring,
        afterClose: { transform: $('frame').style.transform, deg: $('rotdeg').value },
        size: art.width + 'x' + art.height,
      };
    });
    expect(r.chips).toEqual([true, true]);
    expect(r.chipTitles, 'every chip says what it does').toEqual([true, true]);
    expect(r.titles, 'the field and the button too').toEqual([true, true]);
    expect(r.close).toBe(true);
    expect(r.preview, 'the CSS turn the drag uses').toContain('rotate(30deg)');
    expect(r.size, 'nothing sampled while typing').toBe('3x3');
    expect(r.afterClose, 'closing takes the preview down and zeroes the number').toEqual({ transform: '', deg: '0' });
  });

  test('the Turn button commits the typed angle through the same path', async ({ page }) => {
    await page.evaluate(() => { railPanel('tf', true); setChip('rotalg', 'rotxel'); });
    await setField(page, 'rotdeg', 30);
    await page.click('#rotgo');
    await page.waitForTimeout(150);
    expect(await size(page)).toBe('5x5');
    expect(await pixels(page)).toEqual(bytes(ROTXEL));
    expect(await page.evaluate(() => [$('rotdeg').value, $('frame').style.transform]), 'field back to 0, preview down').toEqual(['0', '']);
    await page.evaluate(() => railPanel('tf', false));
  });
});

test.describe('Scale3x in the grow presets', () => {
  /* The 2x2 diagonal again, so the expected 6x6 is the one worked by hand
     above - this time through the preset, the Growing chip, Resize and Undo. */
  const DIAG = (set) => { set(0, 0, [0, 0, 0]); set(1, 1, [0, 0, 0]); set(1, 0, [255, 255, 255]); set(0, 1, [255, 255, 255]); };
  const WANT = ['KKKWWW', 'KKWKWW', 'KWWKKW', 'WKKWWK', 'WWKWKK', 'WWWKKK'];
  const want6 = () => { const g = []; for (const row of WANT) { const r = []; for (const ch of row) r.push(ch === 'K' ? K : W); g.push(r); } return g; };
  /* Blocks at 3x: every pixel becomes a 3x3 of itself - the control, so the
     chip is seen to decide and not merely to be labelled. */
  const blocks6 = () => { const g = []; for (let y = 0; y < 6; y++) { const r = []; for (let x = 0; x < 6; x++) r.push(((x / 3 | 0) === (y / 3 | 0)) ? K : W); g.push(r); } return g; };

  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 2, h: 2, draw: DIAG });
    /* Snap would move 6 to a rung of the 160 ladder; the preset promises
       exactly three times, and this is about that promise. */
    await page.evaluate(() => { if (pressed('rssnap')) $('rssnap').click(); });
  });

  test('the preset is offered, fills the boxes with three times, sets the chip, and the note says so', async ({ page }) => {
    const r = await page.evaluate(() => {
      railPanel('tf', true);
      const opt = [...$('rspreset').options].find(o => o.value === 's3x');
      const chipBefore = chipVal('rsalg');
      $('rspreset').value = 's3x'; $('rspreset').dispatchEvent(new Event('change', { bubbles: true }));
      const out = { label: opt && opt.textContent, chipBefore, chip: chipVal('rsalg'), w: $('rsw').value, h: $('rsh').value,
        mode: chipVal('rsmode'), note: $('rsnow').textContent,
        chipTitles: ['blocks', 'scale3x'].map(v => (document.querySelector('#rsalg [data-v="' + v + '"]').title || '').length > 20) };
      railPanel('tf', false);
      return out;
    });
    expect(r.label).toBe('6 × 6 (3× Scale3x)');
    expect(r.chipBefore, 'Blocks is the default, so nothing anyone has changes').toBe('blocks');
    expect(r.chip).toBe('scale3x');
    expect([r.w, r.h, r.mode]).toEqual(['6', '6', 'art']);
    expect(r.note, 'what the button will do, said before the press').toContain('Scale3x, 1 pass');
    expect(r.note).not.toContain('then nearest');
    expect(r.chipTitles).toEqual([true, true]);
  });

  test('Resize then gives the 36 cells the rules give, and one undo takes it back', async ({ page }) => {
    const before = await pixels(page);
    const r = await page.evaluate(() => PB.scale3x(true));
    expect(r).toMatchObject({ ok: true, applied: true, was: '2x2', w: 6, h: 6, alg: 'scale3x' });
    await page.evaluate(() => railPanel('tf', false));
    expect(await pixels(page)).toEqual(bytes(want6()));
    await page.evaluate(() => $('undo').click());
    await page.waitForTimeout(100);
    expect(await size(page)).toBe('2x2');
    expect(await pixels(page)).toEqual(before);
  });

  test('with the chip on Blocks the same numbers give plain 3x3 blocks', async ({ page }) => {
    await page.evaluate(() => {
      railPanel('tf', true);
      $('rspreset').value = 's3x'; $('rspreset').dispatchEvent(new Event('change', { bubbles: true }));
      setChip('rsalg', 'blocks');
    });
    const note = await page.evaluate(() => { resizePreview(); return $('rsnow').textContent; });
    expect(note).toContain('×3 exactly');
    expect(note).not.toContain('Scale3x');
    await page.click('#rsgo');
    await page.waitForTimeout(150);
    await page.evaluate(() => railPanel('tf', false));
    expect(await size(page)).toBe('6x6');
    expect(await pixels(page)).toEqual(bytes(blocks6()));
  });

  test('and PB.scale3x without apply only sets the panel up', async ({ page }) => {
    const r = await page.evaluate(() => { const o = PB.scale3x(false); const s = { w: $('rsw').value, chip: chipVal('rsalg') }; railPanel('tf', false); return { o, s }; });
    expect(r.o).toMatchObject({ ok: true, applied: false, w: 2, h: 2 });
    expect(r.s).toEqual({ w: '6', chip: 'scale3x' });
    expect(await size(page)).toBe('2x2');
  });
});

test.describe('the ceiling', () => {
  test('the preset exists only where three times fits under 4096', async ({ page }) => {
    /* 1365 x 3 = 4095 fits; 1366 x 3 = 4098 does not. The boundary is
       art.width*3 <= MAX_SIDE, and the agent gets told why. */
    await openTrait(page, { w: 1366, h: 8, draw: (set) => { set(0, 0, [1, 2, 3]); } });
    const r = await page.evaluate(() => {
      railPanel('tf', true);
      const has = [...$('rspreset').options].some(o => o.value === 's3x');
      const o = PB.scale3x(true);
      railPanel('tf', false);
      return { has, o, size: art.width + 'x' + art.height };
    });
    expect(r.has).toBe(false);
    expect(r.o.ok).toBe(false);
    expect(r.o.why).toContain('4096');
    expect(r.size, 'and nothing was resized').toBe('1366x8');
  });
});

test.describe('what Rotxel promises on real art', () => {
  /* Structural claims that follow from the algorithm rather than from a
     worked vector: every output pixel is a COPY of some input pixel (each
     rule returns a, b, ... i or e verbatim; a miss is transparent), so no
     colour can appear that the art did not have; and the canvas grows to
     the same box Nearest grows to, because the box is computed before the
     sampler is chosen. */
  test('invents no colour and lands on the same canvas as Nearest', async ({ page }) => {
    const draw = (set, W, H) => {
      const P = [[220, 40, 40], [40, 180, 60], [60, 80, 220], [240, 200, 30]];
      for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) set(x, y, P[((x >> 3) + (y >> 3)) & 3]);
    };
    await openTrait(page, { w: 48, h: 48, draw });
    const r = await page.evaluate(() => {
      const key = d => { const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]); return s; };
      const src = ctx.getImageData(0, 0, art.width, art.height).data;
      const inSet = key(src); inSet.add('0,0,0,0');
      PB.rotate(37, 'rotxel');
      const outR = ctx.getImageData(0, 0, art.width, art.height).data, sizeR = art.width + 'x' + art.height;
      let foreign = 0; for (const k of key(outR)) if (!inSet.has(k)) foreign++;
      let opaque = 0; for (let i = 3; i < outR.length; i += 4) if (outR[i]) opaque++;
      $('undo').click();
      PB.rotate(37, 'nearest');
      const sizeN = art.width + 'x' + art.height;
      let opaqueN = 0; const outN = ctx.getImageData(0, 0, art.width, art.height).data;
      for (let i = 3; i < outN.length; i += 4) if (outN[i]) opaqueN++;
      return { foreign, sizeR, sizeN, opaque, opaqueN, srcOpaque: 32 * 32 };
    });
    expect(r.foreign, 'colours not in the art').toBe(0);
    expect(r.sizeR).toBe(r.sizeN);
    /* ceil(48cos37 + 48sin37) = ceil(38.33 + 28.89) = 68 */
    expect(r.sizeR).toBe('68x68');
    /* Not a derived count - a sanity bound. A turn that lost the art would
       read as zero here, and a port sampling the wrong image as far more. */
    expect(Math.abs(r.opaque - r.srcOpaque), 'about as much art as went in').toBeLessThan(r.srcOpaque * 0.05);
    expect(Math.abs(r.opaqueN - r.srcOpaque)).toBeLessThan(r.srcOpaque * 0.05);
  });
});
