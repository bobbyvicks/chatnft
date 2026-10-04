/* A CUT FINER THAN THE BLOCKS KEEPS THEM, AND THE RUN SAYS SO (patch629).

   10px art typed 8 is cut by cells narrower than its blocks, and every block
   keeps a cell. The run used to say "N strokes one block wide will not
   survive it" about it: Backrooms Hallway, "615", while all 615 survive.
   The worker now measures what the cut did on the engine's own cells
   (fixStrokesKept) and the run says that. The cut coarser than the blocks
   (5px art at 8, 10px art at 16) says the strokes may not survive it -
   some do, some do not - and names 8 when the collection grid would cut
   finer than the blocks, unless a stroke is fainter than the engine's
   paint, which no size keeps.

   Each claim has a control one thing away: the size (8 / 16), the block
   (10px / 5px), the canvas switch, the strokes' alpha, a folder where
   nothing is lost, a folder that mixes a finer and a coarser cut. The
   measure itself is pinned on hand-made cells where it must say kept, lost
   and wide, so it is shown able to return each answer. The kept and wide
   counts in the sentence are checked against a count the test makes from
   the result picture itself.

   Palette off throughout: the strokes are counted on the engine's cells. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function' && typeof fixStrokesKept === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A 1280 picture in whole blocks of `cell` px. stems: one-block vertical
   lines every 32 blocks, starting at block `at`. stems2: four lines in every
   32 blocks, at 1, 6, 9 and 16, on a ground of two near shades in bands
   three blocks tall. The bands are what give some stems a second cell:
   measured at 8, a cell split evenly between a stem and a flat ground goes
   to the ground (stems on #2e222f alone: 0 of 2,016 two cells wide), while
   a ground of two shades leaves the stem the largest share of it (1,140 of
   2,016). bars: the same colours three blocks wide, so cut across with no
   stroke in it. */
const art = (cell, kind, at) => `
  const W = 1280, B = ${cell}, N = W / B, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    let v = '#2e222f';
    if ('${kind}' === 'stems') v = (bx % 32 === ${at === undefined ? 2 : at}) ? '#e8d5b7' : '#2e222f';
    if ('${kind}' === 'stems2') v = [1, 6, 9, 16].indexOf(bx % 32) >= 0 ? '#e8d5b7' : (by % 6 < 3 ? '#2e222f' : '#3e2731');
    if ('${kind}' === 'bars') v = (bx % 8 < 3) ? '#e8d5b7' : '#2e222f';
    /* hstems2: stems2 turned on its side - strokes that run across.
       On clear ground, above an opaque band so the picture is not empty:
       faint stems at alpha 127, the last value under the engine's paint
       (alpha over 127); edge, the same at 128, the first value it paints;
       solidclear, the same stems solid; mixed, a faint column of stems
       and a solid one in every 32 blocks. */
    if ('${kind}' === 'hstems2') v = [1, 6, 9, 16].indexOf(by % 32) >= 0 ? '#e8d5b7' : (bx % 6 < 3 ? '#2e222f' : '#3e2731');
    if ('${kind}' === 'faint' || '${kind}' === 'solidclear' || '${kind}' === 'edge' || '${kind}' === 'mixed') {
      const a = { faint: 127, edge: 128, solidclear: 255, mixed: (bx % 32 === 2) ? 127 : 255 }['${kind}'];
      if (by >= 120) v = '#8b5fbf';
      else if (bx % 32 === 2 || ('${kind}' === 'mixed' && bx % 32 === 18)) v = a === 255 ? '#e8d5b7' : 'rgba(232,213,183,' + (a / 255) + ')';
      else continue;
    }
    g.fillStyle = v; g.fillRect(bx * B, by * B, B, B);
  }
`;

