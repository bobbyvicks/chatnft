/* Canvas mode said "the art is untouched" and could throw three quarters of it
   away in silence.

   The resize panel has three modes. Canvas pads or crops rather than
   rescaling, and its tooltip read "Pad or crop the canvas - the art is
   untouched". True in one direction: padding really does leave every pixel
   where it was. Cropping is the other half of what the mode is for, and it
   removes whatever falls outside.

   MEASURED. A 32x32 canvas with artwork filling all of it, cropped to 16x16:

     opaque pixels before   1024
     opaque pixels after     256
     lost                    768
     said                   "Canvas is now 16 by 16"

   IT IS NOT REFUSED AND NOT ASKED ABOUT. Cropping is half the point of the
   mode, and applyResize takes a snapshot before it acts - measured, Ctrl+Z
   brings back the 32x32 canvas with all 1024 pixels. A dialog on a reversible
   action somebody asked for would be worse than the silence. What was wrong is
   the sentence and the silence, and both are fixed here.

   THE COUNT IS ON ALPHA AND SCOPED TO ONE MODE, which is what keeps it from
   becoming a new false alarm: tidying empty margin off a canvas loses nothing
   and must say nothing, and Art mode resamples on purpose and would otherwise
   report its own job as a loss on every use. Both are controls below.
*/
import { test, expect } from '@playwright/test';

/* Opens a `size`-square trait whose artwork covers `fill` square of it, then
   resizes to `to` in `mode`. */
const resize = (page, opts) => page.evaluate(async (o) => {
  const { size, fill, to, mode, undo } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  projectGrid = 160;
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));

  const d = new Uint8ClampedArray(size * size * 4);
  /* Every pixel distinct, so a shift of one row or a resample shows up as
     surely as a loss does. Opaque only inside the `fill` square, centred. */
  const lo = Math.floor((size - fill) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const inside = x >= lo && x < lo + fill && y >= lo && y < lo + fill;
    d[i] = (x * 7) % 256; d[i + 1] = (y * 11) % 256; d[i + 2] = (x + y) % 256;
    d[i + 3] = inside ? 255 : 0;
  }
  fileName = 'probe';
  startEditor(d, size, size, size, size, palette(d, size * size, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));
  document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));

  /* `art` is a CANVAS, not ImageData - traitCanvas draws it and reads back. */
  const pix = () => {
    const c = document.createElement('canvas');
    c.width = art.width; c.height = art.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(art, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const opaque = (p) => { let n = 0; for (let i = 3; i < p.length; i += 4) if (p[i] > 0) n++; return n; };
  const beforePix = Array.from(pix());
  const before = { size: art.width + 'x' + art.height, opaque: opaque(beforePix) };

  setChip('rsmode', mode);
  document.getElementById('rsw').value = String(to);
  document.getElementById('rsh').value = String(to);
  document.getElementById('rsw').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  document.getElementById('rsgo').click();
  await new Promise(r => setTimeout(r, 600));
  window.toast = realToast;

  const after = { size: art.width + 'x' + art.height, opaque: opaque(pix()) };
  /* Where the original block of artwork ended up, if it survived whole. */
  let foundAt = null;
  if (art.width >= Math.sqrt(beforePix.length / 4)) {
    const s0 = Math.round(Math.sqrt(beforePix.length / 4));
    const p = pix(), W = art.width;
    /* A named function with an early return, not a labelled continue. The
       first draft labelled the OY loop and did `continue outer` on a mismatch,
       which skips the rest of the ROW - so only column 0 was ever tested and
       the block at 8,8 was never looked at. It reported "not found" over an
       image that was perfectly intact. */
    const matchesAt = (ox, oy) => {
      for (let y = 0; y < s0; y++) for (let x = 0; x < s0; x++) {
        const a = ((y + oy) * W + (x + ox)) * 4, b = (y * s0 + x) * 4;
        for (let k = 0; k < 4; k++) if (p[a + k] !== beforePix[b + k]) return false;
      }
      return true;
    };
    for (let oy = 0; oy <= art.height - s0 && foundAt === null; oy++)
      for (let ox = 0; ox <= W - s0; ox++)
        if (matchesAt(ox, oy)) { foundAt = ox + ',' + oy; break; }
  }
  let undone = null;
  if (undo) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    undone = { size: art.width + 'x' + art.height, opaque: opaque(pix()) };
  }
  return { before, after, said: said.join(' | '), foundAt, undone,
    title: [...document.querySelectorAll('#rsmode button')]
      .find(b => b.dataset.v === 'canvas').title };
}, opts);

