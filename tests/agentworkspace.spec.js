/* The agent workspace: the editor, with the agent's work beside the art.

   The first version of the Agent page was two buttons and a wall of JSON, and
   the handoff says plainly "do not make this only a chat box or a checklist
   the user must operate". The workflow it describes is the agent doing setup,
   processing and checks while the OWNER compares, adjusts and approves - which
   is not a page beside the editor, it is the editor.

   THREE THINGS ARE TESTED HERE and each exists because the owner's half of the
   job is impossible without it:

     the panel says what is loaded AND what the collection already decided
       about its layer, so nobody re-derives a settled parameter
     hold-to-compare shows the trait as it arrived, which is what "the user
       compares results" means
     the log is written by the operations themselves, so it cannot claim work
       the pixels do not show

   And the spec check, from the Creator Kit's own brief: at most 16 palette
   colours, 8 for clothing, everything from the fixed 256, no partial alpha.
*/
import { test, expect } from '@playwright/test';

/* Opens a trait on a named layer, drawn at 10px blocks in a few known
   colours, with optional strays. Greyscale so nothing in the open path reads
   it as a base render and cleans it away before the test begins. */
const open = (page, opts) => page.evaluate(async (o) => {
  const { layer, colours, strays } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const S = 160, block = 10;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  for (let by = 0; by * block < S; by++) for (let bx = 0; bx * block < S; bx++) {
    g.fillStyle = colours[(bx + by) % colours.length];
    g.fillRect(bx * block, by * block, block, block);
  }
  for (const s of (strays || [])) { g.fillStyle = s[2]; g.fillRect(s[0], s[1], 1, 1); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_Probe_' + layer + '_approved', kind: 'trait', name: 'Probe',
    layer, status: 'approved', blob, w: S, h: S, at: 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: [layer, 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
  const rec = (await dbAll()).find(r => r.kind === 'trait');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 600));
  return { work: document.getElementById('agwork').textContent,
    open: !document.getElementById('app').hidden };
}, opts);

const log = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#aglog .agstep')].map(p => p.textContent));

/* Three greys from the fixed palette, so a fixture is on-palette unless it is
   deliberately not. */
const ON = ['#2E222F', '#3E3546', '#625565'];

