/* FIX PIXELS FROM THE EDITOR, AND A TOP BAR WITH THE ACTIONS YOU REACH FOR.

   Asked for: a yellow Fix pixels button on the editor's top bar that fixes
   the trait being edited without saving and leaving, and the bar - which
   held only the colour and brush controls in a 274 px corner - filled with
   the most useful actions. RUN AGAINST THE PAGE BEFORE THE FIX: the first
   three went red (no button; the bar 274 px wide). The last two are the
   bar's buttons doing what the controls they stand for do. */
import { test, expect } from '@playwright/test';

/* 128 x 128, drawn in 8 px blocks, in colours just off the palette, with a
   little noise - what Fix pixels exists to clean. */
const open = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false); activeWs = null; await dbClear(); LAYERS = ['hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    g.fillStyle = (x === 2 || y === 2 || x === 13 || y === 13) ? 'rgb(6,4,5)' : 'rgb(' + (180 + (x * 7) % 9) + ',' + (60 + (y * 5) % 7) + ',47)';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_box_hats_wip', kind: 'trait', name: 'box', layer: 'hats', status: 'wip', blob, w: 128, h: 128, rarity: 1, at: 1 });
  await openTraitRecord(await dbGet('t_box_hats_wip'));
  window.said = []; window.toast = (m) => window.said.push(String(m));
});
const sig = (page) => page.evaluate(() => {
  const d = ctx.getImageData(0, 0, art.width, art.height).data; let h = 0;
  for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0;
  const hx = v => v.toString(16).padStart(2, '0');
  const cols = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) cols.add('#' + hx(d[i]) + hx(d[i + 1]) + hx(d[i + 2]));
  const pal = new Set(paletteList().map(h => String(h).toLowerCase()));
  return { w: art.width, h: art.height, hash: h, colours: cols.size, offPalette: [...cols].filter(c => !pal.has(c)).length };
});

test.describe('the editor top bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await open(page);
  });

  test('A YELLOW FIX PIXELS BUTTON fixes the picture being edited, in place', async ({ page }) => {
    const before = await sig(page);
    const btn = page.locator('#edfix');
    await expect(btn).toBeVisible();
    const bg = await btn.evaluate(b => getComputedStyle(b).backgroundColor);
    expect(bg, 'yellow: the accent').toBe('rgb(245, 165, 36)');
    await btn.click();
    await page.waitForFunction(() => !editorFixing, null, { timeout: 30000 });
    const after = await sig(page);
    console.log('fix: ' + JSON.stringify({ before, after, said: await page.evaluate(() => window.said) }));
    expect(after.hash).not.toBe(before.hash);
    expect(after.offPalette, 'every colour on the palette now').toBe(0);
    expect(await page.evaluate(async () => (await dbGet('t_box_hats_wip')).at), 'and nothing was saved').toBe(1);
  });

  test('ONE UNDO takes the fix back exactly', async ({ page }) => {
    const before = await sig(page);
    await page.click('#edfix');
    await page.waitForFunction(() => !editorFixing, null, { timeout: 30000 });
    await page.click('#edundo');
    expect(await sig(page)).toEqual(before);
  });

  test('THE BAR RUNS THE WIDTH OF THE EDITOR', async ({ page }) => {
    const w = await page.evaluate(() => Math.round(document.getElementById('optsbar').getBoundingClientRect().width));
    expect(w).toBeGreaterThan(1200);
  });

  test('its Grid is the grid button: it turns the grid on and says so', async ({ page }) => {
    await page.click('#edgrid');
    expect(await page.evaluate(() => ({ on: document.getElementById('grid').classList.contains('on'),
      pressed: document.getElementById('edgrid').getAttribute('aria-pressed') }))).toEqual({ on: true, pressed: 'true' });
  });

  test('its Undo is the undo button: a stroke undone', async ({ page }) => {
    const before = await sig(page);
    await page.evaluate(() => { snapshot(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 8, 8); });
    await page.click('#edundo');
    expect(await sig(page)).toEqual(before);
  });
});
