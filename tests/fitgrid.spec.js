/* Repairing a trait that does not sit on the collection's cell grid.

   Four places now say which traits are off the grid and none of them could be
   acted on. The two repairs are different operations and only the owner knows
   which is right - a canvas cropped by accident wants PADDING, a file exported
   at the wrong scale wants SCALING - so this fills in the arithmetic and takes
   the choice from the Change chips, which already name both.

   MEASURED against the real shape it was written for: five files in the
   collection are 1254x1254 where the other 269 are 1280x1280, and the grid is
   160 cells. 1254 is 7.8375 cells.

   THE TEST THAT MATTERS MOST is the last pair. Padding claims to touch no
   pixel, and "the canvas is now 1280" is true of a scale as well - so the
   claim is checked by counting the opaque pixels and reading a marker's exact
   colour, which a resample changes and a pad cannot. Without that, a Fit that
   quietly scaled in both modes would pass every other test here. */
import { test, expect } from '@playwright/test';

/* Opens a canvas of the given size in a 160-cell project, sets the Change
   chip, presses Fit to grid, and reports what happened to the canvas AND to
   the pixels.

   THE FIXTURE IS GREY ON PURPOSE, and the first draft was not. It painted a
   saturated green block with a pink pixel in it - which is two saturated
   colour balls covering the whole picture, which is precisely what basePlan
   calls a RENDER, so startEditor hid the base and erased all 40,000 pixels
   before the test began. Every "no pixel changed" assertion then passed by
   comparing nothing to nothing. Neither colour here has any chroma, so no
   ball forms and the auto-hide has nothing to act on - and the guard below
   makes that failure impossible to have again quietly. */
const fit = (page, opts) => page.evaluate(async (o) => {
  const { size, mode, grid, snap } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  projectGrid = grid;
  $('rsgrid').value = String(grid);
  const w = size, h = size;
  const d = new Uint8ClampedArray(w * h * 4);
  /* A block of one exact colour, well inside the canvas, and a square of a
     second at its centre. Neither survives a resample unchanged: an
     interpolated pixel takes colour from its neighbours. */
  const put = (x, y, c) => { const i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  for (let y = 100; y < 300; y++) for (let x = 100; x < 300; x++) put(x, y, [40, 40, 40]);
  for (let y = 190; y < 210; y++) for (let x = 190; x < 210; x++) put(x, y, [200, 200, 200]);
  fileName = 'probe';
  startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  await new Promise(r => setTimeout(r, 250));
  setChip('rsmode', mode);
  if (snap === false && $('rssnap').getAttribute('aria-pressed') === 'true') $('rssnap').click();
  resizeBoxes();
  await new Promise(r => setTimeout(r, 60));

  const opaqueOf = () => {
    const px = ctx.getImageData(0, 0, art.width, art.height).data;
    let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
    return n;
  };
  const wasOpaque = opaqueOf();
  /* AN INSTRUMENT FAILURE MUST NOT BE ABLE TO LOOK LIKE A MEASUREMENT. If the
     fixture is gone before the press, every pixel assertion downstream is
     0 === 0 and the suite reads green over a feature nobody tested. */
  if (!wasOpaque && size > 100)
    throw new Error('the fixture was erased before the press - nothing downstream'
      + ' of this can mean anything');

  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  try {
    document.getElementById('rsfit').click();
    await new Promise(r => setTimeout(r, 400));
  } finally { window.toast = realToast; }

  /* Every distinct colour left on the canvas, and where the artwork is.

     THE COLOUR COUNT DOES NOT SEPARATE THE TWO REPAIRS, which the first draft
     of this file assumed it would. scaleArt enlarges by NEAREST NEIGHBOUR at
     every ratio, deliberately - its comment says interpolating "would invent
     colours that are not in the palette" - so a scale from 1254 to 1280
     repeats rows unevenly and invents nothing. The count is still asserted for
     the pad, where it is a real claim; what separates them is the BOX. */
  const px = ctx.getImageData(0, 0, art.width, art.height).data;
  const colours = new Set();
  let bx0 = art.width, by0 = art.height, bx1 = -1, by1 = -1;
  for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
    const i = (y * art.width + x) * 4;
    if (px[i + 3] === 0) continue;
    colours.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (y < by0) by0 = y; if (y > by1) by1 = y;
  }

  return {
    out: art.width + 'x' + art.height,
    said: said.join(' | '),
    wasOpaque, nowOpaque: opaqueOf(),
    colours: colours.size,
    box: bx1 < 0 ? null : { x0: bx0, y0: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 },
    note: ($('rsnow') || {}).textContent || '',
    /* What the census, which is the thing complaining, makes of it now. */
    census: sizeCensus([{ kind: 'trait', name: 'probe', w: art.width, h: art.height }]).oddCount,
  };
}, opts);

