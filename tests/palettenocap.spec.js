/* THE PALETTE GROUPS EVERY PICTURE, HOWEVER MANY COLOURS IT HAS.

   snapToPalette grouped colours within 2.3 dE only up to 8,192 distinct
   colours; past that every colour was its own group and the merged census
   compared every colour with every other on one palette colour. The
   fixture is a smooth picture whose neighbouring colours are about 1 dE
   apart, the shape of the photographic traits that crossed the cap. RUN
   AGAINST THE PAGE BEFORE THE FIX: the first two went red - 8,193 colours
   took seconds, and one colour more made groups and merged jump from a
   few hundred to thousands. The last two hold the grouping to the scan it
   replaces, written out here from the rule: the same pixels, groups and
   merged figure, under the old cap and past it. */
import { test, expect } from '@playwright/test';

/* n distinct colours on a 1280 x 1280 picture, neighbours about 1 dE apart. */
const build = (n) => `(() => {
  const W = 1280, d = new Uint8ClampedArray(W * W * 4);
  for (let p = 0; p < W * W; p++) {
    const k = p % ${n}, o = p * 4;
    d[o] = 60 + (k & 31) * 2; d[o + 1] = 60 + ((k >> 5) & 31) * 2; d[o + 2] = 60 + ((k >> 10) & 15) * 2; d[o + 3] = 255;
  }
  return d;
})()`;

/* The linear scan, from the rule: largest first, ties by value, a colour
   joins the earliest group whose dominant colour is within 2.3 dE (behind
   the same box), one palette colour per group from the pixel-weighted mean,
   and the merged census over groups sharing a palette colour. */
const REFERENCE = `function refSnap(d, n) {
  const pal = paletteRGB(), exact = new Set(pal.map(p => p.h)), palLab = pal.map(p => labOf(p.r, p.g, p.b));
  const count = new Map();
  for (let i = 0; i < n; i++) { const o = i * 4; if (!d[o + 3]) continue; const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]; count.set(key, (count.get(key) || 0) + 1); }
  const hexOf = key => '#' + ((key >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const cols = [...count.entries()].map(([key, px]) => ({ key, px, r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255 }));
  cols.sort((a, b) => b.px - a.px || a.key - b.key);
  const groups = [], hit = new Map();
  for (const c of cols) {
    if (exact.has(hexOf(c.key))) { hit.set(c.key, null); continue; }
    const lab = labOf(c.r, c.g, c.b);
    let grp = null;
    for (const g of groups) {
      const q = g.lab;
      if (Math.abs(q[0] - lab[0]) > 5 || Math.abs(q[1] - lab[1]) > 16 || Math.abs(q[2] - lab[2]) > 16) continue;
      if (deltaE2000(q[0], q[1], q[2], lab[0], lab[1], lab[2]) <= SNAP_GROUP_DE) { grp = g; break; }
    }
    if (!grp) { grp = { lab, sumL: 0, suma: 0, sumb: 0, px: 0, members: [] }; groups.push(grp); }
    grp.sumL += lab[0] * c.px; grp.suma += lab[1] * c.px; grp.sumb += lab[2] * c.px; grp.px += c.px; grp.members.push(c);
  }
  const byTarget = new Map();
  for (const g of groups) {
    const m = [g.sumL / g.px, g.suma / g.px, g.sumb / g.px];
    let best = pal[0], bd = Infinity;
    for (let k = 0; k < pal.length; k++) { const q = palLab[k]; const e = deltaE2000(m[0], m[1], m[2], q[0], q[1], q[2]); if (e < bd) { bd = e; best = pal[k]; } }
    for (const c of g.members) hit.set(c.key, best);
    const arr = byTarget.get(best.h) || []; arr.push(g); byTarget.set(best.h, arr);
  }
  let merged = 0;
  for (const arr of byTarget.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      let far = 0;
      for (let j = 0; j < arr.length; j++) { if (i === j) continue; const a = arr[i].lab, b = arr[j].lab; const e = deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]); if (e > far) far = e; }
      if (far >= 5) merged++;
    }
  }
  for (let i = 0; i < n; i++) { const o = i * 4; if (!d[o + 3]) continue; const t = hit.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]); if (!t) continue; d[o] = t.r; d[o + 1] = t.g; d[o + 2] = t.b; }
  return { groups: groups.length, merged };
}`;

const run = (page, n) => page.evaluate(`(() => {
  const d = ${build(n)};
  const t0 = performance.now();
  const r = snapToPalette(d, 1280 * 1280);
  return { ms: Math.round(performance.now() - t0), seen: r.seen, groups: r.groups, merged: r.merged };
})()`);

const againstReference = (page, n) => page.evaluate(`(() => {
  ${REFERENCE}
  const a = ${build(n)}, b = new Uint8ClampedArray(a);
  const ra = snapToPalette(a, 1280 * 1280), rb = refSnap(b, 1280 * 1280);
  let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return { seen: ra.seen, groups: [ra.groups, rb.groups], merged: [ra.merged, rb.merged], diff };
})()`);

test.describe('the palette groups every picture, however many colours it has', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof snapToPalette === 'function');
  });

  test('8,193 COLOURS are grouped, in well under a second', async ({ page }) => {
    const r = await run(page, 8193);
    console.log('8,193 colours: ' + JSON.stringify(r));
    expect(r.seen).toBe(8193);
    expect(r.groups, 'grouped, not one group a colour').toBeLessThan(2000);
    expect(r.ms).toBeLessThan(1500);
  });

  test('ONE COLOUR MORE changes nothing but that colour', async ({ page }) => {
    const a = await run(page, 8192), b = await run(page, 8193);
    console.log('8,192: ' + JSON.stringify(a) + '  8,193: ' + JSON.stringify(b));
    expect(Math.abs(b.groups - a.groups), 'groups').toBeLessThanOrEqual(1);
    expect(Math.abs(b.merged - a.merged), 'shades merged').toBeLessThanOrEqual(2);
  });

  test('the control: under the old cap, exactly the linear scan', async ({ page }) => {
    const r = await againstReference(page, 3000);
    expect(r.seen).toBe(3000);
    expect(r.diff, 'every pixel').toBe(0);
    expect(r.groups[0]).toBe(r.groups[1]);
    expect(r.merged[0]).toBe(r.merged[1]);
  });

  test('and past it, exactly what the scan would give with no cap', async ({ page }) => {
    const r = await againstReference(page, 9000);
    expect(r.seen).toBe(9000);
    expect(r.diff, 'every pixel').toBe(0);
    expect(r.groups[0]).toBe(r.groups[1]);
    expect(r.merged[0]).toBe(r.merged[1]);
  });
});
