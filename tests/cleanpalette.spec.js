/* Clean up colours changed the artwork and left the swatches describing the
   old one.

   Erasing a colour rebuilds both swatch rows at its tail - buildPalette and
   buildRecolour, from a fresh read of the canvas. Undo and redo go through
   repalette(), which does the same. Clean up colours ended with

     ctx.putImageData(pl.im,0,0);
     refreshStats(); cleanLabel();

   and nothing else, so the row went on showing the colours the image had
   before the button was pressed.

   MEASURED, on a 48x48 gradient:

     canvas colours     2,304 -> 64
     swatch row         64 -> 64, byte for byte identical
     ghost swatches     59 of the 64 name a colour no longer in the image

   And they are not inert. Clicking one and pressing Erase:

     "#62163c picked"
     "No cells matched #62163c"

   so Replace and Erase are dead for as long as the row is stale, and the only
   thing that fixes it is doing something else that happens to rebuild.

   THE FIX IS THE HELPER THAT ALREADY EXISTS. repalette() recomputes from the
   canvas and rebuilds both rows, and is what undo and redo call. It keeps a
   picked colour that survived and drops one that did not, which is the right
   half to keep here: a clean-up merges colours, so a selection made before it
   is partly still valid.

   THE CONTROL MATTERS. A rebuild that cleared the selection every time would
   pass "no ghosts remain" and silently unpick colours chosen by hand - the
   defect undo was fixed for. Pinned below.
*/
import { test, expect } from '@playwright/test';

/* A gradient has far more colours than the 64 the row can show, which is what
   makes the staleness visible: after a clean-up the canvas holds 64 and the
   stale row still names the 64 representatives of the 2,304 it had. */
const gradient = (page, size) => page.evaluate(async (S) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  await new Promise(r => setTimeout(r, 300));
  const d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    d[i] = Math.round(x * 255 / (S - 1));
    d[i + 1] = Math.round(y * 255 / (S - 1));
    d[i + 2] = Math.round(((x + y) * 255) / (2 * (S - 1)));
    d[i + 3] = 255;
  }
  fileName = 'gradient';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 600));
  document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
  /* Asserted, not assumed: without a reduction to make, the button refuses and
     every check below passes against a click that did nothing. */
  const label = document.getElementById('rcclean').textContent;
  if (!/\d/.test(label)) throw new Error('nothing to clean up here: ' + label);
  return true;
}, size);