/* What the note under the Resize button says about a canvas of this size,
   with snapping on or off. Flat grey so the auto-hide has nothing to act on,
   for the same reason the fixture above is. */
const note = (page, opts) => page.evaluate(async (o) => {
  const { size, snap } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  projectGrid = 160;
  const w = size, h = size;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 90; d[i * 4 + 1] = 90;
    d[i * 4 + 2] = 90; d[i * 4 + 3] = 255; }
  fileName = 'probe';
  startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));
  const on = $('rssnap').getAttribute('aria-pressed') === 'true';
  if (snap !== on) $('rssnap').click();
  resizePreview();
  return { text: $('rsnow').textContent, title: $('rsnow').title,
    snapOn: $('rssnap').getAttribute('aria-pressed') === 'true' };
}, opts);

test.describe('fitting a trait to the collection grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fitToGrid === 'function');
  });

  test('the real case: 1254 becomes 1280 on a 160 cell grid', async ({ page }) => {
    const r = await fit(page, { size: 1254, mode: 'canvas', grid: 160 });
    expect(r.out, 'the nearest whole multiple of 160').toBe('1280x1280');
    expect(r.census, 'and the census stops complaining').toBe(0);
  });

  test('padding keeps every pixel exactly, which is the whole point',
    async ({ page }) => {
      /* THE CLAIM THE BUTTON MAKES. "It is 1280 now" is true of a scale too,
         so the size proves nothing on its own. A pad adds transparent canvas:
         the opaque count cannot change and no colour can appear that was not
         already there. A resample from 1254 to 1280 changes both. */
      const r = await fit(page, { size: 1254, mode: 'canvas', grid: 160 });
      expect(r.nowOpaque, 'not one pixel gained or lost').toBe(r.wasOpaque);
      expect(r.colours, 'the two colours it was painted with, and no third').toBe(2);
      /* The artwork was painted at 100,100 and is 200 across. Padding 1254 to
         1280 adds 26, centred, so it lands at 113 and is still 200 across -
         both halves checked, because "it moved" and "it is the same size" are
         different claims and a scale satisfies neither. */
      expect(r.box, 'the artwork is the size it was').toEqual({ x0: 113, y0: 113, w: 200, h: 200 });
      expect(r.said, 'and it says which repair it did').toContain('Padded');
    });

  test('and scaling does not, which is why it is a separate choice',
    async ({ page }) => {
      /* THE CONTROL. Without it "always pad" passes the test above and the
         Change chips stop meaning anything.

         MEASURED ON THE BOX, not on the colour count. The first draft asserted
         that a scale invents colours; it does not. scaleArt enlarges by
         nearest neighbour at every ratio on purpose, so 1254 to 1280 repeats
         rows unevenly and every colour on the canvas was already there. What
         a scale does and a pad cannot is make the ARTWORK bigger. */
      const r = await fit(page, { size: 1254, mode: 'art', grid: 160 });
      expect(r.out).toBe('1280x1280');
      expect(r.nowOpaque, 'there is more artwork than there was').toBeGreaterThan(r.wasOpaque);
      expect(r.box.w, 'the 200-wide block grew with the canvas').toBeGreaterThan(200);
      expect(r.colours, 'and it invented nothing, which is the point of nearest neighbour').toBe(2);
      expect(r.said).toContain('Scaled');
    });

  test('a canvas already on the grid is told so and left alone',
    async ({ page }) => {
      // A CONTROL. A button that resizes a correct trait is worse than none.
      const r = await fit(page, { size: 1280, mode: 'canvas', grid: 160 });
      expect(r.out).toBe('1280x1280');
      expect(r.nowOpaque).toBe(r.wasOpaque);
      expect(r.said).toContain('Already');
      expect(r.said).toContain('160 cell grid');
    });

  test('below one cell it goes UP to a whole cell, not to a divisor',
    async ({ page }) => {
      /* THE ONE THAT SEPARATES THIS FROM snapToGrid, which sits one line above
         it and answers a different question. snapToGrid(40) at grid 160 is 40:
         a whole divisor, offered deliberately so that shrinking is expressible.
         sizeCensus does not accept 40, so a Fit built on snapToGrid would
         return the size it was given, report success, and leave the shelf
         still calling the trait off the grid. */
      const r = await fit(page, { size: 40, mode: 'canvas', grid: 160 });
      expect(r.out, 'one whole cell, not the divisor').toBe('160x160');
      expect(r.census, 'which is what the warning wanted').toBe(0);
    });

  test('and the same trait through snapToGrid really does stay at 40',
    async ({ page }) => {
      /* THE POSITIVE CONTROL for the test above: it only means something if
         snapToGrid genuinely answers 40 here. If it ever starts answering 160
         the distinction has gone and that test passes for the wrong reason. */
      const r = await page.evaluate(() => {
        projectGrid = 160;
        return { snap: snapToGrid(40), fit: gridFit(40) };
      });
      expect(r.snap, 'a whole divisor of the cell').toBe(40);
      expect(r.fit, 'a whole multiple of it').toBe(160);
    });

  test('padding never crops, so a canvas just over a cell grows to the next',
    async ({ page }) => {
      /* 1290 rounds DOWN to 1280 by the nearest rule, and the artwork here is
         nowhere near the edge, so nothing is lost - which is the honest
         outcome and is what the toast reports. The claim being pinned is that
         the message tells the truth about it either way. */
      const r = await fit(page, { size: 1290, mode: 'canvas', grid: 160 });
      expect(r.out).toBe('1280x1280');
      expect(r.nowOpaque, 'the art was far from the edge').toBe(r.wasOpaque);
      expect(r.said, 'nothing was cut, so nothing is claimed')
        .not.toContain('fell outside');
    });

  test('and says so when a crop really would lose artwork', async ({ page }) => {
    /* The other half of the pair. Art painted to the very edge of a 1290
       canvas loses a rim when it becomes 1280, and the existing crop wording
       is what says so - reused rather than restated. */
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      projectGrid = 160;
      const w = 1290, h = 1290;
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) { d[i * 4 + 1] = 200; d[i * 4 + 3] = 255; }
      fileName = 'probe';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
      await new Promise(r2 => setTimeout(r2, 250));
      setChip('rsmode', 'canvas');
      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(m); };
      try {
        document.getElementById('rsfit').click();
        await new Promise(r2 => setTimeout(r2, 400));
      } finally { window.toast = realToast; }
      return { out: art.width + 'x' + art.height, said: said.join(' | ') };
    });
    expect(r.out).toBe('1280x1280');
    expect(r.said, 'it names what it cost').toContain('fell outside');
    expect(r.said, 'and that it can be taken back').toContain('Undo');
  });

  test('with Snap on the note already points at the size it should be',
    async ({ page }) => {
      /* THE STATE THAT WAS ALREADY HANDLED, pinned first so the addition below
         is not credited with work that was already done. Snap is on by
         default, the boxes are pre-filled with the canvas size, and the note
         says what snapping would do to it. */
      const r = await note(page, { size: 1254, snap: true });
      expect(r.text).toContain('1280');
      expect(r.text, 'and why the number moved').toContain('snap moved');
    });

  test('and with Snap off it still says the canvas does not fit',
    async ({ page }) => {
      /* THE GAP. With snapping off there is nothing pending, so the note went
         silent - in exactly the state where the panel is open, the canvas is
         wrong, and the button that repairs it is two rows down unlabelled by
         anything on screen. */
      const r = await note(page, { size: 1254, snap: false });
      expect(r.text, 'the size it is').toContain('1254');
      expect(r.text, 'and that it does not fit').toContain('not on the 160 cell grid');
      expect(r.title, 'with the repair named on hover').toContain('Fit to grid');
    });

  test('and stays quiet about a canvas that does fit', async ({ page }) => {
    /* A CONTROL, and it has to be run with snapping in BOTH states or it only
       proves the quiet branch is quiet. This note is on screen the whole time
       the panel is open, so a false line here is read constantly. */
    for (const snap of [true, false]) {
      const r = await note(page, { size: 1280, snap });
      expect(r.snapOn, 'the toggle really is where the test wants it').toBe(snap);
      expect(r.text, 'the size and nothing else, snap ' + snap).toBe('1280 × 1280');
      expect(r.title).toBe('');
    }
  });

  test('Trait mode pads rather than resampling art nobody asked it to touch',
    async ({ page }) => {
      /* Trait mode resizes the artwork inside a canvas it never moves, so it
         has no answer to "fit the canvas". Falling to the lossless reading is
         the choice: a press that silently resampled somebody's art because a
         chip they had forgotten was set is the worse failure of the two. */
      const r = await fit(page, { size: 1254, mode: 'inside', grid: 160 });
      expect(r.out).toBe('1280x1280');
      expect(r.nowOpaque, 'no pixel touched').toBe(r.wasOpaque);
      expect(r.said).toContain('Padded');
    });
});
