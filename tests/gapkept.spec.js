/* THE RING KEEPS THE GAPS THE SOURCE DRAWS (round 9, pf-42-repair8/8: HUG + GAP).

   Round 8's HUG drew GATE Hoodie's thin white outline as a closed ring of cells round each yellow letter at Pixel
   size 16 - and also filled the G's navy hole, the navy notch between the A's legs and the navy between the G and
   the A with white (a cell the source draws 98% navy among them), so the letters' negative space was gone and two
   letters were fused. GAP keeps such a cell the outside fill: a cell whose source pixels are at least as much the
   fill as the line, where that fill is narrow - the line or the shape on both sides of it, along a row or a column,
   within 1.75 cells. A ring cell on open fill (the fill runs on past it) is still drawn; so is the inside corner of
   a shape (only a diagonal crosses it to the shape on both sides).

     TEST 1 size 16, palette off, the fixture of gapfixtures.js:
            - the notch cut into block C (row 29, x 30-32) stays navy, as the source draws it;
            - the 12 px navy between blocks 2 and 3 (column 48, rows 41-50) stays navy: the two are not fused;
            - the L's inside corner (28,53) is drawn white: a corner is not a gap;
            - every edge where a yellow cell touches navy is at a notch or gap cell (26 such edges: 6 at the notch,
              20 at the gap) - the ring is closed everywhere else;
            - every yellow cell is where the engine without HUG puts it (the shapes keep their cells).
     TEST 2 the same with the palette on.
   Each fails on base-623 on behaviour (base-623 has no ring: yellow touches navy all round, and the corner is navy)
   and on round 8's page (pf-42-repair8/7: the notch and the gap are white). The comparison run for the yellow cells
   is the page's engine with HUG off: HUG_ON = false where the page has that switch, the page as it is where it has
   none (base-623 - which is HUG off).

   ROUND 9b (gate9b). Round 9's notes said of tests 1-2: "MO (no fill-vs-line condition) passes - NO SPEC PINS (1)".
   True, and incomplete: the numbers verifier showed one-line mutants of GAP that tests 1-2 cannot tell from the
   shipped rule - V9 (no sliver walk: a third colour ends a walk open), V12 (HUG_GAP_OUT 2.0), V2b (only the line
   ends a walk, not the shape), V10 / V11 / V7 (HUG_GAP 1.25 / 2.25 / 3.0), V6 (transparency closes a walk) and MO
   (HUG_GAP_OUT 0) - because that fixture is crisp rectangles with 12-14 px gaps: no fill pixel meets an anti-alias
   row or the shape, and no gap is near the threshold. V9 alone gives GATE Hoodie at 16 round 8's output back cell
   for cell. Tests 3-4 run the EDGES picture (gapfixtures.js, paintEdges), one element per part of GAP (cell x,y):
     E1 (20-22,19)       a notch whose navy meets its white lining through a 2 px AA row (a third colour): navy.
                         A sliver up to HUG_REACH px is walked past - what keeps GATE's 12 cells.            (V9)
     E2 (32,17-21)       12 px of navy between two blocks, meeting each white line through a 2 px AA row: navy. (V9)
     E3 (43,17-21)       22 px (1.375 cells) of navy between two blocks' lines: navy.                        (V10)
     E4 (55-56,17-21)    26 px (1.625 cells): navy - HUG_GAP is at least 1.625 cells. Its cell 56 holds
                         10 px fill / 6 px line a row (ratio 1.67).                                          (V10, V12)
     E5 (19-20,33-37)    30 px (1.875 cells): beyond HUG_GAP, so open fill and each block's ring is drawn: white.
                         This pins the threshold's side (HUG_GAP under 1.875 cells), not a judgement that two
                         rings meeting there reads better than a navy cell would.                            (V11, V7)
     E6 (32,33-37)       a 9 px gap inside one cell: 9 px fill / 7 px line a row (56% / 44%, ratio 1.29) - at
                         least as much fill as line: navy.                                                   (V12)
     E7 (44,33-37)       a 6 px gap centred in one cell: 6 px fill / 10 px line a row (38% / 62%); the
                         centre-weighted vote shows navy, but the cell is more line than fill: white.        (MO)
     E8 (29-31,50)       a notch lined white above only - below, its navy meets the yellow shape itself: navy.
                         The shape ends a walk as the line does.                                             (V2b)
     E9 (13,48-52)       a block 25 px from the picture's transparent edge: transparency leaves a walk open, so
                         the band is open fill and the ring is drawn: white.                                 (V6)
   and every yellow-navy edge is at E1, E2, E3, E4, E6 or E8 (the ring is closed everywhere else); yellow cells =
   HUG off. So HUG_GAP_OUT is pinned to (0.6, 1.29] and HUG_GAP to [1.625, 1.875) cells (the 311's output holds
   from 1.5 to 2.0 by the numbers verifier's sweep: a value in 1.5-1.625 or 1.875-2.0 would fail here and change no
   picture). Each mutant above, built as a one-line change of gate9.html, fails tests 3 and 4 (round 9b's notes).
     TEST 3 size 16, palette off, the EDGES picture.   TEST 4 the same with the palette on. */