test.describe('what Canvas mode does to the artwork', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof applyResize === 'function');
  });

  test('padding leaves every pixel exactly where it was', async ({ page }) => {
    /* The true half of the old claim, pinned so that fixing the false half
       cannot quietly cost it. */
    const r = await resize(page, { size: 16, fill: 16, to: 32, mode: 'canvas' });
    expect(r.after.size).toBe('32x32');
    expect(r.foundAt, 'the whole original block, byte for byte').toBe('8,8');
    expect(r.after.opaque, 'and nothing gained or lost').toBe(r.before.opaque);
  });

  test('and says nothing about a loss, because there was none', async ({ page }) => {
    const r = await resize(page, { size: 16, fill: 16, to: 32, mode: 'canvas' });
    expect(r.said).toBe('Canvas is now 32 by 32');
  });

  test('cropping through artwork says how much fell outside', async ({ page }) => {
    const r = await resize(page, { size: 32, fill: 32, to: 16, mode: 'canvas' });
    expect(r.before.opaque).toBe(1024);
    expect(r.after.opaque).toBe(256);
    expect(r.said, 'the count').toContain('768 pixels of artwork fell outside it');
  });

  test('and it can be undone, exactly as the message promises', async ({ page }) => {
    /* The message tells somebody Undo puts them back, which is a claim about
       the app and not a reassurance. */
    const r = await resize(page, { size: 32, fill: 32, to: 16, mode: 'canvas', undo: true });
    expect(r.said).toContain('Undo puts them back');
    expect(r.undone.size, 'the canvas is back').toBe('32x32');
    expect(r.undone.opaque, 'and so is every pixel').toBe(1024);
  });

  test('cropping through empty margin stays silent', async ({ page }) => {
    /* A CONTROL. Tidying the empty edge off a canvas is the ordinary use of
       this mode, and a warning on it would be read past by the time it met one
       that mattered. */
    const r = await resize(page, { size: 32, fill: 8, to: 16, mode: 'canvas' });
    expect(r.before.opaque, 'the art is well inside the crop').toBe(64);
    expect(r.after.opaque, 'and all of it survives').toBe(64);
    expect(r.said).toBe('Canvas is now 16 by 16');
  });

  test('Art mode does not report its own resampling as a loss', async ({ page }) => {
    /* THE OTHER CONTROL. Art mode scales on purpose, so an unscoped count
       would call every use of it a loss of artwork. */
    const r = await resize(page, { size: 32, fill: 32, to: 16, mode: 'art' });
    expect(r.after.size).toBe('16x16');
    expect(r.said, 'it says what it did').toContain('Resized to 16 by 16');
    expect(r.said, 'and nothing about anything falling outside')
      .not.toContain('fell outside');
  });

  test('and so does dragging the box smaller, which is the other path', async ({ page }) => {
    /* THE SIBLING. applyResize is behind the Resize button; resizeTo is behind
       the transform box's drag handles, and its own comment calls itself
       "shared by the Resize button and the drag handles" - which it is not,
       because the button has its own copy of the same six lines. The fix went
       to one of them first and was nearly committed that way.

       Driven through real pointer events on the `se` handle rather than by
       calling resizeTo, because what was missing was the CALLER saying it. */
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      projectGrid = 160;
      await renderShelf();
      await new Promise(x => setTimeout(x, 300));
      const s = 32;
      const d = new Uint8ClampedArray(s * s * 4);
      for (let i = 0; i < s * s; i++) { d[i * 4] = 200; d[i * 4 + 3] = 255; }
      fileName = 'full';
      startEditor(d, s, s, s, s, palette(d, s * s, 24, 64), false);
      await new Promise(x => setTimeout(x, 400));
      document.querySelectorAll('.side section').forEach(e => e.classList.remove('folded'));
      setChip('rsmode', 'canvas');

      const handle = document.querySelector('#tbox .th[data-h="se"]');
      if (!handle) throw new Error('no south-east handle to drag');
      const rect = art.getBoundingClientRect();
      /* Half the on-screen size, which at this zoom is a 32 -> 16 canvas. */
      const to = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const ev = (type, target, pt) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1,
        clientX: pt.x, clientY: pt.y }));

      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(m); };
      try {
        ev('pointerdown', handle, { x: rect.right, y: rect.bottom });
        ev('pointermove', document.getElementById('tbox'), to);
        ev('pointerup', document.getElementById('tbox'), to);
        await new Promise(x => setTimeout(x, 600));
      } finally { window.toast = realToast; }
      return { size: art.width + 'x' + art.height, said: said.join(' | ') };
    });
    expect(r.size, 'the drag really resized the canvas').toBe('16x16');
    expect(r.said, 'and it names what it cut').toContain('of artwork fell outside it');
    expect(r.said, 'in the same words the button uses').toContain('Undo puts them back');
  });

  test('the tooltip admits the crop', async ({ page }) => {
    const r = await resize(page, { size: 16, fill: 16, to: 32, mode: 'canvas' });
    expect(r.title, 'what actually makes it different from Art').toContain('never rescaled');
    expect(r.title, 'and the half it used to deny').toContain('cropped away');
    expect(r.title).not.toContain('the art is untouched');
  });
});
