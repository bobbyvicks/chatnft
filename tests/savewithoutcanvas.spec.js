/* THE FIXER'S SAVED PNG IS ITS CELLS, EXACTLY - WRITTEN WITHOUT A CANVAS (patch623).

   Every save of a fixer result went through a canvas: fixGridCanvas drew the
   cells with drawImage (smoothing off) and toBlob encoded what the GPU had
   drawn - the folder run's finish(), fixResultBytes (Save to project), the
   download, and the recent rail's copy. MEASURED 2026-10-01 BY THE
   CONTROLLING SESSION IN THE OWNER'S CHROME on the live page (65ecad7), with
   the page's own pngDecode on the saved bytes: 2 to 8 pixels per picture
   were off by one from their cell's colour (#000001 beside #000000, #ec8099
   beside #ed8099). putImageData + convertToBlob in a worker left the same
   kind of error, so no canvas path was exact there; a pure encode is. The
   saved picture is now built by nearest mapping in plain arithmetic
   (fixGridPixels - the same rule drawImage used, floor((x+0.5)*W/S)) and
   encoded by the page's own pngEncode (fixGridBytes), in every save path.

   WHAT FAILED BEFORE THIS PATCH, AND WHERE. In the owner's Chrome the
   "every opaque pixel equals its cell" checks below fail by those 2-8
   pixels. Headless Chromium under Playwright may show none of that noise (a
   GPU/driver effect on the owner's machine), so here those checks may have
   passed before the patch too; the control that fails here regardless is
   "the saved bytes are the helper's bytes": before the patch the saved
   bytes were Chrome's encoder's (and the helper did not exist), after they
   are pngEncode's. The pre-patch run on the unpatched copy (004c0d8) in
   headless Chromium is recorded in scratchpad/fix8/round6/patch623/REPORT.txt. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function'
    && typeof fixResultBytes === 'function' && typeof pngDecode === 'function' && typeof pngEncode === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} showPage('fixer', false); });
};

/* A 1280 picture in 16 px blocks - 80 x 80 cells - with hundreds of distinct
   colours (so the vote and the palette have real work), an empty margin, and
   a few blocks split in two colours 8 px apart so size 8 and 16 differ.
   Encoded by the page's own pngEncode, so the bytes are known exactly. */
const draw = (page) => page.evaluate(async () => {
  const W = 1280, d = new Uint8ClampedArray(W * W * 4);
  const put = (x, y, r, g, b) => { const o = (y * W + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; };
  for (let by = 6; by < 74; by++) for (let bx = 6; bx < 74; bx++) {
    const dx = bx - 40, dy = by - 40; if (dx * dx + dy * dy > 34 * 34) continue;
    const r = (bx * 37 + by * 11) & 255, g = (bx * 5 + by * 29) & 255, b = ((bx ^ by) * 17) & 255;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const split = ((bx + by) % 7 === 0) && x >= 8;
      put(bx * 16 + x, by * 16 + y, split ? 255 - r : r, split ? g : 255 - g, b);
    }
  }
  const bytes = await pngEncode(d, W, W);
  window.__png = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
  return window.__png.length;
});

/* Fix the picture at `size` with Save at 1280 `grid` through the single
   path (fixLoad, fixRun, fixResultBytes) and the folder path (fixBatch),
   then measure each saved PNG with the page's own pngDecode against the
   cells fixRun returned. */
