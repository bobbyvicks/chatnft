/* The pixel inspection panel: scanning, walking the findings, and applying
   only what the core is willing to suggest.

   The measurement is covered by pixelqa.spec.js and verified identical to the
   ChatNFT original. This is about the half you press, and the two things that
   can go wrong with it are both about STALENESS: a report describing pixels
   that have since moved, and a repair applied twice.

   VERIFIED ON A REAL TRAIT before these were written. Exit Liquidity Blue
   Hoodie, 1280x1280: the grid box offered 1, 4, 5 and 8 and chose 5 - the size
   the art is drawn at - which reports 385 mixed cells where a fixed 4px grid
   reports 3198. Scan 189ms. Select suggested took 8, applying moved 200
   pixels, the history grew by exactly one step and one undo put it all back.
*/
import { test, expect } from '@playwright/test';
/* The side panel is folded by default like every section in that column, so
   the value is set through the helper rather than through the picker. */
import { setSelect } from './helpers.js';

/* Opens a canvas drawn at 10px blocks with `strays` single stray pixels in it,
   the shape the tool is for: art on a grid with hand edits knocking it off. */
const open = (page, opts) => page.evaluate(async (o) => {
  const { strays, size, block } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  const w = size, h = size;
  const d = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, v) => { const i = (y * w + x) * 4;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; };
  const across = Math.floor(w / block);
  for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
    /* THREE COLOURS IN DIAGONAL STRIPES, not twelve scattered. With a
       different grey per block every block is its own island - eight-way
       connectivity cannot join them - and a scan of this fixture reported
       259 small islands rather than the three strays. Real art has large
       connected regions of one colour; blocks that share an anti-diagonal
       touch at their corners and merge, which is what makes the strays the
       only small things here. */
    const v = 40 + ((bx + by) % 3) * 50;
    for (let y = by * block; y < (by + 1) * block; y++)
      for (let x = bx * block; x < (bx + 1) * block; x++) put(x, y, v);
  }
  /* Strays well inside their blocks, so each is an enclosed island whose
     boundary agrees - the one case the core will offer to repair. */
  const at = [];
  for (let k = 0; k < strays; k++) {
    const bx = 1 + (k % (across - 2)), by = 1 + (k % (across - 2));
    const x = bx * block + 4, y = by * block + 4;
    put(x, y, 232); at.push([x, y]);
  }
  fileName = 'probe.png';
  startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  await new Promise(r => setTimeout(r, 250));
  adoptBlock(measuredBlock(d, w, h));
  await new Promise(r => setTimeout(r, 150));
  let opaque = 0;
  const px = ctx.getImageData(0, 0, art.width, art.height).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) opaque++;
  if (!opaque) throw new Error('the fixture was erased before the test began');
  return { at, gridBlock };
}, opts);

const panel = (page) => page.evaluate(() => ({
  status: document.getElementById('qastatus').textContent,
  detail: document.getElementById('qadetail').textContent,
  rows: [...document.querySelectorAll('#qalist .qafind button')].map(b => b.textContent),
  cells: [...document.getElementById('qacell').options].map(o => o.textContent),
  chosen: document.getElementById('qacell').value,
  applyText: document.getElementById('qaapply').textContent,
  applyOff: document.getElementById('qaapply').disabled,
  reportOff: document.getElementById('qareport').disabled,
  overlay: getComputedStyle(document.getElementById('qapv')).display,
  live: !!QA,
  offerable: [...document.querySelectorAll('#qalist .qafind input')]
    .filter(i => !i.disabled).length,
}));

const scan = (page) => page.evaluate(async () => {
  await qaRunScan();
  await new Promise(r => setTimeout(r, 50));
});