const single = (page, src, typed, grid) => page.evaluate(async ({ src, typed, grid }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'one.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = grid !== false;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(typed);
  const r = await fixRun();
  window.toast = realToast;
  f.value = '0';
  document.getElementById('fixgrid').checked = true;
  return { said: document.getElementById('fixout').textContent, w: r.width, h: r.height, data: Array.from(r.data), kept: r.kept || null };
}, { src, typed, grid });

const batch = (page, srcs, typed) => page.evaluate(async ({ srcs, typed }) => {
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
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(typed);
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  f.value = '0';
  return document.getElementById('fixbatchout').textContent;
}, { srcs, typed });

/* The test's own count, from the result picture: for every stem block
   (columns given, rows 1..N-2 - fixThinStrokes needs the block above and
   below; or, across, rows given and columns 1..N-2), the cell columns (rows)
   over its pixels that came out nearer the stem colour than the ground.
   kept = at least one; wide = two. */
const countStems = (r, block, cols, across) => {
  const N = 1280 / block, step = 1280 / r.w, near = (i) => {
    const d = (a, b) => (r.data[i] - a[0]) ** 2 + (r.data[i + 1] - a[1]) ** 2 + (r.data[i + 2] - a[2]) ** 2;
    return d([0xe8, 0xd5, 0xb7]) < d([0x2e, 0x22, 0x2f]);
  };
  let strokes = 0, lost = 0, wide = 0;
  for (const s of cols) for (let t = 1; t < N - 1; t++) {
    strokes++;
    const bx = across ? t : s, by = across ? s : t;
    const x0 = Math.floor(bx * block / step), x1 = Math.floor((bx * block + block - 1) / step);
    const y0 = Math.floor(by * block / step), y1 = Math.floor((by * block + block - 1) / step);
    const at = new Set();
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (near((cy * r.w + cx) * 4)) at.add(across ? cy : cx);
    if (!at.size) lost++; else if (at.size > 1) wide++;
  }
  return { strokes, lost, wide };
};

