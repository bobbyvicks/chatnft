/* A SHADE GIVEN A NEW COLOUR KEEPS ITS HUE; THE OUTLINE GATE SEES THE PALETTE'S NEAR-BLACK (patch620).

     TEST 1 Jason Mask's beige shadow #d0c8a8 beside a grey-sage #9fa294: both fall on #bab8a4 without the
       shade rule (the precondition). patch617 then moved the beige to sage #bfc6a4 to stand apart; now the
       beige keeps #bab8a4 and the sage moves, so they still differ, in the drawn light/dark order.
       RUN AGAINST THE PAGE BEFORE THE FIX (node, live a8cfd74's snapToPalette): ["#bab8a4","#bfc6a4"].
       SUPERSEDED IN PART by patch631 (2026-10-04), which added the tan #d1c69a: the beige #d0c8a8 is 3.42 dE
       from it and 6.05 from #bab8a4, so it lands on the tan with or without the shade rule and never meets
       the sage. The precondition above stopped being true (on the patched page, without the rule:
       ["#bab8a4","#d1c69a"], merged 0) and the test went red on it, not on what it protects. What it
       protects - the beige reads beige, apart from the sage and lighter than it - is now TEST 1 on the
       drawn colours, and the shade rule itself is TEST 1b on a beige that still shares #bab8a4 with the
       sage on this palette and the one before (#ccc4ac, 2.79 dE from Jason's; found by a search of beiges
       beside #9fa294, scratchpad/fix8/p631/site/pw/probe). This is the measured Jason Mask change on the
       owner's options sheet: "the left face shadow goes tan, two shading bands kept".
     TEST 2 a square ringed in the palette's near-black #161616 is an outlined shape: the outline pass makes
       its ring pure black. Before the fix it was left #161616 (luminance 22, over the gate's 16).
       Controls: a navy ring #10103a, as dark but not grey, is left alone (counting every colour up to the
       new limit gave GATE Hoodie an outline it does not draw); a #0a0a0a ring, which the gate always
       counted, still becomes black - the pass is running.
   The chroma guard (a shade keeps half its colour) has no synthetic case here: a two-colour search found
   none that reaches it, and the 311-trait measurement is where it shows (Energy Drink Helmet's strap,
   scratchpad/fix8/round5/palette5). */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function' && typeof fixOutlineOnce === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* vertical bands, 40 x 20, through snapToPalette with the row width (as tests/palettekeepsshading.spec.js) */
const bands = (page, list, opts) => page.evaluate(({ list, opts }) => {
  const W = 40, H = 20, d = new Uint8ClampedArray(W * H * 4), at = [];
  let x0 = 0;
  for (const [h, w] of list) {
    const k = parseInt(h.slice(1), 16);
    for (let y = 0; y < H; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * W + x) * 4; d[o] = k >> 16; d[o + 1] = (k >> 8) & 255; d[o + 2] = k & 255; d[o + 3] = 255; }
    at.push(x0); x0 += w;
  }
  const rep = snapToPalette(d, W * H, W, opts || undefined);
  const out = at.map(x => '#' + [d[x * 4], d[x * 4 + 1], d[x * 4 + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
  const L = h => { const k = parseInt(h.slice(1), 16); return labOf(k >> 16, (k >> 8) & 255, k & 255)[0]; };
  return { out, L: out.map(L), merged: rep.merged };
}, { list, opts });

/* a 20 x 20 square on a 40 x 40 grid of cells, a one-cell ring of `ring` round a `fill`, through the outline pass */
const ringed = (page, ring, fill) => page.evaluate(({ ring, fill }) => {
  const W = 40, H = 40, d = new Uint8ClampedArray(W * H * 4);
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) {
    const c = rgb(x === 10 || x === 29 || y === 10 || y === 29 ? ring : fill), o = (y * W + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  const r = fixOutlineOnce({ W, H, data: d }, {});
  const at = (x, y) => '#' + [0, 1, 2].map(k => r.data[(y * W + x) * 4 + k].toString(16).padStart(2, '0')).join('');
  const ringCols = new Set();
  for (let i = 10; i < 30; i++) { ringCols.add(at(10, i)); ringCols.add(at(29, i)); ringCols.add(at(i, 10)); ringCols.add(at(i, 29)); }
  return { ring: [...ringCols], fill: at(20, 20) };
}, { ring, fill });

test.describe('a re-coloured shade keeps its hue; the gate sees the palette near-black', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('Jason Mask\'s beige shadow stays beige and still stands apart', async ({ page }) => {
    const list = [['#9fa294', 20], ['#d0c8a8', 20]];
    const off = await bands(page, list, { shades: false }), on = await bands(page, list);
    /* patch631: the tan #d1c69a is the beige's nearest colour, so the two no longer meet, rule or not */
    expect(off.out, 'without the shade rule the beige already has its own colour, the tan').toEqual(['#bab8a4', '#d1c69a']);
    expect(on.out, 'and with it, the same').toEqual(['#bab8a4', '#d1c69a']);
    expect(on.out[1], 'the beige is not sage #bfc6a4').not.toBe('#bfc6a4');
    expect(on.out[0], 'and the two still differ').not.toBe(on.out[1]);
    expect(on.L[0], 'the darker drawn shade stays darker').toBeLessThan(on.L[1]);
  });

  test('the shade rule still parts a beige that shares the sage\'s colour', async ({ page }) => {
    const list = [['#9fa294', 20], ['#ccc4ac', 20]];
    const off = await bands(page, list, { shades: false }), on = await bands(page, list);
    expect(off.out, 'THE PRECONDITION: without the shade rule both land on one colour').toEqual(['#bab8a4', '#bab8a4']);
    expect(off.merged).toBeGreaterThanOrEqual(1);
    expect(on.out[1], 'the beige keeps its colour, not sage #bfc6a4').toBe('#bab8a4');
    expect(on.out[0], 'and the two still differ').not.toBe(on.out[1]);
    expect(on.L[0], 'the darker drawn shade stays darker').toBeLessThan(on.L[1]);
  });

  test('a ring of the palette near-black is an outline; a navy ring is not', async ({ page }) => {
    const grey = await ringed(page, '#161616', '#8a6a4a');
    const navy = await ringed(page, '#10103a', '#8a6a4a');
    const near = await ringed(page, '#0a0a0a', '#8a6a4a');
    expect(near.ring, 'THE CONTROL: a ring the gate always counted becomes black - the pass is running').toEqual(['#000000']);
    expect(grey.ring, 'the #161616 ring is made pure black').toEqual(['#000000']);
    expect(grey.fill, 'and the fill is left').toBe('#8a6a4a');
    expect(navy.ring, 'a navy ring as dark is a drawn colour and is left alone').toEqual(['#10103a']);
  });
});
