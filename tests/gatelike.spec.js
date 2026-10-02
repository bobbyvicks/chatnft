/* GATE HOODIE'S WHITE RING, ON A PICTURE LIKE GATE'S (round 9c, gate9c; engine pf-42-repair8/8 unchanged: HUG + GAP).

   The owner, on GATE Hoodie at Pixel size 16: "like the white outline for gate, would there be something that could
   be fixed?". HUG draws that thin white outline as a ring of cells round each yellow letter; GAP keeps the navy the
   source draws inside and between the letters. Round 9b's verifier showed that nothing guarded the owner's request:
   one-line changes of HUG - HUG_REACH 4 -> 2 (H3), HUG_SIDE 0.2 -> 0.4 (H7), HUG_ROUND 0.75 -> 0.9 (H5), HUG_PX 4 -> 6
   (H2) - take away GATE's ring at 16 (28, 28, 20 and 16 of its cells) and passed all 453 specs, and so did GAP changes
   that move GATE's cells: any non-fill colour closing a walk (N7, N8: 8 cells), the fill-vs-line tie decided the other
   way (N12, N14, N15, N20, HUG_GAP_OUT 1.28: GATE's 31,76) and HUG_GAP_SHARE 0.25 (N18: GATE's 36,74). The fixtures
   were crisp: a line's sides found at 1-2 px, every share far from its threshold. GATE's are not: its line meets the
   navy through a 1-2 px anti-alias row, its side shares are .23-.36, its letters are lined for .82-.90 of their edge,
   its drawn ring cells hold 79-94 px of the line, its G's hole cell 31,76 is an exact tie (109 navy / 109 white), its
   A ring cell 36,74 is 26% closed, and its bottom ring cells walk down into the hood's black edge.

   The picture (gatelikefixtures.js, numbers in its header) is drawn to sit where GATE sits, measured with gate9c's
   PROBE build on GATE Hoodie and on this picture: four yellow letters G A T E on navy above a black hem, each in a 5 px
   white line behind a 0-3 px anti-alias row; G has a counter opening through a mouth, A an enclosed hole; G and A are
   one navy cell apart, A and T 22 px apart with the T's top lower.

     TEST 1 size 16, palette off. Cell by cell (x,y), gatelikefixtures.js EXPECT (in brackets: the mutants it stops):
       ringTop, ringSides   the ring over and down the open sides of every letter is white
                                                                  (H2 H3 H5 H7; also HUG_REACH 3, HUG_PX 5, HUG_SIDE 0.23)
       ringHem              the ring under every letter, 8-10 px of navy above the 18 px black hem, is white: a thick
                            third colour leaves a walk OPEN (GATE's row 79)                                (N7 N8)
       shareCell 33,48      the A ring cell beside the T's top, 5 of 16 navy rows closed (31.3%): white      (N18)
       tieCell 20,52        the G counter cell holding exactly 118 navy and 118 white pixels (and 20 others), 72% of
                            its navy closed: stays navy - at least as much fill as line (GATE's 31,76)
                                                                                (N12 N14 N15 N20 HUG_GAP_OUT 1.28)
       counter, mouth       the rest of the G's counter, and its mouth, stay navy
       gapGA                the one navy cell between G and A stays navy (the letters are not fused)
       channelAT            the A|T channel stays navy
       hole 29,49           the A's enclosed hole stays navy (a guard: no page tried reaches it)
     and: every cell whose source is at least half yellow is yellow, and the yellow cells are exactly the engine's with
     HUG off (the letters keep their shapes); a yellow cell touches navy only at the kept cells above - the ring is
     closed round each letter everywhere else (49 such edges); no other colour appears.
     TEST 2 the same with the palette on.
     TEST 3 GUARD, size 8 (palette on, then off): nothing changes - the output equals the engine's with HUG off byte for
            byte, and the outline is already whole (0 yellow-navy edges). It fails only if HUG takes a cell at 8; it
            guards GATE at 8 (0 cells changed on the 311). No mutant tried fails it.
   The control run is the page's engine with HUG_ON = false where the page has that switch, the page as it is where it
   has none (base-623, which has no HUG). On base-623 tests 1 and 2 fail on behaviour (no ring: ringTop, ringSides,
   ringHem and shareCell navy, 91 stray edges); test 3 passes there (a guard). Each mutant named above fails tests 1
   and 2 on behaviour (gate9c's notes quote each failing assertion, and give the window of each constant this file
   accepts beside the window that leaves GATE's 16 unchanged). */