const colourAt = (page, x, y) => page.evaluate(([px, py]) => {
  const d = ctx.getImageData(px, py, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, [x, y]);

test.describe('the pixel inspection panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof qaRunScan === 'function');
  });

  test('THE GRID OFFERS THE SIZE THE ART IS DRAWN AT, AND CHOOSES IT',
    async ({ page }) => {
      /* Codex's panel offers a fixed 4, 8 and native. This site measures what
         the trait is actually drawn at, and choosing the wrong grid is the
         difference between "385 mixed cells" and "3198" on the same picture -
         so the measurement is the default and the other three stay available. */
      const r = await open(page, { strays: 3, size: 160, block: 10 });
      expect(r.gridBlock).toBe(10);
      const p = await panel(page);
      expect(p.cells).toContain('10×10 px (this art)');
      expect(p.cells.some(t => t.startsWith('4×4'))).toBe(true);
      expect(p.cells.some(t => t.startsWith('8×8'))).toBe(true);
      expect(p.chosen, 'the measurement, not a guess').toBe('10');
    });

  test('a scan finds the strays and offers exactly them', async ({ page }) => {
    await open(page, { strays: 3, size: 160, block: 10 });
    await scan(page);
    const p = await panel(page);
    /* THE NUMBER THAT MATTERS IS THE SUGGESTIONS, not the islands. How many
       small components a fixture happens to have is an accident of where the
       stripes meet the canvas edge - this one has five - while how many of
       them the core is willing to touch is the claim being made. */
    expect(p.status).toContain('3 suggested repairs');
    expect(p.status).toMatch(/[0-9]+ small islands/);
    expect(p.offerable, 'and exactly those three can be ticked').toBe(3);
    expect(p.reportOff, 'and a report to download').toBe(false);
    expect(p.applyOff, 'but nothing selected yet').toBe(true);
    expect(p.overlay, 'the overlay is drawn').toBe('block');
  });

  test('SELECT SUGGESTED THEN APPLY REPAIRS THEM, AND ONE UNDO PUTS THEM BACK',
    async ({ page }) => {
      const r = await open(page, { strays: 3, size: 160, block: 10 });
      await scan(page);
      const [sx, sy] = r.at[0];
      expect(await colourAt(page, sx, sy), 'the stray is there').toEqual([232, 232, 232, 255]);
      const neighbour = await colourAt(page, sx + 2, sy + 2);
      await page.evaluate(() => document.getElementById('qapick').click());
      expect((await panel(page)).applyText).toContain('(3)');
      const said = await page.evaluate(async () => {
        const out = []; const real = window.toast;
        window.toast = m => out.push(String(m));
        const depth = undoStack.length;
        document.getElementById('qaapply').click();
        await new Promise(r => setTimeout(r, 500));
        window.toast = real;
        return { said: out.join(' | '), grew: undoStack.length - depth };
      });
      expect(said.said).toContain('Repaired 3 findings: 3 pixels changed');
      expect(said.grew, 'exactly one history step').toBe(1);
      expect(await colourAt(page, sx, sy), 'repaired to the colour around it')
        .toEqual(neighbour);
      await page.click('#undo');
      await page.waitForTimeout(300);
      expect(await colourAt(page, sx, sy), 'and back in one press')
        .toEqual([232, 232, 232, 255]);
    });

  test('AND THE REPORT IS DROPPED THE MOMENT THE CANVAS MOVES',
    async ({ page }) => {
      /* THE ONE THAT MATTERS. A list still offering repairs after a brush
         stroke is a list of coordinates pointing at somebody else's pixels.
         qaRepair refuses them, but nobody should have to meet that refusal. */
      await open(page, { strays: 3, size: 160, block: 10 });
      await scan(page);
      expect((await panel(page)).live).toBe(true);
      await page.evaluate(() => {
        /* Any ordinary edit: snapshot is the chokepoint every one goes through. */
        snapshot();
        ctx.fillStyle = 'rgb(90,90,90)';
        ctx.fillRect(100, 100, 4, 4);
      });
      await page.waitForTimeout(150);
      const p = await panel(page);
      expect(p.live, 'the report is gone').toBe(false);
      expect(p.status).toContain('scan again');
      expect(p.rows.length, 'and so is the list').toBe(0);
      expect(p.applyOff).toBe(true);
    });

  test('and undo drops it too, which snapshot cannot see', async ({ page }) => {
    /* Undo, redo and reset replace the pixels without going through snapshot.
       Without a second hook the panel would go on describing the canvas that
       was undone. */
    await open(page, { strays: 3, size: 160, block: 10 });
    await page.evaluate(() => { snapshot(); ctx.fillRect(10, 10, 2, 2); });
    await scan(page);
    expect((await panel(page)).live).toBe(true);
    await page.click('#undo');
    await page.waitForTimeout(300);
    expect((await panel(page)).live, 'gone after an undo').toBe(false);
  });

  test('the filter changes what is listed, and the categories overlap',
    async ({ page }) => {
      await open(page, { strays: 3, size: 160, block: 10 });
      await scan(page);
      const counts = {};
      for (const kind of ['speck', 'thin', 'mixed', 'all']) {
        await setSelect(page, 'qafilter', kind);
        await page.waitForTimeout(120);
        counts[kind] = (await panel(page)).detail;
      }
      const n = s => +(String(s).match(/^(\d+) findings/) || [0, 0])[1];
      expect(n(counts.mixed), 'each stray breaks its own cell').toBe(3);
      expect(n(counts.speck), 'and is a small island').toBeGreaterThanOrEqual(3);
      expect(n(counts.all), 'together they are more than any one category')
        .toBeGreaterThan(Math.max(n(counts.speck), n(counts.mixed), n(counts.thin)));
    });

  test('walking the list moves the box, wraps, and names the reason',
    async ({ page }) => {
      /* The detail line is where the refusal reaches a person. The first
         finding in this fixture is a corner block refused as silhouette, not
         one of the strays - which is why the reason is read from a finding
         chosen by what it IS rather than by where it sits in the list. */
      await open(page, { strays: 3, size: 160, block: 10 });
      await scan(page);
      const total = await page.evaluate(() => qaVisible().length);
      await page.evaluate(() => document.getElementById('qanext').click());
      await page.waitForTimeout(120);
      expect((await panel(page)).detail).toContain('1/' + total);
      await page.evaluate(() => document.getElementById('qanext').click());
      await page.waitForTimeout(120);
      expect((await panel(page)).detail).toContain('2/' + total);
      /* Backwards past the start wraps to the end rather than stopping. From
         2/5 that is two presses: to 1/5, then round the front to 5/5. */
      await page.evaluate(() => { document.getElementById('qaprev').click();
        document.getElementById('qaprev').click(); });
      await page.waitForTimeout(150);
      expect((await panel(page)).detail, 'wrapped round the back')
        .toContain(total + '/' + total);
      /* And the one the core will repair says why it is allowed. */
      const at = await page.evaluate(() => {
        const i = qaVisible().findIndex(f => f.fixable);
        qaChoose(i);
        return i;
      });
      expect(at, 'there is a fixable one to look at').toBeGreaterThanOrEqual(0);
      const d = (await panel(page)).detail;
      expect(d).toContain('at least 75% of boundary agrees');
      expect(d, 'with its exact place on the canvas').toMatch(/x \d+, y \d+, w \d+, h \d+/);
    });
  test('A PROTECTED BOX TAKES ITS FINDINGS OFF THE TABLE', async ({ page }) => {
    /* One selection protects a logo or lettering from every automatic repair. */
    const r = await open(page, { strays: 3, size: 160, block: 10 });
    const [sx, sy] = r.at[0];
    await page.evaluate(([x, y]) => {
      document.getElementById('qarx').value = String(x - 5);
      document.getElementById('qary').value = String(y - 5);
      document.getElementById('qarw').value = '10';
      document.getElementById('qarh').value = '10';
      document.getElementById('qaadd').click();
    }, [sx, sy]);
    await page.waitForTimeout(150);
    await scan(page);
    const p = await panel(page);
    expect(p.status).toContain('2 suggested repairs');
    expect(p.status).toMatch(/[1-9]\d* protected/);
    const removable = await page.evaluate(() =>
      [...document.querySelectorAll('#qarects button')].map(b => b.textContent));
    expect(removable.length, 'and it can be taken off again').toBe(1);
    expect(removable[0]).toContain('Remove 1');
  });

  test('and a protected box that does not fit is refused by name',
    async ({ page }) => {
      await open(page, { strays: 1, size: 160, block: 10 });
      await page.evaluate(() => {
        document.getElementById('qarx').value = '150';
        document.getElementById('qary').value = '150';
        document.getElementById('qarw').value = '100';
        document.getElementById('qarh').value = '100';
        document.getElementById('qaadd').click();
      });
      await page.waitForTimeout(150);
      expect((await panel(page)).status).toContain('has to fit inside the canvas');
      const boxes = await page.evaluate(() =>
        document.querySelectorAll('#qarects button').length);
      expect(boxes, 'and was not added').toBe(0);
    });

  test('changing the grid drops the report rather than mislabelling it',
    async ({ page }) => {
      /* A report measured at 10px cells listed under a 4px heading would be
         wrong about the one number people read it for. */
      await open(page, { strays: 3, size: 160, block: 10 });
      await scan(page);
      expect((await panel(page)).live).toBe(true);
      await setSelect(page, 'qacell', '4');
      await page.waitForTimeout(150);
      const p = await panel(page);
      expect(p.live).toBe(false);
      expect(p.status).toContain('Grid changed');
    });

  test('scanning with nothing open says so instead of throwing',
    async ({ page }) => {
      await page.evaluate(async () => { await qaRunScan(); });
      await page.waitForTimeout(120);
      expect((await panel(page)).status).toContain('Open a trait first');
    });
});
