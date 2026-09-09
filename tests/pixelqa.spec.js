/* Pixel inspection: what it finds, and what it refuses to touch.

   Ported from Codex's pixel-qa-core.js so the site can run the same pass his
   tooling does. VERIFIED AGAINST HIS ORIGINAL, both loaded in one browser and
   run on the same real traits: byte-identical reports - same counts, ids,
   bounds, reasons and replacement colours - on Exit Liquidity Blue Hoodie
   (56 islands, 8 fixable, 35 thin groups, 3198 mixed cells at 4px) and Black
   Yankees Cap (73 islands, 3 fixable), at about 120ms each for 1280x1280.

   THE TESTS BELOW ARE ALMOST ALL REFUSALS, because that is where the value is.
   Finding small islands is easy and a tool that offered to "clean" all of them
   would eat the outlines, the lettering and every deliberate diagonal in the
   collection. Each refusal has a stated reason, and each gets a test, because
   a port that quietly dropped one would pass every test about finding things.

   The fixtures are grey. A saturated one is two colour balls covering the
   picture, which basePlan reads as a render - but these call the functions
   directly rather than opening the editor, so that trap is not live here. They
   are grey anyway, so a later move into the editor cannot resurrect it.
*/
import { test, expect } from '@playwright/test';

/* Builds a canvas from a paint function and scans it. The paint function gets
   a put(x, y, [r,g,b,a]) and works in exact pixels. */
const scan = (page, opts) => page.evaluate((o) => {
  const { w, h, paint, cellSize, markSize, protectedRects } = o;
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, c) => { const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    data[i + 3] = c.length > 3 ? c[3] : 255; };
  // eslint-disable-next-line no-new-func
  new Function('put', 'w', 'h', paint)(put, w, h);
  const report = qaScan({ width: w, height: h, data },
    { cellSize: cellSize || 4, markSize: markSize === undefined ? 12 : markSize,
      protectedRects: protectedRects || [] });
  window.__qa = { report, data };
  return { counts: report.counts,
    specks: report.findings.filter(f => f.kind === 'speck').map(f => ({
      id: f.id, area: f.area, bounds: f.bounds, fixable: f.fixable,
      protected: f.protected, reason: f.reason,
      replacement: f.replacement || null, agreement: f.surroundingAgreement })) };
}, opts);

/* A field of one grey with a single stray pixel of another in the middle: the
   one shape the tool is allowed to repair. */
const ISLAND = 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
  + 'put(20, 20, [200, 200, 200]);';

