/* A TURN KEEPS THE TRAIT ON ITS OWN CANVAS.

   "I should be able to rotate the art with the move button too, atm it
   doesnt work"

   The handle was never missing. Measured at six viewport and canvas sizes,
   including a 1280 trait at 390x844, the round handle was on screen, answered
   elementFromPoint and turned the art every time. What was wrong is that a
   free turn GREW the canvas - 37 degrees took a 64x64 to 90x90, which on a
   1280 trait is 1810 - and every trait here is lined up against a base at a
   fixed size, so the turned trait no longer fitted the character.

   The growth is not a defect: it is what the ported algorithm produces, and
   rotation.spec.js pins it with arrays worked out by hand. What changed is
   what the editor asks for, and it is one chip that the Turn button, the
   canvas handle and PB.rotate all read - the file already records that those
   three must not disagree about what a turn is.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* A square of paint in the middle, with room around it - the ordinary shape
   of a trait, which is under half its canvas. */
const BLOCK = (set, W, H) => {
  for (let y = H / 4; y < H * 3 / 4; y++)
    for (let x = W / 4; x < W * 3 / 4; x++) set(x, y, [242, 166, 90]);
};
/* Paint to every edge, so a turn MUST cut something. */
const FULL = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [242, 166, 90]);
};

const size = page => page.evaluate(() => art.width + 'x' + art.height);

test('A FREE TURN LEAVES THE TRAIT THE SIZE IT WAS', async ({ page }) => {
  await openTrait(page, { w: 64, h: 64, draw: BLOCK });
  const r = await page.evaluate(() => ({
    chip: chipVal('turncan'),
    res: PB.rotate(37),
  }));
  /* Keep is the default, which is the whole point: a trait that changes size
     stops lining up on the character, and nobody asked for that. */
  expect(r.chip, 'keeping the canvas is what a trait wants').toBe('keep');
  expect(r.res.canvas).toBe('keep');
  expect(r.res.turned).toBe(true);
  expect(await size(page), 'the same canvas it was drawn on').toBe('64x64');
});

test('and Grow still does what the turn itself produces', async ({ page }) => {
  await openTrait(page, { w: 64, h: 64, draw: BLOCK });
  const r = await page.evaluate(() => PB.rotate(37, undefined, 'grow'));
  /* THE CONTROL. Without this, "it keeps the size" would also pass on a
     version that had simply stopped turning anything. ceil(64cos37 +
     64sin37) = ceil(51.1 + 38.5) = 90. */
  expect(r.canvas).toBe('grow');
  expect(await size(page), 'ceil(|W cos| + |H sin|)').toBe('90x90');
  expect(await page.evaluate(() => chipVal('turncan')),
    'and the panel shows the choice that was made').toBe('grow');
});

test('THE PIXELS ARE THE SAME PIXELS, only put down on a smaller canvas',
  async ({ page }) => {
    await openTrait(page, { w: 64, h: 64, draw: BLOCK });
    const r = await page.evaluate(async () => {
      /* Grown first, cropped to the middle 64 by hand. */
      PB.rotate(37, 'nearest', 'grow');
      const g = art.width;
      const off = Math.floor(g / 2) - 32;
      const grown = ctx.getImageData(off, off, 64, 64).data;
      $('undo').click();
      await new Promise(x => setTimeout(x, 200));
      PB.rotate(37, 'nearest', 'keep');
      const kept = ctx.getImageData(0, 0, 64, 64).data;
      let same = 0, diff = 0;
      for (let i = 0; i < kept.length; i += 4) {
        if (kept[i] === grown[i] && kept[i + 1] === grown[i + 1]
          && kept[i + 2] === grown[i + 2] && kept[i + 3] === grown[i + 3]) same++;
        else diff++;
      }
      return { g, off, same, diff };
    });
    /* THE CLAIM THAT MATTERS. Keeping the canvas must not be a different
       turn - the sampler runs at its natural size either way and only the
       canvas the result lands on differs. recanvas centres by
       floor(new/2)-floor(old/2), which is the same offset taken here, so the
       two are the same picture pixel for pixel. */
    expect(r.g, 'the grown one really did grow').toBe(90);
    expect(r.diff, 'every pixel identical to the middle of the grown turn').toBe(0);
    expect(r.same).toBe(64 * 64);
  });