import { test, expect } from '@playwright/test';
import { FIX } from './gapfixtures.js';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixRepair8 === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
  await page.addScriptTag({ content: FIX });
};

const NOTCH = ['30,29', '31,29', '32,29'];
const GAP = Array.from({ length: 10 }, (_, i) => '48,' + (41 + i));
const CORNER = '28,53';

async function runBoth(page, pal) {
  return page.evaluate(async (pal) => {
    const t = window.__g; const realToast = window.toast; window.toast = () => {};
    const bytes = await t.png(t.paintGaps());
    const on = await t.run(bytes, 'clothing/gaps.png', 16, [], pal);
    const off = await t.run(bytes, 'clothing/gaps.png', 16, t.has('HUG_ON') ? ['HUG_ON'] : [], pal);
    window.toast = realToast;
    const at = (o, s) => { const [x, y] = s.split(',').map(Number); return t.at(o, x, y); };
    return { w: on.w, on: t.count(on), off: t.count(off), map: t.map(on, 22, 22, 36, 36), hasHug: t.has('HUG_ON'),
      notch: ['30,29', '31,29', '32,29'].map(s => at(on, s)).join(''),
      gap: Array.from({ length: 10 }, (_, i) => at(on, '48,' + (41 + i))).join(''),
      corner: at(on, '28,53'), cornerOff: at(off, '28,53') };
  }, pal);
}

/* round 9b: the EDGES picture - one element per part of GAP (see the header) */
const EDGE = {
  E1: { cells: ['20,19', '21,19', '22,19'], want: 'NNN', kept: true, why: 'E1: a notch whose navy meets its lining through a 2 px AA row stays navy (a sliver is walked past)' },
  E2: { cells: [17, 18, 19, 20, 21].map(y => '32,' + y), want: 'NNNNN', kept: true, why: 'E2: 12 px of navy meeting each line through a 2 px AA row stays navy (a sliver is walked past)' },
  E3: { cells: [17, 18, 19, 20, 21].map(y => '43,' + y), want: 'NNNNN', kept: true, why: 'E3: a 22 px gap (1.375 cells) stays navy' },
  E4: { cells: [17, 18, 19, 20, 21].flatMap(y => ['55,' + y, '56,' + y]), want: 'NNNNNNNNNN', kept: true, why: 'E4: a 26 px gap (1.625 cells) stays navy, cell 56 too (10 px fill / 6 px line)' },
  E5: { cells: [33, 34, 35, 36, 37].flatMap(y => ['19,' + y, '20,' + y]), want: 'WWWWWWWWWW', kept: false, why: 'E5: a 30 px band (1.875 cells) is open fill: each ring drawn white' },
  E6: { cells: [33, 34, 35, 36, 37].map(y => '32,' + y), want: 'NNNNN', kept: true, why: 'E6: a cell with 56% fill / 44% line in a 9 px gap stays navy (at least as much fill as line)' },
  E7: { cells: [33, 34, 35, 36, 37].map(y => '44,' + y), want: 'WWWWW', kept: false, why: 'E7: a cell with 38% fill / 62% line in a 6 px gap is drawn white (more line than fill)' },
  E8: { cells: ['29,50', '30,50', '31,50'], want: 'NNN', kept: true, why: 'E8: a notch lined above only, the yellow below, stays navy (the shape ends a walk)' },
  E9: { cells: [48, 49, 50, 51, 52].map(y => '13,' + y), want: 'WWWWW', kept: false, why: 'E9: the band to the transparent edge is open fill: the ring is drawn white' },
};