test.describe('pixel inspection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof qaScan === 'function');
  });

  test('AN ENCLOSED ISLAND IS FOUND, AND IS THE ONE THING OFFERED AS A REPAIR',
    async ({ page }) => {
      const r = await scan(page, { w: 40, h: 40, paint: ISLAND });
      expect(r.counts.speck, 'the stray, and nothing else').toBe(1);
      const f = r.specks[0];
      expect(f.area).toBe(1);
      expect(f.fixable, 'enclosed, and the boundary agrees').toBe(true);
      expect(f.agreement, 'all eight neighbours are the field colour').toBe(1);
      expect(f.replacement, 'repaired to the colour around it')
        .toEqual([120, 120, 120, 255]);
      expect(f.reason).toContain('at least 75% of boundary agrees');
    });

  test('BUT DARK INK IS NEVER OFFERED - it is an outline or lettering',
    async ({ page }) => {
      /* THE REFUSAL THAT MATTERS MOST in this collection: every trait is
         outlined in black and several carry writing. A tool that tidied dark
         specks away would erase both. */
      const r = await scan(page, { w: 40, h: 40,
        paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
          + 'put(20, 20, [10, 10, 10]);' });
      expect(r.specks[0].fixable).toBe(false);
      expect(r.specks[0].reason).toContain('Dark ink');
    });

  test('nor is one at the canvas edge - that is silhouette', async ({ page }) => {
    const r = await scan(page, { w: 40, h: 40,
      paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
        + 'put(0, 20, [200, 200, 200]);' });
    expect(r.specks[0].fixable).toBe(false);
    expect(r.specks[0].reason).toContain('Silhouette, canvas edge');
  });

  test('nor one with partial opacity', async ({ page }) => {
    const r = await scan(page, { w: 40, h: 40,
      paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
        + 'put(20, 20, [200, 200, 200, 128]);' });
    const f = r.specks.find(s => s.bounds[0] === 20 && s.bounds[1] === 20);
    expect(f.fixable).toBe(false);
    expect(f.reason).toContain('partial opacity');
  });

  test('nor a diagonal-only structure, which is drawn that way on purpose',
    async ({ page }) => {
      /* Two pixels touching only at their corners: a deliberate stair, not a
         stray. Eight-way connectivity is what makes them one finding rather
         than two allegedly isolated dots. */
      const r = await scan(page, { w: 40, h: 40,
        paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
          + 'put(20, 20, [200, 200, 200]); put(21, 21, [200, 200, 200]);' });
      expect(r.counts.speck, 'one finding, not two').toBe(1);
      expect(r.specks[0].area).toBe(2);
      expect(r.specks[0].fixable).toBe(false);
      expect(r.specks[0].reason).toContain('Diagonal-only');
    });

  test('nor an elongated run, which is a stroke', async ({ page }) => {
    const r = await scan(page, { w: 40, h: 40,
      paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
        + 'for (let x = 15; x < 25; x++) put(x, 20, [200, 200, 200]);' });
    const f = r.specks.find(s => s.area === 10);
    expect(f.fixable).toBe(false);
    expect(f.reason).toContain('Elongated');
  });

  test('AND NOT WHERE THE SURROUNDING COLOURS DISAGREE', async ({ page }) => {
    /* An island on a boundary between two colours is not enclosed by either,
       so there is no "the colour around it" to repair it to. */
    const r = await scan(page, { w: 40, h: 40,
      paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)\n'
        + '  put(x, y, x < 20 ? [120, 120, 120] : [180, 180, 180]);\n'
        + 'put(20, 20, [200, 200, 200]);' });
    const f = r.specks.find(s => s.bounds[0] === 20 && s.bounds[1] === 20);
    expect(f.fixable).toBe(false);
    expect(f.agreement).toBeLessThan(0.75);
    expect(f.reason).toContain('Surrounding colours disagree');
  });

  test('and a protected box takes its island off the table', async ({ page }) => {
    /* One selection protects a logo or lettering from every automatic repair.
       The reason names protection rather than pretending nothing was found. */
    const r = await scan(page, { w: 40, h: 40, paint: ISLAND,
      protectedRects: [[15, 15, 25, 25]] });
    expect(r.specks[0].protected).toBe(true);
    expect(r.specks[0].fixable).toBe(false);
    expect(r.specks[0].reason).toContain('Protected');
    /* FOUR, NOT ONE, and the four are the point: that single stray pixel is a
       speck, a native thin run, a narrow run and a mixed grid cell all at once.
       The report says so in as many words - "categories can overlap" - and a
       count of protected FINDINGS is not a count of protected pixels. My first
       expectation here was 1, which was reading the number as the other one. */
    expect(r.counts.protected).toBe(4);
    expect(r.counts.speck, 'one of which is the island').toBe(1);
  });

  test('APPLYING A REPAIR CHANGES EXACTLY THAT ISLAND AND SAYS HOW MUCH',
    async ({ page }) => {
      await scan(page, { w: 40, h: 40, paint: ISLAND });
      const out = await page.evaluate(() => {
        const { report, data } = window.__qa;
        const im = { width: report.width, height: report.height, data };
        const f = report.findings.find(x => x.fixable);
        const r = qaRepair(im, report, [f.id]);
        const at = (x, y) => [r.data[(y * 40 + x) * 4], r.data[(y * 40 + x) * 4 + 1],
          r.data[(y * 40 + x) * 4 + 2], r.data[(y * 40 + x) * 4 + 3]];
        let differing = 0;
        for (let i = 0; i < r.data.length; i += 4)
          if (r.data[i] !== data[i] || r.data[i + 3] !== data[i + 3]) differing++;
        return { changed: r.changedPixels, differing, island: at(20, 20),
          neighbour: at(21, 20), changes: r.changes.length };
      });
      expect(out.changed, 'one pixel').toBe(1);
      expect(out.differing, 'and one pixel in the image, not a repaint').toBe(1);
      expect(out.island, 'now the colour around it').toEqual([120, 120, 120, 255]);
      expect(out.neighbour, 'which was already that colour').toEqual([120, 120, 120, 255]);
      expect(out.changes).toBe(1);
    });

  test('A REPAIR REFUSES A CANVAS THAT HAS MOVED SINCE THE SCAN',
    async ({ page }) => {
      /* THE ONE THAT PREVENTS SILENT DAMAGE. Three brush strokes after a scan,
         the findings describe a picture that no longer exists and their
         coordinates point at somebody else's pixels. */
      await scan(page, { w: 40, h: 40, paint: ISLAND });
      const err = await page.evaluate(() => {
        const { report, data } = window.__qa;
        const moved = new Uint8ClampedArray(data);
        moved[(30 * 40 + 30) * 4] = 7;          // one pixel, somewhere else
        try {
          qaRepair({ width: 40, height: 40, data: moved }, report,
            [report.findings.find(x => x.fixable).id]);
          return 'no error';
        } catch (e) { return e.message; }
      });
      expect(err).toContain('Artwork changed; scan again');
    });

  test('and refuses a manual-only finding even when its id is handed in',
    async ({ page }) => {
      /* The list only ticks fixable ones, so this is about the API rather than
         the UI - and the API is what a future panel, or a script, will call. */
      await scan(page, { w: 40, h: 40,
        paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
          + 'put(20, 20, [10, 10, 10]);' });
      const err = await page.evaluate(() => {
        const { report, data } = window.__qa;
        const dark = report.findings.find(f => f.kind === 'speck');
        try {
          qaRepair({ width: 40, height: 40, data }, report, [dark.id]);
          return 'no error';
        } catch (e) { return e.message; }
      });
      expect(err).toContain('Manual-only or protected finding');
    });

  test('thin, narrow and mixed are measured and never repaired',
    async ({ page }) => {
      /* A one-pixel line through a field: a legitimate fold or letter stroke.
         It is counted so it can be looked at, and it is not on the table. */
      const r = await scan(page, { w: 40, h: 40, cellSize: 4,
        paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
          + 'for (let y = 5; y < 35; y++) put(20, y, [200, 200, 200]);' });
      expect(r.counts.thin, 'the line is a thin group').toBeGreaterThan(0);
      expect(r.counts.thinPixels).toBe(30);
      expect(r.counts.mixed, 'and it puts cells off the 4px grid').toBeGreaterThan(0);
      expect(r.counts.fixable, 'none of which is offered as a repair').toBe(0);
    });

  test('partial alpha anywhere is counted, because this collection has none',
    async ({ page }) => {
      const r = await scan(page, { w: 20, h: 20,
        paint: 'for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [120, 120, 120]);\n'
          + 'put(10, 10, [120, 120, 120, 128]); put(11, 10, [120, 120, 120, 128]);' });
      expect(r.counts.alphaPixels).toBe(2);
      expect(r.counts.alpha, 'touching, so one group').toBe(1);
    });

  test('the downloadable report carries the rules and not the pixels',
    async ({ page }) => {
      /* A file of coordinates that does not say what it measured is unreadable
         next month, and megabytes of source pixels in it are unreadable now. */
      await scan(page, { w: 40, h: 40, paint: ISLAND });
      const out = await page.evaluate(() => {
        const e = qaExportReport(window.__qa.report);
        return { hasSource: 'source' in e, rules: e.rules, note: e.note,
          convention: e.coordinateConvention,
          size: JSON.stringify(e).length };
      });
      expect(out.hasSource, 'the source pixels are not in it').toBe(false);
      expect(out.rules.version).toBe(2);
      expect(out.rules.repair).toContain('75% boundary agreement');
      expect(out.convention).toContain('zero-based PNG pixels');
      expect(out.note).toContain('not proof of artistic defects');
    });

  test('and a scan refuses an image that is not a byte RGBA canvas',
    async ({ page }) => {
      const err = await page.evaluate(() => {
        try { qaScan({ width: 4, height: 4, data: new Float32Array(64) }, {}); return 'no error'; }
        catch (e) { return e.message; }
      });
      expect(err).toContain('byte RGBA canvas');
    });
});
