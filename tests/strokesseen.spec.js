/* A STROKE COUNTS WHEN IT STANDS OUT FROM WHAT IS ACROSS IT (patch633).

   fixThinStrokes counted any block one block wide whose neighbours across it were one other colour - any other
   colour, so a shade one step off a flat ground was "detail one block wide that may not survive it". On the 311
   saved traits 2,650 of the 8,251 strokes counted were under 2.3 apart by CIEDE2000 (Utopia 557 of 557, Dark Skin
   208 of 208, Ruins Selfie 47 of 47). The owner, told the count "treats colours you can't tell apart as separate
   lines": "yes go ahead". A stroke now counts when the colour across is clear, or the paint differs (another alpha
   on either side), or the colours are at least 2.3 apart - deltaWord's line between "barely visible" and "slight".
   (Asked only of a block whose colour already differs from the colour across, as fixThinStrokes' structure test
   always required.)

   The colours sit either side of that line, on the ground the stroke specs use (#2e222f): #2e252f is 2.29 from it
   ("barely visible"), #2e2234 is 2.36 ("slight"), #2e232f is 0.74 ("invisible"). Every test checks deltaWord's word
   for the colours it uses before it relies on them, and the first also bounds the two distances near the line,
   finds deltaWord's line by asking it, and reads fixThinStrokes' own line out of the function, so the two are held
   equal exactly. Each claim has a control one thing away: the same picture with the slight colour, or, for the
   see-through test, the same alpha everywhere. Opaque pictures are drawn on a canvas (opaque colours round-trip exactly), the
   translucent ones are given to fixThinStrokes as pixels. RUN AGAINST THE PAGE BEFORE patch633 every test is red:
   each at its claim, except the see-through test, whose claim that page met by counting every colour - it is red
   at its control, the same paint everywhere. */
import { test, expect } from '@playwright/test';

const G = '#2e222f', INVISIBLE = '#2e232f', BARELY = '#2e252f', SLIGHT = '#2e2234';

/* deltaWord's word for each colour against the ground, as a precondition. */
const words = async (page, colours) => (await measured(page, colours)).map(x => x.word);

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function' && typeof fixThinStrokes === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* The distance from the ground and deltaWord's word for it, as the page measures them. */
const measured = (page, colours) => page.evaluate(({ G, colours }) => {
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const g = labOf(...hx(G));
  return colours.map(c => { const l = labOf(...hx(c)); const e = deltaE2000(g[0], g[1], g[2], l[0], l[1], l[2]); return { c, e, word: deltaWord(e) }; });
}, { G, colours });

/* A 1280 picture of `cell` px blocks on the ground, with one-block stems, full height, in the columns whose block
   index mod 32 is given: [[2, colour], [18, colour]]. A column's strokes are its blocks but the top and bottom. */
