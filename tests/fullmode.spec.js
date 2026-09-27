/* Thorough mode: the fixer's full mode, running in the page.

   "https://github.com/Retro-Diffusion/pixel-art-fixer.git i want this coded
   into our site". The engine's full mode was checked against the Python
   reference in node - 359 of 359 traits, both modes, exact. That proves the
   port; it does not prove the PAGE runs it. This file does: the same bundle,
   inlined in #pfcore, run in the page's own Worker, has to give the
   reference's answer where quick mode guesses.
*/
import { test, expect } from '@playwright/test';
import fs from 'fs';

/* A real approved background where the two modes disagree, and the
   reference's own answers for it, from the one-process-per-image oracle run
   (scratchpad/modes/modes.jsonl, 2026-09-27):
     fast  151 x 257  fastmode:lowconf  - the detectors disagreed, a guess
     full  197 x 203  arbitrated        - settled                       */
const DVD = 'E:/X content/pixel art_/new-traits/backgrounds/approved/DVD Video.png';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof PB === 'object' && typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} showPage('fixer', false); });
};

test.describe('Thorough mode', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('THE MENU OFFERS THOROUGH, FIRST AND CHOSEN', async ({ page }) => {
    const r = await page.evaluate(() => {
      const s = document.getElementById('fixmode');
      return { values: [...s.options].map(o => o.value), value: s.value, mode: fixMode() };
    });
    expect(r.values).toEqual(['full', 'fast', 'scale']);
    expect(r.value, 'the default').toBe('full');
    expect(r.mode).toBe('full');
  });

  test('THOROUGH SETTLES WHAT QUICK GUESSES, IN THE PAGE\'S OWN WORKER', async ({ page }) => {
    test.skip(!fs.existsSync(DVD), 'the approved backgrounds folder is not on this machine');
    test.setTimeout(120000);
    const bytes = [...fs.readFileSync(DVD)];
    const r = await page.evaluate(async (bytes) => {
      const file = new File([new Uint8Array(bytes)], 'DVD Video.png', { type: 'image/png' });
      /* Nothing the tab decides for itself: no size, no snap, so the grid is
         the detectors' answer - which is where the modes differ. */
      const sn = document.getElementById('fixsnap'); sn.checked = false;
      const realToast = window.toast; window.toast = () => {};
      const full = await PB.fix({ file, mode: 'full', forceStep: 0 });
      const fast = await PB.fix({ file, mode: 'fast', forceStep: 0 });
      window.toast = realToast;
      return { full, fast };
    }, bytes);
    expect(r.full.ok, 'thorough ran').toBe(true);
    expect([r.full.cols, r.full.rows, r.full.consensus], 'the reference\'s full answer').toEqual([197, 203, 'arbitrated']);
    /* THE CONTROL: the same picture, the same page, quick mode - the
       reference's fast answer, which is different. */
    expect([r.fast.cols, r.fast.rows, r.fast.consensus], 'the reference\'s fast answer').toEqual([151, 257, 'fastmode:lowconf']);
  });

  test('SNAP WORKS IN THOROUGH, AND A SIZE STILL SKIPS DETECTION', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const f = document.getElementById('fixforce');
      f.value = '0'; f.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('fixsnap').checked = true;
      const snapsAt0 = fixSnapping();
      /* A size: the engine is handed the step and never detects, in either mode. */
      const W = 160, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d');
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { g.fillStyle = ['#2e222f', '#8b5fbf'][(x + y) % 2]; g.fillRect(x * 4, y * 4, 4, 4); }
      const d = g.getImageData(0, 0, W, W).data;
      const realToast = window.toast; window.toast = () => {};
      const sized = await PB.fix({ data: d, width: W, height: W, name: 's.png', mode: 'full', forceStep: 16 });
      window.toast = realToast;
      return { snapsAt0, sizedConsensus: sized.consensus };
    });
    expect(r.snapsAt0, 'a ticked Snap snaps in thorough mode, as in quick').toBe(true);
    expect(r.sizedConsensus, 'a size is used as given, not detected').toBe('forced');
  });
});
