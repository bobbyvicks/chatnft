import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* Two faults from one incident: a 16384x16384 PNG was opened, the tab nearly
   died, and Backspace - pressed to escape it - took the page away instead of
   the image.

   The file-size check that existed, 25 MB, was never a proxy for the pixel
   count: flat pixel art compresses so well that a 16384-a-side PNG is
   comfortably under it and still decodes to width*height*4 = 1.07 GB.

   These tests use 4097 rather than 16384 on purpose. It is one pixel over the
   limit and 40,970 pixels in total, so it exercises the boundary without
   asking the test machine to allocate the gigabyte that started this. */

const flat = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 0]);
};

/* Land on the page, signed in, WITHOUT opening the editor - the drop zone is
   on the landing page and that is what these tests drive. */
const landing = async page => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof load === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) { /* older build */ }
    try { gateShow(false); } catch (_) {}
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
  });
};

/* A real PNG of the given size, handed to load() the way a drop would. */
const dropImage = (page, w, h) => page.evaluate(async ({ w, h }) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#c87800'; g.fillRect(0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], 'probe.png', { type: 'image/png' });
  load(f);
  return { fileBytes: blob.size };
}, { w, h });

test.describe('an image too big to open is refused', () => {
  test('one pixel over the limit does not open, and says why', async ({ page }) => {
    await landing(page);
    const { fileBytes } = await dropImage(page, 4097, 10);
    await expect.poll(() => page.textContent('#err'), { timeout: 8000 }).toContain('4097');

    const err = await page.textContent('#err');
    expect(err, 'the message names the limit, not just the problem').toContain('4096');
    expect(await page.evaluate(() => document.getElementById('app').hidden),
      'and the editor never opened').toBe(true);
    /* The point of the whole change: this file is nowhere near the 25 MB
       limit, so the check that already existed would have waved it through. */
    expect(fileBytes, 'and it is far under the file-size limit that already existed')
      .toBeLessThan(25 * 1024 * 1024);
  });

  test('a tall one is refused too, not just a wide one', async ({ page }) => {
    /* w<=MAX && h<=MAX is easy to write as w<=MAX only, and a test that
       checks one orientation cannot tell the difference. */
    await landing(page);
    await dropImage(page, 10, 4097);
    await expect.poll(() => page.textContent('#err'), { timeout: 8000 }).toContain('4097');
    expect(await page.evaluate(() => document.getElementById('app').hidden)).toBe(true);
  });

  test('an ordinary image still opens - the control', async ({ page }) => {
    /* Without this, both tests above pass just as well if load() were broken
       outright, which would be far worse than the crash it prevents. */
    await landing(page);
    await dropImage(page, 120, 120);
    await expect.poll(async () => page.evaluate(() =>
      !document.getElementById('scrim').hidden || !document.getElementById('app').hidden),
      { timeout: 8000 }).toBe(true);
    expect(await page.textContent('#err'), 'and nothing was complained about').toBe('');
  });

  test('the boundary itself is allowed, not refused', async ({ page }) => {
    /* 4096 is what resizeTo clamps to and what the size fields accept. If the
       comparison were < instead of <=, you could resize to a size you could
       not then open, which is a worse bug than the one being fixed. */
    await landing(page);
    expect(await page.evaluate(() => [
      overMax(4096, 4096), overMax(4097, 4096), overMax(4096, 4097), overMax(1280, 1280),
    ])).toEqual(['', expect.stringContaining('4097'), expect.stringContaining('4097'), '']);
  });
});

test.describe('Backspace leaves the image, never the page', () => {
  const press = (page, where) => page.evaluate(sel => {
    const target = sel ? document.querySelector(sel) : document.body;
    if (sel && !target) throw new Error('no element for ' + sel);
    if (target.focus) target.focus();
    const e = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e.defaultPrevented;
  }, where || null);

  test('in the editor it closes the image', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: flat });
    expect(await page.evaluate(() => document.getElementById('app').hidden)).toBe(false);
    const prevented = await press(page);
    expect(prevented, 'and the browser is not allowed to act on it').toBe(true);
    await expect.poll(() => page.evaluate(() => document.getElementById('app').hidden),
      { timeout: 5000 }).toBe(true);
  });

  test('and on the landing page it still does not navigate', async ({ page }) => {
    /* THE fix. The dispatcher returns on `if($("app").hidden) return;` before
       reaching any binding, so with no editor open Backspace fell through to
       the browser - which is exactly the state a too-large image leaves you
       in, and exactly when someone presses it to escape. */
    await landing(page);
    expect(await page.evaluate(() => document.getElementById('app').hidden),
      'no editor is open, which is the case that was broken').toBe(true);
    expect(await press(page), 'prevented even with nothing to close').toBe(true);
  });

  test('but it still deletes text in a text field', async ({ page }) => {
    /* Preventing Backspace everywhere would be a much worse bug than the one
       being fixed, and it would not look like a bug - it would look like a
       broken keyboard. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.evaluate(() => {
      const s = document.getElementById('tname');
      if (s) { s.hidden = false; s.disabled = false; }
    });
    const prevented = await press(page, '#tname');
    expect(prevented, 'typing is left alone').toBe(false);
    expect(await page.evaluate(() => document.getElementById('app').hidden),
      'and the editor is still open').toBe(false);
  });

  test('and a slider is prevented without throwing the editor away', async ({ page }) => {
    /* Both halves matter. It must not navigate, and it must not close the
       editor either - dragging the brush and hitting Backspace used to do
       exactly that, which is why range inputs own the key. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    const prevented = await press(page, "#bslider");   // the brush slider is #bslider, not #bsize
    expect(prevented, 'the browser still may not act on it').toBe(true);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('app').hidden),
      'and the editor survives').toBe(false);
  });
});
