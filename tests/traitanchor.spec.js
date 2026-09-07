/* Shrinking a trait dragged it into the middle of the canvas.

   Trait mode is the only resize that keeps the collection canvas and changes
   only the artwork on it, so it is the only one an EDGE trait can use - a back
   piece, a lightsaber, anything drawn hard against the frame. It scaled the
   whole canvas and handed the result to recanvas, which centres. So the
   artwork was pulled toward the middle by however much it had been shrunk.

   MEASURED on a 1280 canvas, a block 300 wide hard against the left edge at
   x0=0, shrunk to a 150-wide trait:

     mode     canvas          artwork
     art      1280 -> 640     x0 0, and the 1280 grid is gone with it
     canvas   1280 -> 640     GONE - a centred crop took the middle and
                              destroyed all 90,000 pixels
     inside   1280 -> 1280    x0 0 -> 320

   The one mode that keeps the grid moved the art 320px off the edge it was
   drawn against, and putting it back meant dragging it out past that edge,
   where what leaves is destroyed.

   THE ANCHOR IS THE ARTWORK'S OWN CENTRE, which is what scaling a selection
   does in any editor: the thing gets smaller where it is. Centring stays the
   rule for a CANVAS resize, where there is no artwork anchor to speak of and
   the pinned base and the quarter turns both centre - that is a recorded
   decision in recanvas and the controls below defend it.
*/
import { test, expect } from '@playwright/test';

/* A 1280 canvas with one opaque block at a given place, resized in a given
   mode, reported as the artwork's box before and after.

   Flat mid-grey with no chroma: a saturated fixture covering most of the
   picture is what basePlan calls a render, and startEditor would hide it
   before the test began. */
const shrink = (page, o) => page.evaluate(async (c) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  projectGrid = 160;
  const W = 1280, H = 1280;
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = c.y0; y < c.y0 + c.h; y++) for (let x = c.x0; x < c.x0 + c.w; x++) {
    const i = (y * W + x) * 4;
    d[i] = 90; d[i + 1] = 90; d[i + 2] = 90; d[i + 3] = 255;
  }
  fileName = 'probe';
  startEditor(d, W, H, W, H, palette(d, W * H, 24, 64), false);
  await new Promise(r => setTimeout(r, 250));

  const box = () => {
    const p = ctx.getImageData(0, 0, art.width, art.height).data;
    let x0 = art.width, y0 = art.height, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
      if (p[(y * art.width + x) * 4 + 3] === 0) continue;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, opaque: n };
  };
  const b0 = box();
  if (!b0) throw new Error('the fixture was gone before the resize');

  /* Through applyResize, the button's own path, rather than resizeTo beneath
     it: the sentence it produces is half of what these tests are about, and
     resizeTo does not say anything. */
  setChip('rsmode', c.mode);
  $('rsw').value = String(c.to);
  $('rsh').value = String(c.to);
  /* Snap OFF, so the number typed is the number used. Snapping is somebody
     else's test and here it would quietly turn 150 into 160. */
  if ($('rssnap').getAttribute('aria-pressed') === 'true') $('rssnap').click();
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  try {
    applyResize();
    await new Promise(r => setTimeout(r, 200));
  } finally { window.toast = realToast; }
  const b1 = box();

  /* Optionally walk it to an edge afterwards, the way a person would. */
  let moved = null;
  if (c.moveTo && b1) {
    if (c.moveTo === 'left') nudge(-b1.x0, 0);
    if (c.moveTo === 'right') nudge(art.width - b1.w - b1.x0, 0);
    if (c.moveTo === 'top') nudge(0, -b1.y0);
    if (c.moveTo === 'bottom') nudge(0, art.height - b1.h - b1.y0);
    await new Promise(r => setTimeout(r, 100));
    moved = box();
  }

  const mid = b => b && [b.x0 + b.w / 2, b.y0 + b.h / 2];
  return { canvas: art.width + "x" + art.height, said: said.join(" | "),
    before: b0, after: b1, moved,
    beforeCentre: mid(b0), afterCentre: mid(b1) };
}, o);

const LEFT = { x0: 0, y0: 500, w: 300, h: 300 };

