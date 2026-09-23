/* THE PALETTE STEP RUNS IN THE WORKER, BESIDE THE ENGINE.

   The engine ran in a worker and the palette step after it on the page, one
   synchronous task a file. The fixture is two smooth 1280 fields at a 4 px
   block, whose results hold about 70,000 colours each, a colour a cell as
   the photographic backgrounds' do; long tasks are watched for the run
   alone. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with
   two tasks of 415 ms, one a file, and the same colours moved. The second
   holds the worker's answer to the page's own step, byte for byte and
   count for count; it needs the worker to take a palette, so it is red
   before the fix too. */
import { test, expect } from '@playwright/test';

const run = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  const W = o.side, files = [];
  for (let f = 0; f < o.n; f++) {
    const c = document.createElement('canvas'); c.width = W; c.height = W;
    const g = c.getContext('2d'), im = g.createImageData(W, W);
    /* A smooth field in all three channels: every cell of the result a
       colour of its own, as a photographic background's are. */
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      im.data[i] = (x * 255 / W + f * 17) & 255; im.data[i + 1] = (y * 255 / W) & 255;
      im.data[i + 2] = ((x + y) * 127 / W + f * 40) & 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    files.push(new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'noise' + f + '.png', { type: 'image/png' }));
  }
  $('fixpal').checked = true;
  if ($('fixgrid')) $('fixgrid').checked = o.grid;
  $('fixforce').value = String(o.px);
  /* Long tasks, for the run only - building the files above is not it. */
  const longs = [];
  const po = new PerformanceObserver(l => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); });
  po.observe({ type: 'longtask' });
  const t0 = performance.now();
  await fixBatch(files);
  await new Promise(r => setTimeout(r, 500));
  po.disconnect();
  return { worst: Math.max(0, ...longs), longs, ms: Math.round(performance.now() - t0), note: ($('fixbatchout') || {}).textContent || '' };
}, o);

test.describe('the palette step beside the engine', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixBatch === 'function');
  });

  test('A FOLDER OF PHOTOGRAPHIC PICTURES does not hold the page for the palette step', async ({ page }) => {
    const r = await run(page, { side: 1280, n: 2, px: 4, grid: true });
    console.log('folder run: ' + JSON.stringify(r));
    expect(r.note, 'the palette step ran').toContain('put on the palette');
    expect(r.worst, 'no task on the page as long as the step').toBeLessThan(200);
  });

  test('WHAT THE WORKER MAKES is exactly what the page\'s own step makes', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const W = 96, d = new Uint8ClampedArray(W * W * 4);
      let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s & 255; };
      for (let i = 0; i < W * W; i++) { d[i * 4] = rnd(); d[i * 4 + 1] = rnd(); d[i * 4 + 2] = rnd(); d[i * 4 + 3] = 255; }
      /* The page's step, on the page. */
      const here = new Uint8ClampedArray(d);
      const hs = snapToPalette(here, W * W);
      /* The same step, in the fixer's worker, with the page's palette. */
      const w = fixWorker();
      const got = await new Promise(res => {
        w.onmessage = (ev) => { if (ev.data.done || ev.data.error) res(ev.data); };
        w.postMessage({ data: new Uint8ClampedArray(d), width: W, height: W, mode: 'fast', forceStep: 1, palette: paletteRGB() });
      });
      w.terminate();
      if (!got.done) return { error: got.error || 'no answer' };
      /* The engine at pixel size 1 hands back the picture it was given, so
         the two can be compared pixel for pixel. */
      const engineOnly = await new Promise(res => {
        const w2 = fixWorker();
        w2.onmessage = (ev) => { if (ev.data.done || ev.data.error) { w2.terminate(); res(ev.data); } };
        w2.postMessage({ data: new Uint8ClampedArray(d), width: W, height: W, mode: 'fast', forceStep: 1, palette: null });
      });
      const onPage = new Uint8ClampedArray(engineOnly.done.data);
      const ps = snapToPalette(onPage, W * W);
      let diff = 0; for (let i = 0; i < onPage.length; i++) if (onPage[i] !== got.done.data[i]) diff++;
      return { diff, worker: got.done.pal && got.done.pal.colours, page: ps.colours, merged: [got.done.pal && got.done.pal.merged, ps.merged] };
    });
    console.log('worker vs page: ' + JSON.stringify(r));
    expect(r.error).toBeUndefined();
    expect(r.diff).toBe(0);
    expect(r.worker).toBe(r.page);
    expect(r.merged[0]).toBe(r.merged[1]);
  });
});
