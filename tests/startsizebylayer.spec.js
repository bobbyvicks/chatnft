/* THE PIXEL SIZE BOX STARTS AT 8 FOR BACKGROUNDS, CHAINS, MOUTHS AND EYES (patch616).

   The owner, shown that 79 of 311 traits lose their detail at 16 and keep it
   at 8, chose "8 for those layers, 16 for the rest". One visible number that
   anybody can change still stands: a number somebody chose wins.

     TEST 1 opening a picture shows its layer's start size: 8 for the four
       layers, 16 for the others and for a picture with no layer.
     TEST 2 a typed number wins for every picture after it.
     TEST 3 a number set by anything other than the page itself wins too
       (a script, or the agent surface PB.fix).
     TEST 4 a folder run gives each file its own start size and says so; with
       a number typed, every file gets that number and nothing is said. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixLoad === 'function' && typeof fixStartSize === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} showPage('fixer', false); });
};

/* a 1280 picture drawn in 8 px blocks, so 8 gives 160 cells and 16 gives 80 */
const HELPERS = `
  window.__t = {
    png: async () => {
      const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d');
      for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) {
        g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4]; g.fillRect(x * 8, y * 8, 8, 8);
      }
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      return new Uint8Array(await blob.arrayBuffer());
    },
    box: () => document.getElementById('fixforce').value,
  };`;

test.describe('the pixel size box starts by layer', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); await page.evaluate(HELPERS); });

  test('opening a picture shows its layer\'s start size', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(), seen = { start: t.box() };
      for (const rel of ['mouth/a.png', 'hats/approved/a.png', 'eyes/a.png', 'a.png', 'x/backgrounds/wip/a.png', 'chains/a.png', 'clothing/a.png']) {
        await fixLoad(fileWithPath(bytes, rel)); seen[rel] = t.box();
      }
      return seen;
    });
    expect(r).toEqual({ start: '16', 'mouth/a.png': '8', 'hats/approved/a.png': '16', 'eyes/a.png': '8', 'a.png': '16',
      'x/backgrounds/wip/a.png': '8', 'chains/a.png': '8', 'clothing/a.png': '16' });
  });

  test('a typed number wins for every picture after it', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png();
      await fixLoad(fileWithPath(bytes, 'mouth/a.png'));
      const f = document.getElementById('fixforce'); f.value = '12'; f.dispatchEvent(new Event('input', { bubbles: true }));
      await fixLoad(fileWithPath(bytes, 'hats/a.png')); const hats = t.box();
      await fixLoad(fileWithPath(bytes, 'eyes/a.png')); const eyes = t.box();
      /* even typing the number the page had put there counts as choosing it */
      f.value = '16'; f.dispatchEvent(new Event('input', { bubbles: true }));
      await fixLoad(fileWithPath(bytes, 'mouth/b.png'));
      return { hats, eyes, sixteen: t.box() };
    });
    expect(r).toEqual({ hats: '12', eyes: '12', sixteen: '16' });
  });

  test('a number set by a script or by PB.fix wins too', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png();
      document.getElementById('fixforce').value = '10';
      await fixLoad(fileWithPath(bytes, 'mouth/a.png'));
      const script = t.box();
      return { script };
    });
    expect(r.script, 'set without an input event, but not by the page').toBe('10');
    /* a fresh page for PB.fix */
    await ready(page); await page.evaluate(HELPERS);
    const p = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png();
      const realToast = window.toast; window.toast = () => {};
      /* 16 on a hats picture is the number the page itself would show, so only
         PB.fix counting as a choice keeps it when a mouth picture opens next */
      await PB.fix({ file: fileWithPath(bytes, 'hats/a.png'), forceStep: 16 });
      await fixLoad(fileWithPath(bytes, 'mouth/a.png'));
      window.toast = realToast;
      return { after: t.box() };
    });
    expect(p.after, 'PB.fix chose 16, so a mouth picture keeps it').toBe('16');
  });

  test('a folder run gives each file its own start size and says so', async ({ page }) => {
    const run = async (typed) => page.evaluate(async (typed) => {
      const t = window.__t, bytes = await t.png();
      const realToast = window.toast; window.toast = () => {};
      document.getElementById('fixmode').value = 'fast';
      if (typed) { const f = document.getElementById('fixforce'); f.value = typed; f.dispatchEvent(new Event('input', { bubbles: true })); }
      await fixBatch([fileWithPath(bytes, 'mouth/m.png'), fileWithPath(bytes, 'hats/h.png'), fileWithPath(bytes, 'backgrounds/b.png')]);
      window.toast = realToast;
      const cells = {}; for (const f of fixBatchFiles) cells[f.rel] = f.cells;
      return { cells, said: document.getElementById('fixbatchout').textContent };
    }, typed);
    const a = await run(null);
    expect(a.cells).toEqual({ 'mouth/m.png': 160, 'hats/h.png': 80, 'backgrounds/b.png': 160 });
    expect(a.said).toContain('started at 8 for 2 (backgrounds, chains, mouths, eyes) and at 16 for 1');
    await ready(page); await page.evaluate(HELPERS);
    const b = await run('16');
    expect(b.cells, 'typed 16: every file at 16').toEqual({ 'mouth/m.png': 80, 'hats/h.png': 80, 'backgrounds/b.png': 80 });
    expect(b.said).not.toContain('started at');
  });
});
