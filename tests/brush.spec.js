import { test, expect } from '@playwright/test';
import { openTrait, openAllSections, art } from './helpers.js';

const flat = (set, W, H) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 90]); };

/* The brush size is a script-scope `let`, so the observable state is the slider
   value and the two readouts. Reading it off window gives undefined, and a test
   that compares undefined to undefined passes without testing anything - which
   is exactly what happened the first time these were checked by hand. */
const slider = page => page.evaluate(() => ({
  value: +document.getElementById('bslider').value,
  max: +document.getElementById('bslider').max,
  label: document.getElementById('bslab').textContent.trim(),
  status: document.getElementById('bsize').textContent.trim(),
}));

test.describe('the brush', () => {
  test('paints exactly size-squared cells, at every size', async ({ page }) => {
    await openTrait(page, { w: 240, h: 240, draw: flat });
    await openAllSections(page);
    await page.evaluate(() => selectTool('eraser'));
    /* Well apart and clear of every edge, so nothing is clipped or overlapping -
       a clipped block counts short and reads as a bug in the brush. */
    for (const [n, x, y] of [[1, 20, 20], [8, 60, 20], [24, 120, 20], [60, 120, 140]]) {
      const before = await art.empty(page);
      await page.evaluate(({ n, x, y }) => {
        const s = document.getElementById('bslider');
        s.value = String(n); s.dispatchEvent(new Event('input', { bubbles: true }));
        dab(x, y, [0, 0, 0], 0);
      }, { n, x, y });
      await page.waitForTimeout(80);
      expect(await art.empty(page) - before, `a ${n} brush must clear ${n * n} cells`).toBe(n * n);
    }
  });

  test('the ceiling follows the canvas and the readouts agree', async ({ page }) => {
    await openTrait(page, { w: 240, h: 240, draw: flat });
    await openAllSections(page);
    expect((await slider(page)).max, 'half the shorter side').toBe(120);
    for (const n of [3, 17, 64, 120]) {
      await page.evaluate(v => {
        const s = document.getElementById('bslider');
        s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true }));
      }, n);
      const s = await slider(page);
      expect(s.value).toBe(n);
      expect(s.label.replace(/\s/g, '')).toBe(`${n}×${n}`);
      expect(s.status.replace(/\s/g, '')).toBe(`${n}×${n}`);
    }
  });

  test('the bracket keys step by one while the slider has focus', async ({ page }) => {
    /* Letting shortcuts through for range inputs is what made this work; before
       that, touching the slider killed every keyboard shortcut in the app. */
    await openTrait(page, { w: 240, h: 240, draw: flat });
    await openAllSections(page);
    await page.focus('#bslider');
    await page.evaluate(() => {
      const s = document.getElementById('bslider');
      s.value = '20'; s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.keyboard.press(']');
    await page.waitForTimeout(120);
    expect((await slider(page)).value).toBe(21);
    await page.keyboard.press('[');
    await page.waitForTimeout(120);
    expect((await slider(page)).value).toBe(20);
  });

  test('Backspace on the slider does NOT throw you out of the editor', async ({ page }) => {
    /* Bare Backspace closes the editor with no confirmation. Once the keyboard
       was let through for range inputs it became reachable from the one control
       you have just been dragging. */
    await openTrait(page, { w: 120, h: 120, draw: flat });
    await openAllSections(page);
    await page.focus('#bslider');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('app').hidden),
      'the editor must still be open').toBe(false);
  });

  test('Backspace from the canvas still closes it - the control', async ({ page }) => {
    /* Without this, the test above passes just as well if Backspace stopped
       working everywhere. */
    await openTrait(page, { w: 120, h: 120, draw: flat });
    await page.evaluate(() => document.getElementById('art').focus());
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('app').hidden),
      'from the canvas it should still close').toBe(true);
  });

  test('a new image starts on a fresh brush', async ({ page }) => {
    /* It used to carry over, which mattered little at a maximum of 8 and a lot
       at 128: open a small trait after a big one and the first click paints a
       block. */
    await openTrait(page, { w: 240, h: 240, draw: flat });
    await openAllSections(page);
    await page.evaluate(() => {
      const s = document.getElementById('bslider');
      s.value = '100'; s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect((await slider(page)).value).toBe(100);

    await page.evaluate(() => {
      const w = 80, h = 80, d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) { d[i * 4] = 200; d[i * 4 + 3] = 255; }
      fileName = 'second.png';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
    });
    await page.waitForTimeout(400);
    const s = await slider(page);
    expect(s.value, 'the brush resets').toBe(1);
    expect(s.max, 'and the ceiling follows the new canvas').toBe(40);
  });
});
