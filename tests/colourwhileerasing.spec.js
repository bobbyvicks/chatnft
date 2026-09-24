/* A COLOUR PICKED WHILE ERASING SWITCHES TO DRAWING WITH IT.

   Asked for: "if i click a colour and im on erase it switches to draw and
   im using that colour". RUN AGAINST THE PAGE BEFORE THE FIX: the first
   three went red with the eraser still on after a palette colour, a colour
   from the picture and a recent colour were clicked. The last is the
   control that a colour clicked with another tool - the fill - keeps that
   tool, before and after. */
import { test, expect } from '@playwright/test';

const open = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false); activeWs = null; await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#c03030'; g.fillRect(2, 2, 6, 12);
  g.fillStyle = '#3050c0'; g.fillRect(8, 2, 6, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', blob, w: 16, h: 16, rarity: 1, at: 1 });
  await openTraitRecord(await dbGet('t_cap_hats_wip'));
  setColor('#123456');
});
/* Clicks the first swatch in a row, found by its label, with the given tool on. */
const clickWith = (page, toolName, label) => page.evaluate(({ toolName, label }) => {
  selectTool(toolName);
  const b = [...document.querySelectorAll('button.sw')].find(x => (x.getAttribute('aria-label') || '').indexOf(label) === 0
    && x.dataset.hex && x.dataset.hex !== color);
  if (!b) return { missing: label };
  b.click();
  return { tool, color, hex: b.dataset.hex };
}, { toolName, label });

test.describe('picking a colour in the editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof selectTool === 'function');
    await open(page);
  });

  test('A PALETTE COLOUR CLICKED WHILE ERASING switches to drawing with it', async ({ page }) => {
    const r = await clickWith(page, 'eraser', 'Palette colour');
    console.log('palette: ' + JSON.stringify(r));
    expect(r.missing).toBeUndefined();
    expect(r.tool).toBe('pencil');
    expect(r.color).toBe(r.hex);
  });

  test('A COLOUR FROM THE PICTURE clicked while erasing does the same', async ({ page }) => {
    const r = await clickWith(page, 'eraser', 'Colour #');
    const any = r.missing ? await page.evaluate(() => [...document.querySelectorAll('button.sw')].map(b => b.getAttribute('aria-label')).slice(0, 5)) : null;
    console.log('picture: ' + JSON.stringify(r) + ' ' + JSON.stringify(any));
    expect(r.missing).toBeUndefined();
    expect(r.tool).toBe('pencil');
    expect(r.color).toBe(r.hex);
  });

  test('A RECENT COLOUR clicked while erasing does the same', async ({ page }) => {
    await page.evaluate(() => { setColor('#aa7700'); setColor('#123456'); });
    const r = await clickWith(page, 'eraser', 'Recently used colour');
    expect(r.missing).toBeUndefined();
    expect(r.tool).toBe('pencil');
    expect(r.color).toBe(r.hex);
  });

  test('the control: with the fill on, a colour keeps the fill', async ({ page }) => {
    const r = await clickWith(page, 'fill', 'Palette colour');
    expect(r.tool).toBe('fill');
    expect(r.color).toBe(r.hex);
  });
});
