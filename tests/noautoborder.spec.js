/* SAVING A FINISHED TRAIT NO LONGER REPAINTS ITS EDGE BLACK.

   "look at the way it had saved the black border ... do we have a auto border
   option on? if so turn that off"

   There was no option. traitCanvas asserted the collection's black border on
   every save: every opaque pixel touching empty space set to pure black, one
   CANVAS pixel wide. That rule was written when a trait canvas was its own
   resolution, where one canvas pixel is one art pixel; every trait is 1280
   now and drawn in blocks of eight or ten, so it painted an eighth of an art
   pixel over an outline the artist had already drawn.

   Measured by opening clothing/Exit Liquidity Red Hood Up and saving it
   straight back, nothing else touched: 1163 pixels turned black, none of them
   on the art's own grid. After: none.

   THE RULE ITSELF IS NOT GONE. Its other caller is the extraction pipeline,
   where a trait is cut out of a rendered character and an anti-aliased export
   leaves a pale rim - which is what asserting black removes, and where the
   decision that it must not become a checkbox was recorded. That is a
   different call site and it is untouched.
*/
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const CLOTHING = 'E:/X content/pixel art_/APPROVED TRAITS - WEBSITE UPLOAD/clothing';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof saveTrait === 'function');
};

/* Put a picture on the shelf, open it the way the shelf does, save it back,
   and hand back both sets of pixels. */
const roundTrip = (page, b64, name) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const bin = atob(o.b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const blob = new Blob([u], { type: 'image/png' });

  const read = async (b) => {
    const bm = await createImageBitmap(b);
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bm, 0, 0); if (bm.close) bm.close();
    const W = c.width, H = c.height;
    const d = g.getImageData(0, 0, W, H).data;
    c.width = 1; c.height = 1;
    return { d, W, H };
  };
  const darkCount = (o2) => {
    let n = 0;
    for (let i = 0; i < o2.d.length; i += 4) {
      if (o2.d[i + 3] <= 8) continue;
      if (o2.d[i] < 40 && o2.d[i + 1] < 40 && o2.d[i + 2] < 40) n++;
    }
    return n;
  };

  const src = await read(blob);
  await dbPut({ id: 't_Probe_clothing_approved', kind: 'trait', name: 'Probe',
    layer: 'clothing', status: 'approved', blob, w: src.W, h: src.H, at: Date.now() });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['clothing', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
  const rec = (await dbAll()).find(x => x.kind === 'trait');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 250));
  const block = gridBlock;

  const realToast = window.toast;
  let said = '';
  window.toast = (m) => { said += String(m) + ' | '; };
  let ok; try { ok = await saveTrait(); } finally { window.toast = realToast; }
  if (!ok) throw new Error('the save was refused: ' + said);

  const out = (await dbAll()).find(x => x.kind === 'trait' && x.name === 'Probe');
  const got = await read(out.blob);

  /* Pixel for pixel, not byte for byte - a re-encode is allowed to differ. */
  let differs = 0;
  if (got.W === src.W && got.H === src.H) {
    for (let i = 0; i < src.d.length; i++) if (src.d[i] !== got.d[i]) { differs++; }
  } else differs = -1;

  return { block, said,
    size: got.W + 'x' + got.H, srcSize: src.W + 'x' + src.H,
    darkBefore: darkCount(src), darkAfter: darkCount(got), differs };
}, { b64, name });

test('A TRAIT OPENED AND SAVED WITH NOTHING TOUCHED COMES BACK UNCHANGED',
  async ({ page }) => {
    const file = path.join(CLOTHING, 'Exit Liquidity Red Hood Up.png');
    test.skip(!fs.existsSync(file), 'the approved traits folder is not on this machine');
    await ready(page);
    const r = await roundTrip(page, fs.readFileSync(file).toString('base64'),
      'Exit Liquidity Red Hood Up.png');
    /* The editor read the art as 8px blocks, which is what made the one-pixel
       border an eighth of a pixel. */
    expect(r.block, 'the art is drawn in 8px blocks').toBe(8);
    expect(r.size).toBe(r.srcSize);
    /* WAS 1163 pixels turned black. */
    expect(r.darkAfter, 'no black was added').toBe(r.darkBefore);
    expect(r.differs, 'and nothing at all changed').toBe(0);
    /* And it does not announce a border it did not draw. */
    expect(r.said).not.toContain("border rule");
  });

test('and the rule is still there, for the path that asked for it',
  async ({ page }) => {
    await ready(page);
    /* THE CONTROL. Deleting blackenEdge would pass the test above and would
       take the pale-rim cleanup out of the extraction pipeline with it - the
       one place that decided, in writing, that it must not be switchable. */
    const r = await page.evaluate(() => {
      const W = 40, d = new Uint8ClampedArray(W * W * 4);
      /* A solid square of mid grey, opaque, with transparent margins. */
      for (let y = 8; y < 32; y++) for (let x = 8; x < 32; x++) {
        const i = (y * W + x) * 4;
        d[i] = 150; d[i + 1] = 150; d[i + 2] = 150; d[i + 3] = 255;
      }
      const before = d.slice();
      const n = blackenEdge(d, W, W);
      /* The corner of the square: was grey, is black. */
      const i = (8 * W + 8) * 4;
      return { n, wasGrey: before[i] === 150, nowBlack: d[i] === 0 && d[i + 3] === 255,
        inPipeline: String(window.__pipelineSrc || '') };
    });
    expect(r.n, 'it still finds and paints a ring').toBeGreaterThan(0);
    expect(r.wasGrey).toBe(true);
    expect(r.nowBlack, 'and black is still what it paints').toBe(true);
  });

test('and the save path does not call it any more', async ({ page }) => {
  await ready(page);
  /* Said as a property of the code rather than of one picture: a trait whose
     outer ring is already black would come back unchanged either way, so a
     pixel test alone cannot tell "the rule was removed from the save" from
     "this trait did not need it". */
  const r = await page.evaluate(() => ({
    save: String(traitCanvas),
    pipeline: document.documentElement.innerHTML
      .indexOf('stats.edgeBlacked=blackenEdge(t,W,H);') >= 0,
  }));
  expect(r.save, 'the save does not repaint the edge').not.toContain('blackenEdge');
  expect(r.save, 'and still reports a count for the message to read')
    .toContain('out.edgeChanged=0');
  expect(r.pipeline, 'while the extraction pipeline still applies it').toBe(true);
});
