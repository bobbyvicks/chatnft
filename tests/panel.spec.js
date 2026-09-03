import { test, expect } from '@playwright/test';
import { openTrait, openSection, art, setField } from './helpers.js';

test.describe('the panel', () => {
  test('fits its window on arrival, with every heading reachable', async ({ page }) => {
    /* It used to scroll 2,780px inside a 1,185px window, which is how a button
       that had shipped hours earlier still could not be found. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    const panel = await page.evaluate(() => {
      const s = document.querySelector('.side');
      const r = s.getBoundingClientRect();
      const heads = [...s.querySelectorAll('section h2')].map(h => {
        const hr = h.getBoundingClientRect();
        return { name: h.textContent.replace(/[^A-Za-z ]/g, '').trim(),
                 onScreen: hr.top >= r.top - 1 && hr.bottom <= r.bottom + 1 };
      });
      return { scroll: s.scrollHeight, window: s.clientHeight, heads,
               open: [...s.querySelectorAll('section')].filter(x => !x.classList.contains('folded')).length };
    });
    expect(panel.scroll, 'no scrolling on arrival').toBeLessThanOrEqual(panel.window + 2);
    expect(panel.open, 'two sections open, the rest one click away').toBe(2);
    for (const h of panel.heads) expect(h.onScreen, `${h.name} should be reachable without scrolling`).toBe(true);
  });

  test('one click on a heading reveals its controls', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    expect(await page.evaluate(() => {
      const b = document.getElementById('rcerase');
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }), 'folded to begin with').toBe(false);

    await openSection(page, 'Recolour');
    const shown = await page.evaluate(() => {
      const b = document.getElementById('rcerase'), s = document.querySelector('.side');
      const r = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
      return { visible: r.width > 0 && r.height > 0, inView: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1 };
    });
    expect(shown.visible).toBe(true);
    expect(shown.inView, 'and in view, not below the fold').toBe(true);
  });

  test('no button label wraps onto a second line', async ({ page }) => {
    /* Two did, and stood 65px tall next to their 44px neighbours. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    await page.evaluate(() => document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded')));
    await page.waitForTimeout(150);
    const wrapped = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.side button').forEach(b => {
        const r = b.getBoundingClientRect();
        if (r.height < 1) return;
        const cs = getComputedStyle(b);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const lines = Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh);
        const t = (b.textContent || '').trim();
        if (lines > 1 && t) out.push(t + ' (' + Math.round(r.height) + 'px)');
      });
      return out;
    });
    expect(wrapped).toEqual([]);
  });
});

test.describe('fill interior holes', () => {
  /* A square with a 4x4 gap the art surrounds, three single-cell specks, and a
     notch running out to the border. Only the first two are holes. */
  const holed = (set) => {
    for (let y = 5; y < 55; y++) for (let x = 5; x < 55; x++) set(x, y, [226, 146, 116]);
    for (let y = 20; y < 26; y++) for (let x = 20; x < 26; x++) set(x, y, [0, 0, 0, 0]);
    for (const [x, y] of [[40, 40], [44, 42], [12, 45]]) set(x, y, [0, 0, 0, 0]);
    for (let y = 0; y < 12; y++) set(30, y, [0, 0, 0, 0]);
  };

  test('closes every gap when the limit is 0', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openSection(page, 'Background');
    const before = await art.empty(page);
    await setField(page, 'holemax', 0);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    // 36 in the square gap plus 3 specks
    expect(before - await art.empty(page)).toBe(39);
  });

  test('a limit leaves the big gap and takes the specks', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openSection(page, 'Background');
    const before = await art.empty(page);
    await setField(page, 'holemax', 4);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    expect(before - await art.empty(page), 'only the three specks').toBe(3);
  });

  test('never closes a gap that reaches the border', async ({ page }) => {
    /* That is the outside of the trait, not a hole in it. */
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openSection(page, 'Background');
    await setField(page, 'holemax', 0);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    const notchStillOpen = await page.evaluate(() => {
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let n = 0;
      for (let y = 5; y < 12; y++) if (d[(y * art.width + 30) * 4 + 3] === 0) n++;
      return n;
    });
    expect(notchStillOpen, 'the notch is untouched').toBe(7);
  });
});