test.describe('the agent workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof agentSpec === 'function');
  });

  test('THE EDITOR IS THE WORKSPACE, and the panel says what it is working on',
    async ({ page }) => {
      const r = await open(page, { layer: 'hats', colours: ON });
      expect(r.open, 'the art is on screen').toBe(true);
      expect(r.work).toContain('Probe.png');
      expect(r.work).toContain('160×160');
      expect(r.work).toContain('hats');
      expect(r.work, 'and what was already decided about this layer')
        .toContain('grid 8px by the collection rules');
    });

  test('and an exempt layer is told it has no rule, not given one',
    async ({ page }) => {
      /* THE ORDERING BUG THIS CAUGHT. The rule used to be looked up before the
         layer was set, so it asked about whatever the select had defaulted to
         - "unsorted" - which has no exemption and returns the body grid. A
         chains trait was silently reported as 8px. */
      const r = await open(page, { layer: 'chains', colours: ON });
      expect(r.work).toContain('chains');
      expect(r.work).toContain('no grid rule for this layer');
    });

  test('HOLD TO COMPARE SHOWS THE TRAIT AS IT ARRIVED', async ({ page }) => {
    /* What "the user compares results" needs. The comparison is against the
       image the editor keeps for Reset, so it is exactly what came in - not a
       copy taken at some later moment nobody chose. */
    await open(page, { layer: 'hats', colours: ON, strays: [[44, 44, '#FFFFFF']] });
    const before = await page.evaluate(() =>
      [...ctx.getImageData(44, 44, 1, 1).data]);
    expect(before, 'the stray is on the canvas').toEqual([255, 255, 255, 255]);
    /* Tidy it away, then look back. */
    await page.evaluate(() => {
      $('blksize').value = '10';
      $('blksize').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('blktidy').click();
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => [...ctx.getImageData(44, 44, 1, 1).data]);
    expect(after, 'and it is gone').not.toEqual([255, 255, 255, 255]);
    const shown = await page.evaluate(() => {
      const cv = document.getElementById('cmppv');
      agentBefore(true);
      const on = getComputedStyle(cv).display;
      const g = cv.getContext('2d');
      const px = [...g.getImageData(44, 44, 1, 1).data];
      agentBefore(false);
      return { on, off: getComputedStyle(cv).display, px };
    });
    expect(shown.on, 'held: the before image is over the canvas').toBe('block');
    expect(shown.px, 'and it still has the stray in it').toEqual([255, 255, 255, 255]);
    expect(shown.off, 'let go: it is gone again').toBe('none');
  });

  test('THE LOG IS WRITTEN BY THE OPERATIONS, not narrated', async ({ page }) => {
    /* An agent that tidied forty blocks should not have to be believed about
       it. The count in the line is the count the operation itself reported. */
    await open(page, { layer: 'hats', colours: ON,
      strays: [[44, 44, '#FFFFFF'], [74, 64, '#FFFFFF'], [104, 94, '#FFFFFF']] });
    expect(await log(page), 'a fresh trait starts with a fresh log').toEqual([]);
    await page.evaluate(() => {
      $('blksize').value = '10';
      $('blksize').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('blktidy').click();
    });
    await page.waitForTimeout(500);
    const lines = await log(page);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Tidied to the 10px grid');
    expect(lines[0], 'with the operation\'s own numbers').toContain('3 blocks, 3 pixels');
  });

  test('and opening another trait does not inherit its log', async ({ page }) => {
    /* Carrying the previous trait's log over would credit this one with work
       done to something else. */
    await open(page, { layer: 'hats', colours: ON, strays: [[44, 44, '#FFFFFF']] });
    await page.evaluate(() => {
      $('blksize').value = '10';
      $('blksize').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('blktidy').click();
    });
    await page.waitForTimeout(400);
    expect((await log(page)).length).toBe(1);
    await open(page, { layer: 'hats', colours: ON });
    expect(await log(page), 'a new pass').toEqual([]);
  });

  test('THE SPEC CHECK COUNTS COLOURS AGAINST THE CATEGORY BUDGET',
    async ({ page }) => {
      /* From the Creator Kit brief: at most 16 palette colours, 8 for
         clothing, black outlines included. */
      await open(page, { layer: 'hats', colours: ON });
      const r = await page.evaluate(() => PB.spec());
      expect(r.colours).toBe(3);
      expect(r.budget, 'sixteen for everything but clothing').toBe(16);
      expect(r.overBudget).toBe(0);
      expect(r.offPaletteColours, 'these three are from the fixed 256').toBe(0);
      expect(r.partialAlpha).toBe(0);
    });

  test('and clothing gets eight', async ({ page }) => {
    await open(page, { layer: 'clothing', colours: ON });
    expect(await page.evaluate(() => PB.budgetFor('clothing'))).toBe(8);
    const r = await page.evaluate(() => PB.spec());
    expect(r.budget).toBe(8);
  });

  test('AND AN OFF-PALETTE COLOUR IS NAMED, WITH SOMEWHERE TO GO',
    async ({ page }) => {
      /* A count sends somebody hunting. Measured on the real collection, the
         useful case is a near miss: Black Yankees Cap uses #303030 where the
         palette has #303035 - five units apart, invisible alone, and exactly
         the drift that shows as a seam once composited. */
      await open(page, { layer: 'hats', colours: ON,
        strays: [[44, 44, '#303030'], [74, 64, '#303030']] });
      const r = await page.evaluate(() => PB.spec());
      expect(r.offPaletteColours).toBe(1);
      const off = r.offPalette[0];
      expect(off.hex).toBe('#303030');
      expect(off.pixels).toBe(2);
      expect(off.nearest, 'the nearest colour in the fixed palette').toMatch(/^#[0-9a-f]{6}$/i);
      expect(off.distance, 'and how far, so an obviously bad suggestion looks bad')
        .toBeLessThan(20);
    });

  test('and it measures without touching the artwork', async ({ page }) => {
    /* A check that quietly repaired would make its own number unverifiable
       against the art it came from. */
    await open(page, { layer: 'hats', colours: ON, strays: [[44, 44, '#303030']] });
    const was = await page.evaluate(() => {
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 7 + d[i + 3]) >>> 0;
      return s;
    });
    await page.evaluate(() => PB.spec());
    const now = await page.evaluate(() => {
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 7 + d[i + 3]) >>> 0;
      return s;
    });
    expect(now, 'not one pixel moved').toBe(was);
  });

  test('and partial alpha is counted, because the brief forbids it',
    async ({ page }) => {
      await open(page, { layer: 'hats', colours: ON });
      const r = await page.evaluate(() => {
        const im = ctx.getImageData(0, 0, art.width, art.height);
        im.data[(50 * art.width + 50) * 4 + 3] = 128;
        im.data[(50 * art.width + 51) * 4 + 3] = 200;
        ctx.putImageData(im, 0, 0);
        return PB.spec();
      });
      expect(r.partialAlpha).toBe(2);
    });
});
