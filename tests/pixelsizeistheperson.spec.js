/* THE PIXEL SIZE BOX IS THE PERSON'S (patch619).

   The owner, 2026-10-01: "i dont want specific rules for certain traits" and,
   asked how the size should be chosen, "the user gets to chose always".
   patch616 had made the box show 8 when a background, chain, mouth or eyes
   picture was opened; that is gone. (Replaces tests/startsizebylayer.spec.js,
   which pinned patch616.)

     TEST 1 opening pictures from any folder leaves the box where it is - at
       16 when nobody has touched it, at whatever the person typed after.
     TEST 2 a folder run uses the box for every file, whatever its folder,
       and says nothing about start sizes. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixLoad === 'function' && typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} showPage('fixer', false); });
};

/* a 1280 picture drawn in 8 px blocks, so 8 gives 160 cells and 16 gives 80 */
const PNG = async (page) => page.evaluate(async () => {
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d');
  for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4]; g.fillRect(x * 8, y * 8, 8, 8);
  }
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  c.width = 1; c.height = 1;
  window.__png = new Uint8Array(await blob.arrayBuffer());
});

test.describe('the pixel size box is the person\'s', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); await PNG(page); });

  test('opening pictures from any folder leaves the box alone', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const box = () => document.getElementById('fixforce').value, seen = { start: box() };
      for (const rel of ['mouth/a.png', 'eyes/a.png', 'backgrounds/a.png', 'chains/a.png', 'hats/a.png'])
        { await fixLoad(fileWithPath(window.__png, rel)); seen[rel] = box(); }
      const f = document.getElementById('fixforce'); f.value = '8'; f.dispatchEvent(new Event('input', { bubbles: true }));
      for (const rel of ['hats/b.png', 'mouth/b.png']) { await fixLoad(fileWithPath(window.__png, rel)); seen['typed ' + rel] = box(); }
      return seen;
    });
    expect(r).toEqual({ start: '16', 'mouth/a.png': '16', 'eyes/a.png': '16', 'backgrounds/a.png': '16', 'chains/a.png': '16', 'hats/a.png': '16',
      'typed hats/b.png': '8', 'typed mouth/b.png': '8' });
  });

  test('a folder run uses the box for every file', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      document.getElementById('fixmode').value = 'fast';
      await fixBatch([fileWithPath(window.__png, 'mouth/m.png'), fileWithPath(window.__png, 'hats/h.png'), fileWithPath(window.__png, 'backgrounds/b.png')]);
      window.toast = realToast;
      const cells = {}; for (const f of fixBatchFiles) cells[f.rel] = f.cells;
      return { cells, said: document.getElementById('fixbatchout').textContent };
    });
    expect(r.cells).toEqual({ 'mouth/m.png': 80, 'hats/h.png': 80, 'backgrounds/b.png': 80 });
    expect(r.said).not.toContain('started at');
  });
});