const art = (cell, stems) => `
  const W = 1280, B = ${cell}, N = W / B, S = ${JSON.stringify(stems)}, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '${G}'; g.fillRect(0, 0, W, W);
  for (let bx = 0; bx < N; bx++) { const s = S.find(s => bx % 32 === s[0]); if (s) { g.fillStyle = s[1]; g.fillRect(bx * B, 0, B, W); } }
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
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(typed);
  const r = await fixRun();
  window.toast = realToast;
  f.value = '0';
  return { said: document.getElementById('fixout').textContent, w: r.width, kept: r.kept || null };
}, { src, typed });

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

/* fixThinStrokes on pixels: 12 x 12 blocks of 4px on the ground, one stem down column 5 (or, across, along row 5),
   in `stem` at alpha `sa`; the ground at alpha `ga`, and the blocks left of the stem (above it, across) at `la`,
   right of it (below it) at `ra`. 10 strokes when it counts: rows (columns) 1 to 10. Returns the count and the
   visits. */
const thin = (page, o) => page.evaluate(({ G, o }) => {
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const B = 4, N = 12, W = B * N, d = new Uint8ClampedArray(W * W * 4), g = hx(G), s = hx(o.stem);
  const ga = o.ga === undefined ? 255 : o.ga;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const bx = Math.floor(x / B), by = Math.floor(y / B), along = o.across ? by : bx, side = along - 5;
    const a = side === -1 && o.la !== undefined ? o.la : side === 1 && o.ra !== undefined ? o.ra : ga;
    d.set(side === 0 ? [s[0], s[1], s[2], o.sa === undefined ? 255 : o.sa] : [g[0], g[1], g[2], a], (y * W + x) * 4);
  }
  let visits = 0;
  const n = fixThinStrokes(d, W, W, B, () => { visits++; });
  return { n, visits };
}, { G, o });

test.describe('a stroke is one the eye can tell from what is across it', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('THE LINE IS DELTAWORD\'S: barely visible and invisible stems are not strokes, slight ones are, down and across', async ({ page }) => {
    const m = await measured(page, [INVISIBLE, BARELY, SLIGHT]);
    expect(m.map(x => x.word), 'the colours are where this file says').toEqual(['invisible', 'barely visible', 'slight']);
    expect(m[1].e, 'barely visible, close under the line').toBeGreaterThan(2.25);
    expect(m[2].e, 'slight, close over it').toBeLessThan(2.4);
    /* deltaWord's own line, found by asking it: the first distance it does not call barely visible. */
    const line = await page.evaluate(() => { for (let k = 2000; k < 3000; k++) if (deltaWord(k / 1000) !== 'barely visible') return k / 1000; return null; });
    expect(line, 'deltaWord\'s line').toBe(2.3);
    /* and fixThinStrokes' own, read out of it: the two held equal, not only within the fixtures' 2.29 to 2.36 */
    const own = await page.evaluate(() => (fixThinStrokes.toString().match(/deltaE2000\([^)]*\)<([\d.]+)\)/) || [])[1]);
    expect(Number(own), 'the line fixThinStrokes writes').toBe(line);
    /* a stroke that differs from the ground in red alone is counted - its colour is its own, not the ground's */
    expect(await thin(page, { stem: '#ff222f' }), 'red alone').toEqual({ n: 10, visits: 10 });
    for (const across of [false, true]) {
      const inv = await thin(page, { stem: INVISIBLE, across });
      const bar = await thin(page, { stem: BARELY, across });
      const sli = await thin(page, { stem: SLIGHT, across });
      /* THE CLAIM */
      expect(inv, 'invisible: no stroke, ' + (across ? 'across' : 'down')).toEqual({ n: 0, visits: 0 });
      expect(bar, 'barely visible: no stroke, ' + (across ? 'across' : 'down')).toEqual({ n: 0, visits: 0 });
      /* CONTROL, ONE COLOUR AWAY */
      expect(sli, 'slight: all 10 strokes, ' + (across ? 'across' : 'down')).toEqual({ n: 10, visits: 10 });
    }
  });

  test('A SEE-THROUGH LINE IN ANOTHER COLOUR IS COUNTED HOWEVER CLOSE THE COLOUR: another alpha on either side is paint the eye can see', async ({ page }) => {
    expect(await words(page, [INVISIBLE, SLIGHT])).toEqual(['invisible', 'slight']);
    for (const across of [false, true]) {
      const dir = across ? 'across' : 'down';
      /* THE CLAIM: the invisible colour, with the paint different - the stem, the whole ground, one side, the other */
      expect(await thin(page, { stem: INVISIBLE, sa: 200, across }), 'stem at 200 on opaque ground, ' + dir).toEqual({ n: 10, visits: 10 });
      expect(await thin(page, { stem: INVISIBLE, ga: 200, across }), 'opaque stem on ground at 200, ' + dir).toEqual({ n: 10, visits: 10 });
      expect(await thin(page, { stem: INVISIBLE, la: 200, across }), 'only the first side at 200, ' + dir).toEqual({ n: 10, visits: 10 });
      expect(await thin(page, { stem: INVISIBLE, ra: 200, across }), 'only the second side at 200, ' + dir).toEqual({ n: 10, visits: 10 });
      /* CONTROL, ONE ALPHA AWAY: the same paint everywhere, at 200 - the colours decide, and they are invisible */
      expect(await thin(page, { stem: INVISIBLE, sa: 200, ga: 200, across }), 'all at 200, ' + dir).toEqual({ n: 0, visits: 0 });
      /* and with the colours deciding, a slight one counts at 200 as it does opaque (added in review: the control
         above alone passes a page that never counts translucent paint) */
      expect(await thin(page, { stem: SLIGHT, sa: 200, ga: 200, across }), 'slight, all at 200, ' + dir).toEqual({ n: 10, visits: 10 });
    }
    /* and beside clear, a stroke whatever its colour - as before */
    expect(await thin(page, { stem: G, ga: 0 }), 'the ground colour itself, on clear').toEqual({ n: 10, visits: 10 });
  });

  test('A RUN DOES NOT WARN ABOUT LINES BARELY VISIBLE AGAINST WHAT IS BESIDE THEM: such stems cut coarser say nothing about strokes', async ({ page }) => {
    const m = await measured(page, [BARELY, SLIGHT]);
    expect(m.map(x => x.word)).toEqual(['barely visible', 'slight']);
    const bar = await single(page, art(10, [[2, BARELY]]), 16);
    expect(bar.w).toBe(80);
    expect(bar.said, 'the cut is still said').toContain('drawn at 10px blocks (128 cells), which the 80 cell grid cuts across');
    /* THE CLAIM */
    expect(bar.said, 'no stroke to warn about').not.toContain('one block wide');
    /* CONTROL, ONE COLOUR AWAY: the same stems, slight */
    const sli = await single(page, art(10, [[2, SLIGHT]]), 16);
    expect(sli.said).toContain('drawn at 10px blocks (128 cells), which the 80 cell grid cuts across - 504 strokes one block wide may not survive it');
  });

  test('A CUT FINER THAN THE BLOCKS SAYS WHAT IT DID TO THE LINES THAT SHOW, and the worker counts the same ones', async ({ page }) => {
    /* 10px stems typed 8: the worker measures the cut (fixStrokesKept, through fixThinStrokes' visits). Four
       columns slight, four barely visible. A cut finer than the blocks keeps every one (strokeskept.spec.js). */
    expect(await words(page, [BARELY, SLIGHT])).toEqual(['barely visible', 'slight']);
    const r = await single(page, art(10, [[2, SLIGHT], [18, BARELY]]), 8);
    expect(r.w).toBe(160);
    /* THE CLAIM: the slight ones only */
    expect(r.kept, 'the worker counted the 504 that show, and kept them').toEqual({ strokes: 504, lost: 0, wide: r.kept && r.kept.wide });
    expect(r.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across - the cut keeps all 504 strokes one block wide');
    /* CONTROL, ONE COLOUR AWAY: all eight columns slight */
    const all = await single(page, art(10, [[2, SLIGHT], [18, SLIGHT]]), 8);
    expect(all.kept, 'all 1,008').toEqual({ strokes: 1008, lost: 0, wide: all.kept && all.kept.wide });
    expect(all.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across - the cut keeps all 1,008 strokes one block wide');
  });

  test('A MERGE SAYS ONLY THE LINES THAT SHOW', async ({ page }) => {
    /* 8px art at 16, merged 2 to 1: 5 columns of 158 strokes */
    expect(await words(page, [BARELY, SLIGHT])).toEqual(['barely visible', 'slight']);
    const bar = await single(page, art(8, [[2, BARELY]]), 16);
    expect(bar.said).toContain('drawn at 8px blocks (160 cells), merged 2 to 1 onto the 80 cell grid');
    /* THE CLAIM */
    expect(bar.said).not.toContain('one block wide');
    /* CONTROL, ONE COLOUR AWAY */
    const sli = await single(page, art(8, [[2, SLIGHT]]), 16);
    expect(sli.said).toContain('drawn at 8px blocks (160 cells), merged 2 to 1 onto the 80 cell grid - 790 strokes one block wide may not survive it');
  });

  test('A FOLDER LISTS ONLY THE FILES WHOSE LINES SHOW', async ({ page }) => {
    expect(await words(page, [BARELY, SLIGHT])).toEqual(['barely visible', 'slight']);
    const said = await batch(page, [art(10, [[2, BARELY]]), art(10, [[2, SLIGHT]])], 16);
    /* THE CLAIM, with its control in the same folder: one file barely visible, one slight */
    expect(said).toContain('2 were drawn at a block size the 80 cell grid cuts across (10px), '
      + '1 of them holding detail one block wide that may not survive it (most in f1)');
  });
});