import { test, expect } from '@playwright/test';
import { GL } from './gatelikefixtures.js';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixRepair8 === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
  await page.addScriptTag({ content: GL });
};

async function run16(page, pal) {
  return page.evaluate(async (pal) => {
    const t = window.__gl; const realToast = window.toast; window.toast = () => {};
    const px = t.paint(), bytes = await t.png(px);
    const on = await t.run(bytes, 'clothing/gatelike.png', 16, [], pal);
    const off = await t.run(bytes, 'clothing/gatelike.png', 16, t.has('HUG_ON') ? ['HUG_ON'] : [], pal);
    window.toast = realToast;
    const want = {}; t.EXPECT.forEach(e => { want[e[0]] = t.want(e[0]); });
    const srcY = t.yellowCells(px, 16), notY = srcY.filter(s => { const [x, y] = s.split(',').map(Number); return t.at(on, x, y) !== 'Y'; });
    return { w: on.w, on: t.count(on), off: t.count(off), got: t.judge(on), want, why: t.EXPECT.map(e => [e[0], e[4]]), kept: t.kept(),
      srcY: srcY.length, notY, map: t.map(on, 12, 42, 44, 16), hasHug: t.has('HUG_ON') };
  }, pal);
}

function check16(r, label) {
  console.log(label, JSON.stringify({ hasHug: r.hasHug, yellow: r.on.yellow, white: r.on.white, edges: r.on.edges, offEdges: r.off.edges, other: r.on.other, got: r.got }) + '\n' + r.map);
  expect(r.w, 'the grid is 80 cells').toBe(80);
  expect(r.srcY, 'the picture has its letters: cells at least half yellow in the source').toBeGreaterThan(200);
  expect(r.off.edges, 'the control (HUG off) shows the outline as gaps: yellow touches navy all round').toBeGreaterThan(100);
  for (const [name, why] of r.why) expect.soft(r.got[name], why).toBe(r.want[name]);
  expect(r.notY, 'every cell the source draws at least half yellow is yellow').toEqual([]);
  expect(r.on.Y, 'the yellow cells are exactly the engine\'s with HUG off: the letters keep their shapes').toBe(r.off.Y);
  const kept = new Set(r.kept);
  const stray = r.on.navyAt.filter(s => !kept.has(s));
  expect(stray, 'a yellow cell touches navy only at the kept cells (counter, mouth, G|A, A|T, hole): the white ring is closed round each letter everywhere else').toEqual([]);
  expect(r.on.edges, 'the kept cells each still touch their letters: 49 yellow-navy edges, all at kept cells').toBe(49);
  expect(r.on.other, 'no other colour appears').toBe(0);
}

test.describe('GATE-like letters: the white ring at 16, the gaps kept, nothing at 8', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('GATE-like at 16: the ring closes round each letter except at the gaps the source draws; yellow kept', async ({ page }) => {
    check16(await run16(page, false), 'test 1');
  });

  test('GATE-like at 16 with the palette on: the same', async ({ page }) => {
    check16(await run16(page, true), 'test 2');
  });

  test('GUARD - GATE-like at 8: nothing changes, the outline is already whole', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__gl; const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(t.paint()), res = [];
      for (const pal of [true, false]) {
        const on = await t.run(bytes, 'clothing/gatelike.png', 8, [], pal);
        const off = await t.run(bytes, 'clothing/gatelike.png', 8, t.has('HUG_ON') ? ['HUG_ON'] : [], pal);
        let diff = 0; for (let i = 0; i < on.data.length; i += 4) if (on.data[i] !== off.data[i] || on.data[i + 1] !== off.data[i + 1] || on.data[i + 2] !== off.data[i + 2] || on.data[i + 3] !== off.data[i + 3]) diff++;
        const k = t.count(on);
        res.push({ pal, w: on.w, diff, edges: k.edges, yellow: k.yellow, white: k.white });
      }
      window.toast = realToast;
      return res;
    });
    console.log('test 3', JSON.stringify(r));
    for (const x of r) {
      expect(x.w, 'the grid is 160 cells').toBe(160);
      expect(x.yellow, 'the letters are there at 8').toBeGreaterThan(600);
      expect(x.diff, 'at 8 (palette ' + (x.pal ? 'on' : 'off') + ') no cell differs from the engine with HUG off').toBe(0);
      expect(x.edges, 'at 8 the outline is already whole: no yellow cell touches navy').toBe(0);
    }
  });
});
