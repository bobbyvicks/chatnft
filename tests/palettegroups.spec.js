/* COLOURS NOBODY CAN TELL APART LAND TOGETHER, AND THE RUN SAYS HOW FAR
   THE FURTHEST ONE MOVED.

   snapToPalette mapped every distinct colour on its own, so two browns a
   generator left 0.62 dE apart - invisible - landed on palette colours
   19.45 apart, and skins/Dark Skin came out as a two-colour speckle over
   a flat tone (3,620 cells). 41 of the 245 hand-drawn-scale working
   traits split that way. Grouping the colours before the lookup (a colour
   joins a group when it is within 2.3 dE of the group's dominant colour,
   largest first; one palette colour per group) gives Dark Skin 3 colours
   and 0 split cells, and leaves the mean error to the source unchanged.

   Also: the fixer computed the worst move and never said it (272 of 311
   files move a colour by "a clear change"); shades 5 to 25 dE apart were
   merged into one palette colour on 153 files with no count; the worst
   was rounded per colour before the word for it was chosen; the switch's
   tooltip claimed a green stays a green, which is false for 4% of moved
   colours; and the single run's palette sentence, appended to the readout
   and then replaced by the final sentence, had never been seen at all -
   this spec's first run found it (readout "medium confidence (forced) -
   0.0s" with two colours moved).

   The yellow pair below is 9.7 dE apart by the page's own CIEDE2000; the
   review quoted 20.35, which is that file's furthest merged pair. The
   precondition asserts what the page measures. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Run the snap on a strip of the given colours, 64 pixels each. */
const snap = (page, hexes) => page.evaluate((hexes) => {
  const cols = hexes.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const n = cols.length * 64, d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { const c = cols[i % cols.length]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
  const r = snapToPalette(d, n);
  const out = new Set(); for (let i = 0; i < n; i++) out.add((d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]);
  const lab = (h) => { const c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; return labOf(c[0], c[1], c[2]); };
  const dE = (a, b) => { const p = lab(a), q = lab(b); return deltaE2000(p[0], p[1], p[2], q[0], q[1], q[2]); };
  return { r, outColours: out.size, sourceDE: hexes.length === 2 ? dE(hexes[0], hexes[1]) : null,
    targets: hexes.map(h => nearestPaletteColour(...[parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]).hex),
    word: deltaWord(r.worst) };
}, hexes);

test.describe('the palette snap', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('TWO BROWNS NOBODY CAN TELL APART LAND ON ONE PALETTE COLOUR', async ({ page }) => {
    const r = await snap(page, ['#66402d', '#67402e']);
    expect(r.sourceDE, 'the pair really is invisible').toBeLessThan(1);
    expect(r.targets[0], 'and on their own they went two ways, 19 dE apart').not.toBe(r.targets[1]);
    expect(r.outColours, 'together they land on one').toBe(1);
    expect(r.r.groups).toBe(1);
    expect(r.r.colours).toBe(2);
  });

  test('and two colours far apart stay two - the control', async ({ page }) => {
    const r = await snap(page, ['#66402d', '#2a7de1']);
    expect(r.sourceDE).toBeGreaterThan(10);
    expect(r.outColours).toBe(2);
    expect(r.r.groups).toBe(2);
  });

  test('SHADES MERGED INTO ONE PALETTE COLOUR ARE COUNTED', async ({ page }) => {
    const r = await snap(page, ['#ecc900', '#c4a600']);
    expect(r.sourceDE, 'two drawn shades, more than slight apart (9.7 by the page\'s own CIEDE2000)').toBeGreaterThan(5);
    expect(r.sourceDE).toBeLessThan(10);
    expect(r.targets[0], 'with the same nearest palette colour').toBe(r.targets[1]);
    expect(r.outColours).toBe(1);
    expect(r.r.merged, 'and the run knows it').toBeGreaterThanOrEqual(1);
    expect(r.r.mergedWorst).toBeGreaterThan(5);
  });

  test('THE WORST MOVE IS KEPT UNROUNDED, and the word follows the true value', async ({ page }) => {
    const r = await snap(page, ['#66402d']);
    expect(Number.isInteger(r.r.worst)).toBe(false);
    expect(r.r.worst).toBeCloseTo(11.44, 1);
    expect(r.word).toBe('a clear change');
  });

  test('art already on the palette is not touched and reports nothing', async ({ page }) => {
    const r = await page.evaluate(() => {
      const p = paletteRGB()[7];
      const n = 64, d = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) { d[i * 4] = p.r; d[i * 4 + 1] = p.g; d[i * 4 + 2] = p.b; d[i * 4 + 3] = 255; }
      const before = Array.from(d);
      const r = snapToPalette(d, n);
      return { r, same: before.join() === Array.from(d).join() };
    });
    expect(r.same).toBe(true);
    expect(r.r.colours).toBe(0);
    expect(r.r.worst).toBe(0);
  });

  test('THE FIXER SAYS HOW FAR THE FURTHEST COLOUR MOVED, in the single run and the folder note', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const make = async (hexes, name) => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = hexes[(x + y) % hexes.length]; g.fillRect(x * 8, y * 8, 8, 8); }
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        c.width = 1; c.height = 1;
        return new File([blob], name, { type: 'image/png' });
      };
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixsnap').checked = false;
      document.getElementById('fixgrid').checked = false;
      document.getElementById('fixpal').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
      const realToast = window.toast; window.toast = () => {};
      await fixLoad(await make(['#66402d', '#2a7de1'], 'off.png'));
      await fixRun();
      const offSaid = document.getElementById('fixout').textContent;
      const pal = paletteRGB();
      await fixLoad(await make([pal[3].h, pal[9].h], 'on.png'));
      await fixRun();
      const onSaid = document.getElementById('fixout').textContent;
      /* the folder: one file from a skins path, one from hats */
      const bytesOf = async (file) => new Uint8Array(await file.arrayBuffer());
      const off = await make(['#66402d', '#2a7de1'], 'x.png');
      await fixBatch([fileWithPath(await bytesOf(off), 'skins/x.png'), fileWithPath(await bytesOf(off), 'hats/y.png')]);
      const note = document.getElementById('fixbatchout').textContent;
      window.toast = realToast;
      return { offSaid, onSaid, note, allowed: ruleCleanupAllowed('skins') };
    });
    /* IN THE FINAL SENTENCE, after the run's own words and its time - not
       appended to the readout and then replaced by them. */
    expect(r.offSaid).toMatch(/\(forced\) \u00b7 \d+\.\ds \u00b7 2 colours moved to the palette - the furthest by \d+ \([a-z ]+\)/);
    expect(r.onSaid, 'nothing moved, nothing claimed').not.toContain('furthest');
    expect(r.note).toMatch(/colours moved across [\d,]+ pixels - the furthest by \d+ \(/);
    expect(r.allowed, 'the page rules leave skins out of cleanup').toBe(false);
    expect(r.note, 'and the note says one of the two came from such a layer').toContain('including 1 from layers the agent rules leave out of cleanup');
  });

  test('the switch no longer promises a green stays a green', async ({ page }) => {
    const t = await page.evaluate(() => ({
      fixer: document.getElementById('fixpal').closest('label').title,
      editor: document.querySelector('button[title*="Change every colour in the trait"]').title,
    }));
    expect(t.fixer).not.toContain('different shade of green');
    expect(t.fixer).toContain('CIEDE2000');
    expect(t.editor).not.toContain('different shade of green');
  });
});