const run = (page, o) => page.evaluate(async ({ size, grid }) => {
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
    if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
  set('fixmode', 'fast'); set('fixforce', String(size)); set('fixgrid', grid); set('fixpal', true); set('fixline', false);
  const file = () => fileWithPath(window.__png, 'hats/wip/busy.png');
  const realToast = window.toast; window.toast = () => {};
  try {
    if (!await fixLoad(file())) return { error: document.getElementById('fixout').textContent };
    const r = await fixRun();
    if (!r) return { error: document.getElementById('fixout').textContent };
    const single = await fixResultBytes(r);
    const helper = typeof fixGridBytes === 'function' ? await fixGridBytes(r) : null;
    await fixBatch([file()]);
    const batch = fixBatchFiles[0] ? fixBatchFiles[0].data : null;
    const pal = new Set(paletteList().map(h => h.toLowerCase()));
    const check = async (bytes) => {
      if (!bytes) return { missing: true };
      const p = await pngDecode(bytes);
      const W = r.width, H = r.height, S = p.width, T = p.height;
      let offCell = 0, offPal = 0, badAlpha = 0, opaque = 0; const samples = [];
      for (let y = 0; y < T; y++) {
        const sy = Math.min(H - 1, Math.floor((y + 0.5) * H / T));
        for (let x = 0; x < S; x++) {
          const sx = Math.min(W - 1, Math.floor((x + 0.5) * W / S));
          const o = (y * S + x) * 4, s = (sy * W + sx) * 4, a = p.data[o + 3];
          if (a !== 0 && a !== 255) badAlpha++;
          if (a !== r.data[s + 3]) { offCell++; continue; }
          if (a === 0) continue;
          opaque++;
          if (p.data[o] !== r.data[s] || p.data[o + 1] !== r.data[s + 1] || p.data[o + 2] !== r.data[s + 2]) {
            offCell++; if (samples.length < 4) samples.push([x, y, [p.data[o], p.data[o + 1], p.data[o + 2]], [r.data[s], r.data[s + 1], r.data[s + 2]]]);
          }
          const hex = '#' + [p.data[o], p.data[o + 1], p.data[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
          if (!pal.has(hex)) offPal++;
        }
      }
      return { size: S + 'x' + T, offCell, offPal, badAlpha, opaque, samples };
    };
    const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
    return { cells: r.width + 'x' + r.height, single: await check(single), batch: await check(batch),
      singleIsHelper: same(single, helper), batchIsHelper: same(batch, helper), helper: !!helper,
      said: document.getElementById('fixout').textContent };
  } finally { window.toast = realToast; }
}, o);

test.describe('the fixer\'s saved PNG is its cells, exactly', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); await draw(page); });

  for (const [size, cells] of [[16, '80x80'], [8, '160x160']]) {
    test('AT SIZE ' + size + ', SAVE AT 1280 ON: every opaque pixel is its cell, in the palette, alpha 0 or 255, and the bytes are the helper\'s', async ({ page }) => {
      const r = await run(page, { size, grid: true });
      console.log('size ' + size + ' on: ' + JSON.stringify({ ...r, said: undefined }));
      expect(r.error).toBeUndefined();
      expect(r.cells).toBe(cells);
      for (const path of ['single', 'batch']) {
        const m = r[path];
        expect(m.size, path + ' saved at the collection size').toBe('1280x1280');
        expect(m.opaque, path + ' has opaque pixels').toBeGreaterThan(100000);
        expect(m.offCell, path + ': pixels not their cell\'s colour ' + JSON.stringify(m.samples)).toBe(0);
        expect(m.offPal, path + ': pixels outside the palette').toBe(0);
        expect(m.badAlpha, path + ': pixels with a partial alpha').toBe(0);
      }
      expect(r.helper, 'fixGridBytes exists').toBe(true);
      expect(r.singleIsHelper, 'the single save is the helper\'s bytes').toBe(true);
      expect(r.batchIsHelper, 'the folder save is the helper\'s bytes').toBe(true);
    });

    test('AT SIZE ' + size + ', SAVE AT 1280 OFF: saved at its own size, the same four facts', async ({ page }) => {
      const r = await run(page, { size, grid: false });
      expect(r.error).toBeUndefined();
      expect(r.cells).toBe(cells);
      for (const path of ['single', 'batch']) {
        const m = r[path];
        expect(m.size, path + ' saved at the result\'s own size').toBe(cells);
        expect(m.offCell, path + ': pixels not their cell\'s colour').toBe(0);
        expect(m.offPal, path + ': pixels outside the palette').toBe(0);
        expect(m.badAlpha, path + ': pixels with a partial alpha').toBe(0);
      }
      expect(r.singleIsHelper).toBe(true);
      expect(r.batchIsHelper).toBe(true);
    });
  }

  /* THE INSTRUMENT CAN SAY NO: a byte of the saved picture moved by one is
     seen by the same check that passes above. */
  test('the control: a saved pixel one unit off its cell is counted', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
        if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
      set('fixmode', 'fast'); set('fixforce', '16'); set('fixgrid', true); set('fixpal', true); set('fixline', false);
      const realToast = window.toast; window.toast = () => {};
      try {
        await fixLoad(fileWithPath(window.__png, 'hats/wip/busy.png'));
        const r = await fixRun();
        const bytes = await fixResultBytes(r);
        const p = await pngDecode(bytes);
        /* one opaque pixel nudged by one, re-encoded, measured the same way */
        let i = 0; while (p.data[i + 3] !== 255) i += 4;
        p.data[i] = p.data[i] === 255 ? 254 : p.data[i] + 1;
        const nudged = await pngDecode(await pngEncode(p.data, p.width, p.height));
        let off = 0;
        for (let y = 0; y < 1280; y++) { const sy = Math.floor((y + 0.5) * r.height / 1280);
          for (let x = 0; x < 1280; x++) { const sx = Math.floor((x + 0.5) * r.width / 1280), o = (y * 1280 + x) * 4, s = (sy * r.width + sx) * 4;
            if (nudged.data[o + 3] === 255 && (nudged.data[o] !== r.data[s] || nudged.data[o + 1] !== r.data[s + 1] || nudged.data[o + 2] !== r.data[s + 2])) off++; } }
        return { off };
      } finally { window.toast = realToast; }
    });
    expect(r.off).toBe(1);
  });
});
