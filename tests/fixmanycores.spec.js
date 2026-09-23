/* A FOLDER IS FIXED ON SEVERAL CORES, WITH THE SAME ANSWERS IN THE SAME ORDER.

   A batch ran one engine and waited on it for each file. RUN AGAINST THE
   PAGE BEFORE THE FIX: the first test went red with one image in flight
   at a time. The rest are controls that hold before and after: three
   engines give byte for byte the pictures one engine gives, in the same
   order under the same names, and Stop keeps the file being finished and
   nothing sent ahead. */
import { test, expect } from '@playwright/test';

/* Ten pixel-art files: 16x16 cells drawn 8 px each, a different pattern
   and palette per file, so the engine has a real grid to find. */
const arm = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
  window.files = [];
  for (let f = 0; f < 10; f++) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (((x - 8) ** 2 + (y - 8) ** 2) > 40 + f * 3) continue;
      g.fillStyle = 'hsl(' + ((x * 13 + y * 7 + f * 40) % 360) + ' 60% ' + (35 + ((x + y + f) % 4) * 10) + '%)';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    window.files.push(new File([blob], 'art' + f + '.png', { type: 'image/png' }));
  }
  showPage('fixer', false);
  window.inFlight = 0; window.mostInFlight = 0;
  const real = fixAsk;
  fixAsk = (w, p, cb) => {
    window.inFlight++; window.mostInFlight = Math.max(window.mostInFlight, window.inFlight);
    return real(w, p, cb).finally(() => { window.inFlight--; });
  };
});
const run = (page, engines, stopAfterFirst) => page.evaluate(async ({ engines, stopAfterFirst }) => {
  try { FIX_ENGINES_MAX = engines; } catch (_) {}
  window.mostInFlight = 0;
  let stopper = null;
  if (stopAfterFirst) {
    const realTile = fixTile;
    fixTile = (...a) => { fixBatchStop = true; return realTile(...a); };
    stopper = () => { fixTile = realTile; };
  }
  const t0 = performance.now();
  try { await fixBatch(window.files); } finally { if (stopper) stopper(); }
  const ms = Math.round(performance.now() - t0);
  const sig = async (u8) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).slice(0, 6).join('.');
  const out = [];
  for (const f of fixBatchFiles) out.push(f.name + '#' + await sig(f.data));
  return { ms, most: window.mostInFlight, out };
}, { engines, stopAfterFirst });

test.describe('fixing a folder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixAsk === 'function');
    await arm(page);
  });

  test('RUNS ON SEVERAL ENGINES AT ONCE', async ({ page }) => {
    const r = await run(page, 3, false);
    console.log('three: ' + r.ms + ' ms, most in flight ' + r.most);
    expect(r.out.length).toBe(10);
    expect(r.most).toBe(3);
  });

  test('the control: three engines give the pictures one gives, byte for byte, in the same order', async ({ page }) => {
    const one = await run(page, 1, false);
    const three = await run(page, 3, false);
    console.log('one: ' + one.ms + ' ms, three: ' + three.ms + ' ms');
    expect(one.out.length).toBe(10);
    expect(three.out).toEqual(one.out);
  });

  test('the control: Stop keeps the file being finished and nothing sent ahead', async ({ page }) => {
    const r = await run(page, 3, true);
    expect(r.out.length).toBe(1);
    expect(r.out[0]).toMatch(/^art0/);
  });
});