async function runEdges(page, pal) {
  return page.evaluate(async ({ pal, EDGE }) => {
    const t = window.__g; const realToast = window.toast; window.toast = () => {};
    const bytes = await t.png(t.paintEdges());
    const on = await t.run(bytes, 'clothing/edges.png', 16, [], pal);
    const off = await t.run(bytes, 'clothing/edges.png', 16, t.has('HUG_ON') ? ['HUG_ON'] : [], pal);
    window.toast = realToast;
    const at = (o, s) => { const [x, y] = s.split(',').map(Number); return t.at(o, x, y); };
    const got = {}; for (const [k, e] of Object.entries(EDGE)) got[k] = e.cells.map(s => at(on, s)).join('');
    return { w: on.w, on: t.count(on), off: t.count(off), got, map: t.map(on, 12, 13, 50, 45) };
  }, { pal, EDGE });
}

function checkEdges(r, label) {
  console.log(label, JSON.stringify({ yellow: r.on.yellow, edges: r.on.edges, white: r.on.white, other: r.on.other, got: r.got }) + '\n' + r.map);
  expect(r.w, 'the grid is 80 cells').toBe(80);
  expect(r.on.yellow, 'the EDGES picture has its yellow shapes').toBeGreaterThan(300);
  for (const [k, e] of Object.entries(EDGE)) expect.soft(r.got[k], e.why).toBe(e.want);
  expect(r.on.Y, 'every yellow cell is where the engine without HUG puts it').toBe(r.off.Y);
  const allowed = new Set(Object.values(EDGE).filter(e => e.kept).flatMap(e => e.cells));
  const stray = r.on.navyAt.filter(s => !allowed.has(s));
  expect(stray, 'a yellow cell touches navy only at the kept cells of E1, E2, E3, E4, E6 and E8: the ring is closed everywhere else').toEqual([]);
  expect(r.on.other, 'no other colour appears').toBe(0);
}

function check(r, label) {
  console.log(label, JSON.stringify({ hasHug: r.hasHug, yellow: r.on.yellow, edges: r.on.edges, white: r.on.white, offEdges: r.off.edges, notch: r.notch, gap: r.gap, corner: r.corner }) + '\n' + r.map);
  expect(r.w, 'the grid is 80 cells').toBe(80);
  expect(r.on.yellow, 'the fixture has its yellow shapes').toBeGreaterThan(200);
  expect(r.on.Y, 'every yellow cell is where the engine without HUG puts it').toBe(r.off.Y);
  expect(r.notch, 'the notch cut into block C stays navy, as the source draws it').toBe('NNN');
  expect(r.gap, 'the navy between blocks 2 and 3 stays navy: they are not fused').toBe('NNNNNNNNNN');
  expect(r.corner, 'the inside corner of the L is drawn as ring (white): a corner is not a gap').toBe('W');
  const allowed = new Set(NOTCH.concat(GAP));
  const stray = r.on.navyAt.filter(s => !allowed.has(s));
  expect(stray, 'a yellow cell touches navy only at the notch and the gap: the ring is closed everywhere else').toEqual([]);
  expect(r.on.edges, 'the notch (3 cells, yellow above and below) and the gap (10 cells, yellow on both sides)').toBe(26);
  expect(r.on.other, 'no other colour appears').toBe(0);
}

test.describe('the ring keeps the gaps the source draws', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('GAP at 16: notch and gap stay navy, the corner and the open sides are ring, yellow unchanged', async ({ page }) => {
    check(await runBoth(page, false), 'test 1');
  });

  test('GAP at 16 with the palette on: the same', async ({ page }) => {
    check(await runBoth(page, true), 'test 2');
  });

  test('GAP at 16, the EDGES picture: AA rows walked past, the shape ends a walk, the threshold 1.625-1.875 cells, fill vs line, transparency open', async ({ page }) => {
    checkEdges(await runEdges(page, false), 'test 3');
  });

  test('GAP at 16, the EDGES picture with the palette on: the same', async ({ page }) => {
    checkEdges(await runEdges(page, true), 'test 4');
  });
});