test('and it says how much it cut, when it cuts', async ({ page }) => {
  await openTrait(page, { w: 64, h: 64, draw: FULL });
  const said = await page.evaluate(async () => {
    let msg = '';
    const real = window.toast;
    window.toast = (m) => { msg = String(m); };
    try { PB.rotate(37, 'nearest', 'keep'); } finally { window.toast = real; }
    let ink = 0;
    const d = ctx.getImageData(0, 0, art.width, art.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) ink++;
    return { msg, ink };
  });
  /* Paint to every edge and a turn HAS to lose corners. That is the cost of
     keeping the size, so it is said with the number rather than discovered
     later on a trait that is quietly missing its corners. */
  expect(said.msg).toContain('still 64 by 64');
  expect(said.msg).toContain('turned off the canvas');
  expect(said.ink, 'and it really did lose some').toBeLessThan(64 * 64);
});

test('and the ordinary trait loses nothing at all - the control', async ({ page }) => {
  await openTrait(page, { w: 64, h: 64, draw: BLOCK });
  const said = await page.evaluate(() => {
    let msg = '';
    const real = window.toast;
    window.toast = (m) => { msg = String(m); };
    try { PB.rotate(37, 'nearest', 'keep'); } finally { window.toast = real; }
    return msg;
  });
  /* A trait is under half its canvas, so keeping the size normally costs
     nothing - and if this said "turned off the canvas" the message above
     would be noise nobody would read. */
  expect(said).toContain('still 64 by 64');
  expect(said).not.toContain('turned off the canvas');
});

test('a quarter turn is untouched by any of this', async ({ page }) => {
  await openTrait(page, { w: 64, h: 32, draw: BLOCK });
  const r = await page.evaluate(() => ({
    keep: PB.rotate(90, 'nearest', 'keep'),
    size: art.width + 'x' + art.height,
  }));
  /* A quarter turn swaps width and height, and that swap IS the turn - there
     is nothing to keep. rotateFree routes 90, 180 and 270 away before the
     canvas rule is read, and this is what says so. */
  expect(r.keep.turned).toBe(true);
  expect(r.size, 'the swap is the turn').toBe('32x64');
});

test('ONE UNDO TAKES IT BACK, bytes and size', async ({ page }) => {
  await openTrait(page, { w: 64, h: 64, draw: BLOCK });
  const r = await page.evaluate(async () => {
    const before = Array.from(ctx.getImageData(0, 0, 64, 64).data).join();
    PB.rotate(37, 'nearest', 'keep');
    const turned = Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join();
    $('undo').click();
    await new Promise(x => setTimeout(x, 200));
    return { before, turned,
      after: Array.from(ctx.getImageData(0, 0, art.width, art.height).data).join(),
      size: art.width + 'x' + art.height };
  });
  /* Putting the art back on its own canvas happens BEFORE the snapshot, so
     it is part of the one step rather than a second one somebody has to
     press undo twice to escape. */
  expect(r.turned).not.toBe(r.before);
  expect(r.after).toBe(r.before);
  expect(r.size).toBe('64x64');
});

test('THE HANDLE IS BIG ENOUGH TO GRAB', async ({ page }) => {
  await openTrait(page, { w: 64, h: 64, draw: BLOCK });
  const r = await page.evaluate(() => {
    selectTool('move');
    fitZoom();
    const rot = document.querySelector('#tbox .trot');
    const one = document.querySelector('#tbox .th[data-h="se"]');
    const b = rot.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(b.left + b.width / 2),
      Math.round(b.top + b.height / 2));
    return { w: Math.round(b.width), h: Math.round(b.height),
      resize: Math.round(one.getBoundingClientRect().width),
      reachable: !!(hit && hit.classList.contains('trot')) };
  });
  /* 13px, floating 36px above the art on a 1px line with nothing around it,
     is under the 22px floor this project holds panel controls to - canvas
     handles are not in what paneldensity scans, so it escaped the rule
     rather than being exempted from it. */
  expect(r.w, 'clears the 22px floor').toBeGreaterThanOrEqual(22);
  expect(r.h).toBeGreaterThanOrEqual(22);
  /* AND ONLY THIS ONE. The resize handles sit on the corners of the art and
     are found by the corner; growing them all would cover the artwork. */
  expect(r.resize, 'the resize handles are left alone').toBe(13);
  expect(r.reachable, 'and it is what answers at its own centre').toBe(true);
});