test.describe('where a trait lands when it is resized', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof scaleInside === 'function');
  });

  test('a trait shrunk in Trait mode stays where it was drawn',
    async ({ page }) => {
      /* THE DEFECT. This block is hard against the left edge and came back
         320px in from it, which is the whole complaint: a back trait cannot be
         made smaller and left at the edge. */
      const r = await shrink(page, { ...LEFT, mode: 'inside', to: 150 });
      expect(r.canvas, 'the collection canvas is kept').toBe('1280x1280');
      expect(r.afterCentre, 'the artwork centre has not moved').toEqual(r.beforeCentre);
      expect(r.after.x0, 'and it is near the edge, not 320px off it').toBe(75);
      expect(r.after.w).toBe(150);
    });

  test('and so does one at the right edge, which the old rule moved the other way',
    async ({ page }) => {
      /* THE CONTROL THAT MAKES THE ONE ABOVE MEAN SOMETHING. "Move it left"
         would pass the left-edge test on its own. Centring pulls the right
         edge LEFT and the left edge RIGHT, so a rule that is right about both
         is a rule about the artwork rather than a nudge in one direction. */
      const r = await shrink(page, { x0: 980, y0: 500, w: 300, h: 300, mode: 'inside', to: 150 });
      expect(r.afterCentre).toEqual(r.beforeCentre);
      expect(r.after.x0, 'still hard against the right side of the frame').toBe(1055);
    });

  test('a trait already in the middle does not move at all', async ({ page }) => {
    // The case centring got right, which must stay right.
    const r = await shrink(page, { x0: 490, y0: 490, w: 300, h: 300, mode: 'inside', to: 150 });
    expect(r.afterCentre).toEqual([640, 640]);
  });

  test('and GROWING one keeps the anchor, and says what ran off the edge',
    async ({ page }) => {
      /* Shrinking is what prompted this and enlarging goes through the same
         line, so a rule written only for the shrink would leave the grow
         centring with nothing on screen saying which you had done.

         AND IT IS WHERE THE ANCHOR COSTS SOMETHING, which is why the second
         half of this test exists. The block's centre is 150px from the left
         edge, so at 600 wide it wants to span -150 to 450 and the 150 columns
         left of zero are destroyed - 22,500 of the 90,000 pixels asked for.
         That is the honest consequence of keeping it at the edge rather than
         a defect, but it was SILENT: croppedAway was computed for Canvas mode
         alone and the message read "Trait scaled to 600 by 600 on a 1280 by
         1280 canvas" over the loss. */
      const r = await shrink(page, { ...LEFT, mode: 'inside', to: 600 });
      expect(r.after.w, 'as wide as the canvas allows from that anchor').toBe(450);
      expect(r.after.x0, 'and it begins at the edge it was drawn against').toBe(0);
      expect(r.said, 'the size it became').toContain('600 by 600');
      expect(r.said, 'and what it cost').toContain('fell outside it');
      expect(r.said, 'and that it can be taken back').toContain('Undo');
    });

  test('a grow that fits says nothing about cropping', async ({ page }) => {
    /* THE CONTROL for the sentence above. A warning that fires on every grow
       is one people stop reading, and croppedAway counts alpha so a grow with
       room to spare must come back at zero. */
    const r = await shrink(page, { x0: 490, y0: 490, w: 300, h: 300, mode: 'inside', to: 600 });
    expect(r.after.w, 'the whole 600 fits').toBe(600);
    expect(r.said).toContain('600 by 600');
    expect(r.said, 'nothing was cut, so nothing is claimed').not.toContain('fell outside');
  });

  test('and an Art resize never claims its resampling was a crop', async ({ page }) => {
    /* THE OTHER CONTROL, and the reason Art is excluded rather than counted.
       Art mode shrinks the canvas with the artwork, so nothing falls off an
       edge - but the opaque count drops anyway, because that is what scaling
       down does. Counting it would put "45,000 pixels of artwork fell outside
       it" on a resize that lost nothing. */
    const r = await shrink(page, { x0: 490, y0: 490, w: 300, h: 300, mode: 'art', to: 640 });
    expect(r.after.opaque, 'the artwork really did get smaller')
      .toBeLessThan(r.before.opaque);
    expect(r.said, 'and none of that is reported as a loss').not.toContain('fell outside');
  });

  test('nothing is lost, and it can then be walked to any edge',
    async ({ page }) => {
      /* The other half of the complaint: reaching the edge has to be free.
         Every pixel is still there at the far side of the canvas from where it
         started, which is what makes the move a reposition rather than a
         crop. */
      const r = await shrink(page, { ...LEFT, mode: 'inside', to: 150, moveTo: 'right' });
      expect(r.moved.x0, 'hard against the far edge of the full grid').toBe(1130);
      expect(r.moved.opaque, 'with every pixel intact').toBe(r.after.opaque);
      expect(r.after.opaque, 'and the shrink itself lost none either').toBe(150 * 150);
    });

  test('a Canvas resize still centres, which is a recorded decision',
    async ({ page }) => {
      /* THE CONTROL FOR THE CHANGE ITSELF. recanvas centres on purpose - its
         comment records that padding from the corner leaves the art in a
         quarter of the new canvas, and that the pinned base and the quarter
         turns centre too. Only Trait mode was given a better anchor; a fix
         that moved the offset out of recanvas and changed it for everybody
         would break that, silently, and this is what says so.

         Padding rather than cropping, so the test is about WHERE the art
         lands and not about what a crop destroys. */
      const r = await shrink(page, { x0: 0, y0: 0, w: 200, h: 200, mode: 'canvas', to: 1600 });
      expect(r.canvas).toBe('1600x1600');
      expect(r.after.x0, 'centred: (1600-1280)/2 added to a box that began at 0').toBe(160);
      expect(r.after.y0).toBe(160);
    });

  test('and an empty canvas has no anchor, so it centres', async ({ page }) => {
    /* contentBox returns null with nothing painted, and scaleInside falls back
       to the centring path. Asserted rather than assumed, because a fallback
       nobody exercises is where a null walks through. */
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      const W = 400, H = 400;
      const d = new Uint8ClampedArray(W * H * 4);
      fileName = 'probe';
      startEditor(d, W, H, W, H, palette(d, W * H, 24, 64), false);
      await new Promise(r2 => setTimeout(r2, 200));
      setChip('rsmode', 'inside');
      let threw = null;
      try { resizeTo(100, 100, 'inside'); } catch (e) { threw = String(e && e.message); }
      await new Promise(r2 => setTimeout(r2, 100));
      return { threw, canvas: art.width + 'x' + art.height };
    });
    expect(r.threw, 'no crash on a blank canvas').toBe(null);
    expect(r.canvas, 'and Trait mode still never changes the canvas').toBe('400x400');
  });
});
