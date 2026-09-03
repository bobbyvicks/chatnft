import { test, expect } from '@playwright/test';
import { openTrait, openAllSections, attachBase, art, base, setField, setSelect } from './helpers.js';

/* A character with white bands at its head and its feet. Those are the first
   things lost when the base gets cropped, and they are exactly what a hat or a
   pair of boots is fitted against. */
const character = (g, S) => {
  g.fillStyle = '#3355aa'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff';
  g.fillRect(S * 0.3, S * 0.01, S * 0.4, S * 0.08);
  g.fillRect(S * 0.3, S * 0.91, S * 0.4, S * 0.08);
};

const trait = (set) => { for (let y = 50; y < 70; y++) for (let x = 40; x < 80; x++) set(x, y, [226, 146, 116]); };

test.describe('the base character', () => {
  test('holds still while the trait is resized', async ({ page }) => {
    /* The whole point. The base used to be stretched to the art canvas on every
       redraw, so the trait and the character grew together and resizing could
       never change how one sat on the other - measured at a ratio of 1.0000
       before and after doubling. */
    const errors = await openTrait(page, { w: 120, h: 120, draw: trait });
    await attachBase(page, { size: 200, draw: character });
    await openAllSections(page);

    const before = { art: await art.size(page), ink: await base.ink(page) };
    expect(before.ink.w, 'the character fills the canvas to begin with').toBe(120);

    await setSelect(page, 'rsmode', 'art');
    await page.evaluate(() => document.getElementById('rssnap').setAttribute('aria-pressed', 'false'));
    await setField(page, 'rsw', 240);
    await setField(page, 'rsh', 240);
    await page.click('#rsgo');
    await page.waitForTimeout(400);

    const after = { art: await art.size(page), ink: await base.ink(page) };
    expect(after.art).toBe('240x240');
    expect(after.ink.w, 'the character keeps its own size').toBe(120);
    expect(after.ink.x0, 'and sits centred in the bigger canvas').toBe(60);
    expect(errors).toEqual([]);
  });

  test('is not cropped when the canvas shrinks under it', async ({ page }) => {
    /* Shrinking the canvas used to cut the character off at the canvas edge -
       960 marker pixels down to 0, taking the head and the feet with them. */
    await openTrait(page, { w: 120, h: 120, draw: trait });
    await attachBase(page, { size: 200, draw: character });
    await openAllSections(page);

    const markersBefore = await base.colour(page, [255, 255, 255]);
    expect(markersBefore, 'the fixture must actually have markers').toBeGreaterThan(0);

    await setSelect(page, 'rsmode', 'art');
    await page.evaluate(() => document.getElementById('rssnap').setAttribute('aria-pressed', 'false'));
    for (const size of [80, 40]) {
      await setField(page, 'rsw', size);
      await setField(page, 'rsh', size);
      await page.click('#rsgo');
      await page.waitForTimeout(350);
      expect(await art.size(page)).toBe(`${size}x${size}`);
      expect(await base.colour(page, [255, 255, 255]),
        `the head and feet must survive a shrink to ${size}`).toBe(markersBefore);
    }
    const b = await page.evaluate(() => ({ base: document.getElementById('base').width, art: art.width }));
    expect(b.base, 'the character overflows the trait canvas').toBeGreaterThan(b.art);
  });

  test('does not turn when the trait does', async ({ page }) => {
    /* The base is a child of the frame, so a rotation on the frame reached it
       and the character turned with the trait. */
    await openTrait(page, { w: 120, h: 120, draw: trait });
    await attachBase(page, { size: 200, draw: character });

    const boxes = await page.evaluate(async () => {
      const b = document.getElementById('base');
      const box = () => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      const rest = box();
      const turned = [];
      for (const deg of [17, 37, 90, 143.7, 270]) {
        frameTurn(deg);
        await new Promise(r => setTimeout(r, 40));
        turned.push(box());
      }
      frameTurn(0);
      await new Promise(r => setTimeout(r, 40));
      return { rest, turned, cleared: box() };
    });
    for (const t of boxes.turned) expect(t).toEqual(boxes.rest);
    expect(boxes.cleared).toEqual(boxes.rest);
  });

  test('and the frame really does turn - the control', async ({ page }) => {
    /* If nothing turned at all, the test above would pass for the wrong reason. */
    await openTrait(page, { w: 120, h: 120, draw: trait });
    const r = await page.evaluate(async () => {
      const f = document.getElementById('frame');
      const w = () => Math.round(f.getBoundingClientRect().width);
      const rest = w();
      frameTurn(30);
      await new Promise(x => setTimeout(x, 60));
      const turned = w();
      frameTurn(0);
      return { rest, turned };
    });
    expect(r.turned, 'a rotated frame reports a wider box').toBeGreaterThan(r.rest);
  });
});
