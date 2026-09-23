/* THE PALETTE NOTE COUNTS; IT DOES NOT SEARCH.

   Every open and every stroke ends in the off-palette note, and the note
   ran a CIEDE2000 nearest-colour search for every colour off the palette -
   to print two counts. Measured on the collection: 12.3 s to open a
   77,427-colour background, 147 s for a 1,014,063-colour one, 9.3 s per
   stroke on a hoodie.

   The fixture is a 256x256 trait holding 65,536 distinct colours, made in
   the page so no collection file goes into the repo. RUN AGAINST THE PAGE
   BEFORE THE FIX, the first test went red on the search count (one search
   per off-palette colour, tens of thousands). The second pins that the note
   still says the same numbers, counted here independently. The third
   pins that the agent panel still names the worst offender with a nearest
   colour and its distance, and that the result says how many colours were
   searched, which is new. */
import { test, expect } from '@playwright/test';

const openMany = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['backgrounds', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d'); const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4; im.data[i] = x; im.data[i + 1] = y; im.data[i + 2] = 37; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const rec = { id: 't_many_backgrounds_approved', kind: 'trait', name: 'many', layer: 'backgrounds',
    status: 'approved', blob, w: 256, h: 256, rarity: 1, at: 1 };
  await dbPut(rec);
  let searches = 0;
  const real = window.nearestPaletteColour;
  window.nearestPaletteColour = function () { searches++; return real.apply(this, arguments); };
  const t0 = performance.now();
  let opened = false;
  try { opened = await openTraitRecord(rec); } finally { window.nearestPaletteColour = real; }
  const ms = Math.round(performance.now() - t0);
  /* The off-palette count, worked out here from the canvas and the palette. */
  const pal = new Set(paletteList().map(h => h.toLowerCase()));
  const d = ctx.getImageData(0, 0, art.width, art.height).data;
  const offC = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const h = '#' + ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, '0');
    if (!pal.has(h)) offC.set(h, (offC.get(h) || 0) + 1);
  }
  let offPx = 0; for (const n of offC.values()) offPx += n;
  return { opened, ms, searches, note: $('palsnapnote').textContent, offColours: offC.size, offPixels: offPx };
});

test.describe('the palette note counts; it does not search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof specCheck === 'function');
  });

  test('OPENING A 65,536-COLOUR TRAIT searches for nearest colours a dozen times, not once per colour', async ({ page }) => {
    const r = await openMany(page);
    expect(r.opened).toBe(true);
    expect(r.offColours, 'the fixture really is many colours off the palette').toBeGreaterThan(60000);
    expect(r.searches, 'searches during the open').toBeLessThanOrEqual(12 * 4);
    console.log('open took ' + r.ms + ' ms with ' + r.searches + ' searches');
  });

  test('and the note says the same counts it always did', async ({ page }) => {
    const r = await openMany(page);
    expect(r.note).toBe(r.offColours + ' colours not in the palette · ' + r.offPixels.toLocaleString() + ' pixels');
  });

  test('the agent panel still names the worst offender with a nearest colour and its distance', async ({ page }) => {
    await openMany(page);
    const out = await page.evaluate(() => { const r = agentSpec(); return { text: $('agspecout').textContent, first: r.offPalette[0], nearestFor: r.nearestFor, n: r.offPalette.length }; });
    expect(out.text).toMatch(/worst #[0-9a-f]{6} → #[0-9a-f]{6} \(distance \d+\)/);
    expect(out.first.nearest).toMatch(/^#[0-9a-f]{6}$/);
    expect(out.nearestFor, 'how many were searched is said').toBe(12);
    expect(out.n).toBeGreaterThan(60000);
  });
});