test.describe('a cut finer than the blocks keeps them', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('10PX STEMS TYPED 8 ARE KEPT, AND THE RUN SAYS SO, with the counts the result shows', async ({ page }) => {
    /* stems2: stems at four positions in the cut's four-block cycle, so some
       come out 2 cells wide and some 1. */
    const r = await single(page, art(10, 'stems2'), 8);
    expect(r.w).toBe(160);
    const cols = []; for (let bx = 0; bx < 128; bx++) { const k = bx % 32; if (k === 1 || k === 6 || k === 9 || k === 16) cols.push(bx); }
    const mine = countStems(r, 10, cols);
    expect(mine.strokes, 'the picture is what the test thinks it is').toBe(16 * 126);
    expect(mine.lost, 'nothing lost in the result').toBe(0);
    expect(mine.wide, 'and some stems two cells wide - else the clause below is not tested').toBeGreaterThan(0);
    expect(mine.wide, 'but not all').toBeLessThan(mine.strokes);
    expect(r.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across - the cut keeps all '
      + mine.strokes.toLocaleString() + ' strokes one block wide, ' + mine.wide.toLocaleString() + ' now 2 cells wide');
    expect(r.said).not.toContain('survive');
    expect(r.kept, 'the worker measured it').toEqual({ strokes: mine.strokes, lost: 0, wide: mine.wide });
  });

  test('and the same stems typed 16 are cut coarser: they may not survive it, and 8 is named', async ({ page }) => {
    const r = await single(page, art(10, 'stems2'), 16);
    expect(r.w).toBe(80);
    expect(r.said).toContain('drawn at 10px blocks (128 cells), which the 80 cell grid cuts across - '
      + (16 * 126).toLocaleString() + ' strokes one block wide may not survive it; at 8 the cut keeps them');
    expect(r.said, 'not the measured clause of a finer cut').not.toContain('the cut keeps all');
    expect(r.kept, 'nothing asked of the worker on a coarser cut').toBe(null);
  });

  test('5PX STEMS AT 16: 8 IS NOT NAMED, because 8 cuts them coarser too', async ({ page }) => {
    const r = await single(page, art(5, 'stems'), 16);
    expect(r.said).toContain('drawn at 5px blocks (256 cells), which the 80 cell grid cuts across - ');
    expect(r.said).toContain('strokes one block wide may not survive it');
    expect(r.said).not.toContain('the cut keeps them');
  });

  test('and 5px stems at 8 may not survive it, with no size to name', async ({ page }) => {
    const r = await single(page, art(5, 'stems'), 8);
    expect(r.said).toContain('drawn at 5px blocks (256 cells), which the 160 cell grid cuts across - ');
    expect(r.said).toContain('strokes one block wide may not survive it');
    expect(r.said).not.toContain('the cut keeps them');
    expect(r.said).not.toContain('the cut keeps');
  });

  test('WITH SAVE AT 1280 OFF the 16 run does not name 8', async ({ page }) => {
    /* A cell count is picture pixels per cell there, and 8 is not the 160
       the collection uses (fixCoarseNote's reason). */
    const r = await single(page, art(10, 'stems2'), 16, false);
    expect(r.said).toContain('strokes one block wide may not survive it');
    expect(r.said).not.toContain('the cut keeps them');
  });

  test('THE MEASURE ANSWERS KEPT, LOST AND WIDE on cells made to give each', async ({ page }) => {
    const got = await page.evaluate(() => {
      /* 30x30 in 10px blocks: a stem down the middle column, A on B. One
         stroke - block (1,1), the only one with A above and below. */
      const A = [232, 213, 183], Bc = [46, 34, 47];
      const pic = new Uint8ClampedArray(30 * 30 * 4);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) { const c = (x >= 10 && x < 20) ? A : Bc; pic.set([c[0], c[1], c[2], 255], (y * 30 + x) * 4); }
      const across = new Uint8ClampedArray(30 * 30 * 4);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) { const c = (y >= 10 && y < 20) ? A : Bc; across.set([c[0], c[1], c[2], 255], (y * 30 + x) * 4); }
      const onClear = new Uint8ClampedArray(30 * 30 * 4);
      for (let y = 0; y < 30; y++) for (let x = 10; x < 20; x++) onClear.set([A[0], A[1], A[2], 255], (y * 30 + x) * 4);
      /* cells n x n, coloured by a function of the cell */
      const cells = (n, f) => { const d = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = f(x, y); d.set(c ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0], (y * n + x) * 4); } return d; };
      const run = (n, f) => fixStrokesKept(pic, 30, 30, 10, cells(n, f), n, n);
      return {
        /* 3x3, one cell a block: the stem's cell is A - kept, not wide */
        same: run(3, (x) => x === 1 ? A : Bc),
        /* the stem's cell made B - lost */
        gone: run(3, () => Bc),
        /* a near colour still counts as kept: nearer A than B */
        near: run(3, (x) => x === 1 ? [200, 190, 170] : Bc),
        /* 4x4: block 1 covers cell columns 1 and 2; both A - wide */
        wide: run(4, (x) => (x === 1 || x === 2) ? A : Bc),
        /* 4x4, only column 2 A - kept, not wide */
        one: run(4, (x) => x === 2 ? A : Bc),
        /* cells clear where the stem was - lost. The clear cell carries the
           stem's own colour, so only skipping it (not its RGB) makes it lost. */
        clear: (() => { const d = cells(3, () => Bc); d.set([A[0], A[1], A[2], 0], (1 * 3 + 1) * 4); d.set([A[0], A[1], A[2], 0], (0 * 3 + 1) * 4); d.set([A[0], A[1], A[2], 0], (2 * 3 + 1) * 4); return fixStrokesKept(pic, 30, 30, 10, d, 3, 3); })(),
        /* the same stem on a CLEAR ground: beside clear, any painted cell over
           it keeps it - even one far from its colour - and a clear one does not */
        besideClear: fixStrokesKept(onClear, 30, 30, 10, cells(3, (x) => x === 1 ? Bc : null), 3, 3),
        besideClearGone: fixStrokesKept(onClear, 30, 30, 10, cells(3, () => null), 3, 3),
        countOnClear: fixThinStrokes(onClear, 30, 30, 10),
        /* the stem turned on its side: a stroke across, measured by rows */
        acrossCount: fixThinStrokes(across, 30, 30, 10),
        acrossSame: fixStrokesKept(across, 30, 30, 10, cells(3, (x, y) => y === 1 ? A : Bc), 3, 3),
        acrossGone: fixStrokesKept(across, 30, 30, 10, cells(3, () => Bc), 3, 3),
        acrossWide: fixStrokesKept(across, 30, 30, 10, cells(4, (x, y) => (y === 1 || y === 2) ? A : Bc), 4, 4),
        /* columns 1 and 2 both A over a stroke across is NOT wide: its width is rows */
        acrossCols: fixStrokesKept(across, 30, 30, 10, cells(4, (x, y) => (y === 2 && (x === 1 || x === 2)) ? A : Bc), 4, 4),
        count: fixThinStrokes(pic, 30, 30, 10),
      };
    });
    expect(got.count).toBe(1);
    expect(got.same).toEqual({ strokes: 1, lost: 0, wide: 0 });
    expect(got.gone).toEqual({ strokes: 1, lost: 1, wide: 0 });
    expect(got.near).toEqual({ strokes: 1, lost: 0, wide: 0 });
    expect(got.wide).toEqual({ strokes: 1, lost: 0, wide: 1 });
    expect(got.one).toEqual({ strokes: 1, lost: 0, wide: 0 });
    expect(got.clear).toEqual({ strokes: 1, lost: 1, wide: 0 });
    expect(got.countOnClear).toBe(1);
    expect(got.besideClear, 'beside clear, a painted cell keeps it').toEqual({ strokes: 1, lost: 0, wide: 0 });
    expect(got.besideClearGone).toEqual({ strokes: 1, lost: 1, wide: 0 });
    expect(got.acrossCount).toBe(1);
    expect(got.acrossSame).toEqual({ strokes: 1, lost: 0, wide: 0 });
    expect(got.acrossGone).toEqual({ strokes: 1, lost: 1, wide: 0 });
    expect(got.acrossWide).toEqual({ strokes: 1, lost: 0, wide: 1 });
    expect(got.acrossCols).toEqual({ strokes: 1, lost: 0, wide: 0 });
  });

  test('THE WORDS: lost when the worker measured a loss, nothing when it measured nothing', async ({ page }) => {
    const w = await page.evaluate(() => {
      const finer = { block: 10, to: 8, strokes: 5, grid: 160, cells: 128 };
      return {
        lost: fixStrokeWords(finer, { strokes: 5, lost: 2, wide: 0 }),
        one: fixStrokeWords({ block: 10, to: 8, strokes: 1, grid: 160, cells: 128 }, { strokes: 1, lost: 1, wide: 0 }),
        kept: fixStrokeWords(finer, { strokes: 5, lost: 0, wide: 3 }),
        flat: fixStrokeWords(finer, { strokes: 5, lost: 0, wide: 0 }),
        unmeasured: fixStrokeWords(finer, null),
        none: fixStrokeWords({ block: 10, to: 8, strokes: 0, grid: 160, cells: 128 }, null),
        twenty: fixStrokeWords({ block: 20, to: 8, strokes: 4, grid: 160, cells: 64 }, { strokes: 4, lost: 0, wide: 2 }),
        allLost: fixStrokeWords(finer, { strokes: 5, lost: 5, wide: 0 }),
        oneWide: fixStrokeWords({ block: 10, to: 8, strokes: 1, grid: 160, cells: 128 }, { strokes: 1, lost: 0, wide: 1 }),
        coarse: fixStrokeWords({ block: 10, to: 16, strokes: 5, grid: 80, cells: 128, keepsAt: 8 }, null),
        coarseOne: fixStrokeWords({ block: 10, to: 16, strokes: 1, grid: 80, cells: 128, keepsAt: 8 }, null),
        coarseNoSize: fixStrokeWords({ block: 5, to: 16, strokes: 5, grid: 80, cells: 256, keepsAt: 0 }, null),
      };
    });
    expect(w.lost).toBe(' - the cut loses 2 of its 5 strokes one block wide');
    expect(w.one).toBe(' - the cut loses its stroke one block wide');
    expect(w.kept).toBe(' - the cut keeps all 5 strokes one block wide, 3 now 2 cells wide');
    expect(w.flat).toBe(' - the cut keeps all 5 strokes one block wide');
    expect(w.oneWide).toBe(' - the cut keeps its stroke one block wide, now 2 cells wide');
    expect(w.unmeasured, 'no measure, no claim').toBe('');
    expect(w.none).toBe('');
    expect(w.twenty, '20px blocks on 8px cells are 2 or 3 cells').toBe(' - the cut keeps all 4 strokes one block wide, 2 now 3 cells wide');
    expect(w.allLost).toBe(' - the cut loses all 5 strokes one block wide');
    expect(w.coarse).toBe(' - 5 strokes one block wide may not survive it; at 8 the cut keeps them');
    expect(w.coarseOne).toBe(' - 1 stroke one block wide may not survive it; at 8 the cut keeps it');
    expect(w.coarseNoSize).toBe(' - 5 strokes one block wide may not survive it');
  });

  test('A FOLDER AT 8 OF 10PX ART SAYS EVERY STROKE WAS KEPT, not that it holds detail to lose', async ({ page }) => {
    const said = await batch(page, [art(10, 'bars'), art(10, 'stems')], 8);
    expect(said).toContain('2 were drawn at a block size the 160 cell grid cuts across (10px), the cut keeping every stroke one block wide');
    expect(said).not.toContain('holding detail');
    expect(said).not.toContain('the cut keeps them');
  });

  test('a folder at 16 lists them and names 8 for the ones it keeps', async ({ page }) => {
    const said = await batch(page, [art(10, 'stems'), art(5, 'stems')], 16);
    expect(said).toContain('2 were drawn at a block size the 80 cell grid cuts across (5px, 10px), '
      + '2 of them holding detail one block wide that may not survive it (most in f1, f0); at 8 the cut keeps the 10px ones');
  });

  test('and a folder at 16 of 10px art alone says 8 keeps them', async ({ page }) => {
    const said = await batch(page, [art(10, 'stems')], 16);
    expect(said).toContain('1 were drawn at a block size the 80 cell grid cuts across (10px), '
      + '1 of them holding detail one block wide that may not survive it (most in f0); at 8 the cut keeps them');
  });

  test('A FOLDER MIXING A FINER AND A COARSER CUT names the size after the files it keeps', async ({ page }) => {
    /* 20px art at 16 is cut finer (a 20px block is 1.25 cells) and keeps
       every stroke; 10px art at 16 is cut coarser. The kept file is said
       first, so "8 keeps them" follows the list it is about. */
    const said = await batch(page, [art(10, 'stems'), art(20, 'stems')], 16);
    expect(said).toContain('2 were drawn at a block size the 80 cell grid cuts across (10px, 20px), '
      + 'the cut keeping every stroke one block wide in 1 of them, 1 of them holding detail one block wide that may not survive it (most in f0); at 8 the cut keeps them');
  });

  test('STROKES FAINTER THAN THE ENGINE PAINTS: 8 is not named, and the cut is not blamed', async ({ page }) => {
    /* Alpha 127 is the last value under the engine's paint (over 127): such
       a stroke comes out clear at every size, which the translucency note
       says. */
    const at16 = await single(page, art(10, 'faint'), 16);
    expect(at16.said).toContain('drawn at 10px blocks (128 cells), which the 80 cell grid cuts across - 472 strokes one block wide may not survive it');
    expect(at16.said, 'no size keeps them').not.toContain('the cut keeps them');
    const at8 = await single(page, art(10, 'faint'), 8);
    expect(at8.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across');
    expect(at8.said, 'nothing said about strokes the cut did not decide').not.toContain('one block wide');
    expect(at8.said, 'the translucency note says what happened to them').toContain('translucent pixel');
    expect(at8.kept).toEqual({ strokes: 0, lost: 0, wide: 0 });
  });

  test('ALPHA 128 IS PAINT: the same strokes one step more opaque are named at 16 and kept at 8', async ({ page }) => {
    const at16 = await single(page, art(10, 'edge'), 16);
    expect(at16.said).toContain('- 472 strokes one block wide may not survive it; at 8 the cut keeps them');
    const at8 = await single(page, art(10, 'edge'), 8);
    expect(at8.said).toContain('- the cut keeps all 472 strokes one block wide');
    expect(at8.kept.strokes).toBe(472);
  });

  test('A PICTURE WITH FAINT AND SOLID STROKES: 8 is not named, and the cut speaks for the solid ones', async ({ page }) => {
    const at16 = await single(page, art(10, 'mixed'), 16);
    expect(at16.said).toContain('- 944 strokes one block wide may not survive it');
    expect(at16.said, 'a faint one among them, which no size keeps').not.toContain('the cut keeps');
    const at8 = await single(page, art(10, 'mixed'), 8);
    expect(at8.said).toContain('- the cut keeps all 472 strokes one block wide');
    expect(at8.kept.strokes, 'the solid half only').toBe(472);
  });

  test('a folder at 16 of a solid and a faint 10px file says 8 keeps one of them', async ({ page }) => {
    /* Both 10px, so "the 10px ones" would name the faint one too. */
    const said = await batch(page, [art(10, 'solidclear'), art(10, 'faint')], 16);
    expect(said).toContain('2 were drawn at a block size the 80 cell grid cuts across (10px), '
      + '2 of them holding detail one block wide that may not survive it (most in f0, f1); at 8 the cut keeps 1 of them');
  });

  test('STROKES THAT RUN ACROSS: typed 8 they are kept, with the counts the result shows', async ({ page }) => {
    const r = await single(page, art(10, 'hstems2'), 8);
    const rows = []; for (let by = 0; by < 128; by++) { const k = by % 32; if (k === 1 || k === 6 || k === 9 || k === 16) rows.push(by); }
    const mine = countStems(r, 10, rows, true);
    expect(mine.strokes, 'the picture is what the test thinks it is').toBe(16 * 126);
    expect(mine.lost).toBe(0);
    expect(mine.wide, 'some two cells tall').toBeGreaterThan(0);
    expect(mine.wide, 'but not all').toBeLessThan(mine.strokes);
    expect(r.said).toContain('- the cut keeps all ' + mine.strokes.toLocaleString() + ' strokes one block wide, '
      + mine.wide.toLocaleString() + ' now 2 cells wide');
    expect(r.kept).toEqual({ strokes: mine.strokes, lost: 0, wide: mine.wide });
  });

  test('and across at 16 they may not survive it, and 8 is named', async ({ page }) => {
    const r = await single(page, art(10, 'hstems2'), 16);
    expect(r.said).toContain('- ' + (16 * 126).toLocaleString() + ' strokes one block wide may not survive it; at 8 the cut keeps them');
  });

  test('and the same strokes solid: 8 is named at 16, and kept at 8', async ({ page }) => {
    const at16 = await single(page, art(10, 'solidclear'), 16);
    expect(at16.said).toContain('- 472 strokes one block wide may not survive it; at 8 the cut keeps them');
    const at8 = await single(page, art(10, 'solidclear'), 8);
    expect(at8.said).toContain('- the cut keeps all 472 strokes one block wide');
    expect(at8.kept.strokes).toBe(472);
    expect(at8.kept.lost).toBe(0);
  });
});