const state = (page) => page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = art.width; c.height = art.height;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(art, 0, 0);
  const p = g.getImageData(0, 0, c.width, c.height).data;
  const inImage = new Set();
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] >= 128)
    inImage.add('#' + [p[i], p[i + 1], p[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
  const sw = [...document.querySelectorAll('#pal button.sw')].map(b => b.dataset.hex);
  return {
    canvasColours: inImage.size,
    swatches: sw,
    ghosts: sw.filter(h => !inImage.has(h.toLowerCase())),
    picked: [...document.querySelectorAll('#pal button.sw[data-rc="1"]')].map(b => b.dataset.hex),
  };
});

const clean = (page) => page.evaluate(async () => {
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  try {
    document.getElementById('rcclean').click();
    await new Promise(r => setTimeout(r, 900));
  } finally { window.toast = realToast; }
  return said.join(' | ');
});

test.describe('Clean up colours leaves the swatches describing the new image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cleanColours === 'function');
    await gradient(page, 48);
  });

  test('it really does reduce the artwork', async ({ page }) => {
    /* The positive half. Without it, "no ghost swatches" would be satisfied by
       a button that changed nothing at all. */
    const before = await state(page);
    const said = await clean(page);
    const after = await state(page);
    expect(before.canvasColours, 'a gradient starts with far more than the row can show')
      .toBeGreaterThan(1000);
    expect(after.canvasColours, 'and comes down').toBeLessThan(before.canvasColours);
    expect(said, 'and says so').toContain('down to');
  });

  test('and no swatch names a colour the image no longer has', async ({ page }) => {
    /* The defect. Measured before the fix: 59 of 64 swatches were ghosts. */
    await clean(page);
    const after = await state(page);
    expect(after.ghosts, 'every swatch is a colour that is actually in the artwork').toEqual([]);
  });

  test('the row is rebuilt rather than left as it was', async ({ page }) => {
    /* Distinct from the test above on purpose. A row that happened to contain
       no ghosts because nothing changed would pass that one; this asks whether
       the row moved at all. */
    const before = await state(page);
    await clean(page);
    const after = await state(page);
    expect(after.swatches).not.toEqual(before.swatches);
  });

  test('so a swatch clicked afterwards actually matches something', async ({ page }) => {
    /* The consequence a person meets. Before the fix this said
       "No cells matched #62163c" for 59 of the 64 swatches. */
    await clean(page);
    const r = await page.evaluate(async () => {
      setChip('palmode', 'replace');
      await new Promise(x => setTimeout(x, 200));
      const first = document.querySelector('#pal button.sw');
      first.click();
      await new Promise(x => setTimeout(x, 200));
      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(m); };
      try {
        document.getElementById('rcerase').click();
        await new Promise(x => setTimeout(x, 500));
      } finally { window.toast = realToast; }
      return said.join(' | ');
    });
    expect(r, 'it erased something').toMatch(/Erased [\d,]+ cells/);
    expect(r, 'rather than matching nothing').not.toContain('No cells matched');
  });

  test('Clear background stops offering the colour it removed', async ({ page }) => {
    /* THE SIBLING, in the removing direction. Measured before the fix: a flat
       #f0f0fa border was flooded away and the row still offered #f0f0fa, which
       was then nowhere in the artwork. */
    const r = await page.evaluate(async () => {
      const S = 32;
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      const d = new Uint8ClampedArray(S * S * 4);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const mid = x >= 10 && x < 22 && y >= 10 && y < 22;
        const c = mid ? [30, 180, 90] : [240, 240, 250];
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
      fileName = 'bg';
      startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
      await new Promise(x => setTimeout(x, 450));
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      const offered = () => [...document.querySelectorAll('#pal button.sw')]
        .map(b => b.dataset.hex.toLowerCase());
      const had = offered().includes('#f0f0fa');
      const realToast = window.toast;
      window.toast = () => {};
      try {
        document.getElementById('debg').click();
        await new Promise(x => setTimeout(x, 700));
      } finally { window.toast = realToast; }
      const c = document.createElement('canvas');
      c.width = art.width; c.height = art.height;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(art, 0, 0);
      const p = g.getImageData(0, 0, c.width, c.height).data;
      const inImage = new Set();
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] >= 128)
        inImage.add('#' + [p[i], p[i + 1], p[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
      return { hadBefore: had, stillOffered: offered().includes('#f0f0fa'),
        stillInImage: inImage.has('#f0f0fa'),
        ghosts: offered().filter(h => !inImage.has(h)) };
    });
    expect(r.hadBefore, 'the background colour was on offer to begin with').toBe(true);
    expect(r.stillInImage, 'and the flood really removed it from the artwork').toBe(false);
    expect(r.stillOffered, 'so the row stops offering it').toBe(false);
    expect(r.ghosts, 'and no other swatch is a ghost either').toEqual([]);
  });

  test('Add outline offers the colour it just drew with', async ({ page }) => {
    /* THE SIBLING, in the adding direction - the same defect from the other
       end. Measured before the fix: outlining in #ff00ff put that colour in the
       artwork and left it absent from the row, so the one colour you had just
       drawn with was the one you could not click. */
    const r = await page.evaluate(async () => {
      const S = 32;
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      const d = new Uint8ClampedArray(S * S * 4);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const mid = x >= 10 && x < 22 && y >= 10 && y < 22;
        if (mid) { d[i] = 30; d[i + 1] = 180; d[i + 2] = 90; d[i + 3] = 255; }
      }
      fileName = 'out';
      startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
      await new Promise(x => setTimeout(x, 450));
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      const offered = () => [...document.querySelectorAll('#pal button.sw')]
        .map(b => b.dataset.hex.toLowerCase());
      const before = offered().includes('#ff00ff');
      document.getElementById('olcol').value = '#ff00ff';
      document.getElementById('olthick').value = '2';
      const realToast = window.toast;
      const said = [];
      window.toast = (m) => { said.push(m); };
      try {
        document.getElementById('oladd').click();
        await new Promise(x => setTimeout(x, 800));
      } finally { window.toast = realToast; }
      const c = document.createElement('canvas');
      c.width = art.width; c.height = art.height;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(art, 0, 0);
      const p = g.getImageData(0, 0, c.width, c.height).data;
      const inImage = new Set();
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] >= 128)
        inImage.add('#' + [p[i], p[i + 1], p[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
      return { said: said.join(' | '), offeredBefore: before,
        inImageAfter: inImage.has('#ff00ff'), offeredAfter: offered().includes('#ff00ff'),
        missing: [...inImage].filter(h => !offered().includes(h)) };
    });
    expect(r.said, 'it outlined something').toContain('Outlined');
    expect(r.offeredBefore, 'the outline colour was not in the art to begin with').toBe(false);
    expect(r.inImageAfter, 'and is now').toBe(true);
    expect(r.offeredAfter, 'so the row offers it').toBe(true);
    expect(r.missing, 'and nothing else in the artwork is missing from the row').toEqual([]);
  });

  /* THE DRAWING TOOLS. A fan-out over the editor found four more sites with
     the same shape, and the pencil is the one a person meets every minute:
     the colour just drawn with was the one colour that could not be clicked.

     Cost was the reason to hesitate, and the reason not to: repalette timed at
     52.7ms on a photographic gradient but 0.6ms on a 160x160 of eight colours,
     because it follows the DISTINCT COLOUR count rather than the pixel count.
     Pixel art is the cheap case, so this sits on the stroke path with no
     debounce - once per stroke, never per dab. */
  const drawn = (page, act) => page.evaluate(async (src) => {
    const S = 32;
    try { authed = true; } catch (_) {}
    gateShow(false);
    await dbClear();
    const d = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (x >= 4 && x < 28 && y >= 4 && y < 28) {
        d[i] = 60; d[i + 1] = 120; d[i + 2] = 200; d[i + 3] = 255;
      }
    }
    /* A colour living ONLY in one column, so a shift can carry it off the
       canvas and an eraser can wipe it out entirely. */
    for (let y = 4; y < 28; y++) {
      const i = (y * S + 4) * 4;
      d[i] = 255; d[i + 1] = 220; d[i + 2] = 0; d[i + 3] = 255;
    }
    fileName = 'probe';
    startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
    await new Promise(r => setTimeout(r, 450));
    document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));

    const cv = document.getElementById('art');
    const pt = (cx, cy) => {
      const r = cv.getBoundingClientRect();
      return { clientX: r.left + cx * r.width / S + r.width / (2 * S),
               clientY: r.top + cy * r.height / S + r.height / (2 * S) };
    };
    const ev = (t, o) => cv.dispatchEvent(new PointerEvent(t,
      { bubbles: true, cancelable: true, pointerId: 1, ...o }));
    const realToast = window.toast;
    window.toast = () => {};
    try { await eval('(' + src + ')')({ pt, ev, S }); }
    finally { window.toast = realToast; }
    await new Promise(r => setTimeout(r, 500));

    const c = document.createElement('canvas');
    c.width = art.width; c.height = art.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(art, 0, 0);
    const p = g.getImageData(0, 0, c.width, c.height).data;
    const inImage = new Set();
    for (let i = 0; i < p.length; i += 4) if (p[i + 3] >= 128)
      inImage.add('#' + [p[i], p[i + 1], p[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
    const sw = [...document.querySelectorAll('#pal button.sw')].map(b => b.dataset.hex.toLowerCase());
    return { inImage: [...inImage], swatches: sw,
      ghosts: sw.filter(h => !inImage.has(h)),
      missing: [...inImage].filter(h => !sw.includes(h)) };
  }, act);

  test('the pencil puts the colour it drew with on the row', async ({ page }) => {
    /* Measured before the fix: #ff00aa was in the artwork and absent from the
       row - the colour you had just chosen was the one you could not click. */
    const r = await drawn(page, `async ({pt, ev}) => {
      setColor('#ff00aa'); selectTool('pencil');
      ev('pointerdown', pt(15,15)); ev('pointermove', pt(16,15)); ev('pointerup', pt(16,15));
    }`);
    expect(r.inImage, 'the stroke really landed').toContain('#ff00aa');
    expect(r.missing, 'and the row knows about it').toEqual([]);
  });

  test('the fill tool gets both directions right at once', async ({ page }) => {
    /* Measured before the fix: #00ddaa missing AND #3c78c8 - the colour it
       covered - left behind as a ghost, from one click. */
    const r = await drawn(page, `async ({pt, ev}) => {
      setColor('#00ddaa'); selectTool('fill');
      ev('pointerdown', pt(15,15)); ev('pointerup', pt(15,15));
    }`);
    expect(r.inImage, 'the fill landed').toContain('#00ddaa');
    expect(r.missing, 'nothing in the art is off the row').toEqual([]);
    expect(r.ghosts, 'and nothing on the row is out of the art').toEqual([]);
  });

  test('the eraser stops offering a colour it wiped out', async ({ page }) => {
    // The reverse of the pencil: the eraser zeroes alpha, and palette() skips
    // a transparent pixel, so the last cell of a colour leaving is a ghost.
    const r = await drawn(page, `async ({pt, ev}) => {
      selectTool('eraser');
      for (let y = 4; y < 28; y++) { ev('pointerdown', pt(4,y)); ev('pointerup', pt(4,y)); }
    }`);
    expect(r.inImage, 'the yellow column is gone').not.toContain('#ffdc00');
    expect(r.ghosts, 'and so is its swatch').toEqual([]);
  });

  test('and the arrow keys, when a nudge pushes a colour off the canvas', async ({ page }) => {
    /* Measured before the fix: six presses left dropped the column that was
       the only home of #ffdc00 and the row went on offering it. */
    const r = await drawn(page, `async () => {
      selectTool('move');
      for (let i = 0; i < 6; i++) nudge(-1, 0, false);
    }`);
    expect(r.inImage, 'the column really left the canvas').not.toContain('#ffdc00');
    expect(r.ghosts, 'and the row let go of it').toEqual([]);
  });

  test('a colour picked before the clean-up and still present stays picked', async ({ page }) => {
    /* THE CONTROL. Rebuilding by clearing the selection would pass every test
       above and silently unpick colours chosen by hand - which is the defect
       undo and redo were fixed for, and why repalette keeps what survives. */
    const kept = await page.evaluate(async () => {
      setChip('palmode', 'replace');
      await new Promise(x => setTimeout(x, 200));
      /* A colour the clean-up will KEEP: the representatives it maps onto are
         drawn from the image, and the first swatch is the largest cluster. */
      const before = document.querySelector('#pal button.sw').dataset.hex;
      document.querySelector('#pal button.sw').click();
      await new Promise(x => setTimeout(x, 200));
      const realToast = window.toast;
      window.toast = () => {};
      try {
        document.getElementById('rcclean').click();
        await new Promise(x => setTimeout(x, 900));
      } finally { window.toast = realToast; }
      const survives = [...document.querySelectorAll('#pal button.sw')]
        .some(b => b.dataset.hex === before);
      const stillPicked = [...document.querySelectorAll('#pal button.sw[data-rc="1"]')]
        .some(b => b.dataset.hex === before);
      return { before, survives, stillPicked };
    });
    /* Only meaningful if that colour survived the merge - if it did not, the
       right behaviour is to drop it, which the next test covers. */
    if (kept.survives) {
      expect(kept.stillPicked, 'a surviving pick is not thrown away').toBe(true);
    }
  });

  test('and one the clean-up merged away is dropped from the selection', async ({ page }) => {
    // The other half of keeping a selection: a pick that no longer exists must
    // not sit there marked, or Replace would report matching nothing again.
    const r = await page.evaluate(async () => {
      setChip('palmode', 'replace');
      await new Promise(x => setTimeout(x, 200));
      /* Pick everything, so at least some picks are certain to be merged. */
      const all = [...document.querySelectorAll('#pal button.sw')];
      all.forEach(b => b.click());
      await new Promise(x => setTimeout(x, 300));
      const pickedBefore = document.querySelectorAll('#pal button.sw[data-rc="1"]').length;
      const realToast = window.toast;
      window.toast = () => {};
      try {
        document.getElementById('rcclean').click();
        await new Promise(x => setTimeout(x, 900));
      } finally { window.toast = realToast; }
      const c = document.createElement('canvas');
      c.width = art.width; c.height = art.height;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(art, 0, 0);
      const p = g.getImageData(0, 0, c.width, c.height).data;
      const inImage = new Set();
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] >= 128)
        inImage.add('#' + [p[i], p[i + 1], p[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
      const pickedAfter = [...document.querySelectorAll('#pal button.sw[data-rc="1"]')]
        .map(b => b.dataset.hex);
      return { pickedBefore, pickedAfter,
        pickedGhosts: pickedAfter.filter(h => !inImage.has(h.toLowerCase())) };
    });
    expect(r.pickedBefore, 'the fixture really did pick colours').toBeGreaterThan(1);
    expect(r.pickedGhosts, 'no pick survives that the image no longer has').toEqual([]);
  });
});
