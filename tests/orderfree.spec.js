/* A FOLDER RUN GIVES THE SAME PICTURE IN ANY ORDER, AND THE SAME AS A SINGLE RUN.

   The engine's k-means draws from a process-global random generator the
   reference never seeds, and a folder run keeps one Worker for the whole
   batch. So the same trait with the same settings saved as a different
   picture depending on what came before it in the folder, and differed
   from the single-image run of the same file. Measured through this page
   on 2026-09-18 with nine real gridless traits, pixel size 8, Save at
   1280 on, Colours to palette on:

     batch forward vs batch reverse    8 of 9 differ, up to 1,662 of 25,600 cells
     batch vs the single-image run     7 of 9 differ
     the batch note itself             "25604 colours moved" vs "25620"
     alpha differences                 0

   No existing test could see it: every batch fixture in the suite is flat
   block art, whose cells no label vote can move.

   THE FIXTURE PROVES ITS OWN SENSITIVITY. "Gridless" is not enough - some
   gridless traits never differ - so the last test builds an engine copy
   from the page's own text with the reset removed and shows this picture
   DOES differ under it. Without that, an insensitive fixture would pass
   with or without the fix. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Two gradient blobs with texture and mild noise, no pixel grid, integer
   arithmetic only. Seeds 7 and 11; 11 is the one measured to move 12,086
   cells when it runs after another picture. */
const blob = (seed) => `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  let s = ${seed} >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push({ x: 300 + (rnd() % 680), y: 300 + (rnd() % 680), r: 120 + (rnd() % 260), t: rnd() & 3 });
  const noise = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) noise[i] = rnd() & 31;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let inside = false, tint = 0;
    for (const b of blobs) { const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy <= b.r * b.r) { inside = true; tint ^= (b.t + 1); } }
    if (!inside) continue;
    const i = (y * W + x) * 4, n = noise[y * W + x];
    const band = ((x + y) / 40 | 0) & 1 ? 20 : 0;
    d[i] = Math.min(255, 40 + ((x * 160 / W) | 0) + n + band + tint * 30);
    d[i + 1] = Math.min(255, 30 + ((y * 170 / W) | 0) + (n >> 1) + (tint & 1) * 50);
    d[i + 2] = Math.min(255, 90 + (((x + y) * 120 / (2 * W)) | 0) + (n >> 2) + (tint & 2) * 40);
    d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;

const setup = (page) => page.evaluate(async ({ a, b }) => {
  const file = async (src, name) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    return new File([blob], name, { type: 'image/png' });
  };
  window.__A = await file(a, 'a.png');
  window.__B = await file(b, 'b.png');
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  document.getElementById('fixpal').checked = true;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
  window.__hash = async (bytes) => {
    const bm = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const w = bm.width, h = bm.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let x = 2166136261 >>> 0;
    for (let i = 0; i < d.length; i++) { x ^= d[i]; x = Math.imul(x, 16777619) >>> 0; }
    c.width = 1; c.height = 1;
    return w + 'x' + h + ':' + x;
  };
  return { a: window.__A.size, b: window.__B.size };
}, { a: blob(7), b: blob(11) });

test.describe('a folder run is the same in any order', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('TWO ORDERS AND THE SINGLE RUN GIVE ONE PICTURE', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      const run = async (files) => {
        await fixBatch(files);
        const out = {};
        for (const f of fixBatchFiles) out[f.name] = await window.__hash(f.data);
        return { out, note: document.getElementById('fixbatchout').textContent };
      };
      const fwd = await run([window.__A, window.__B]);
      const rev = await run([window.__B, window.__A]);
      /* and B on its own, the way the single tab saves it */
      await fixLoad(window.__B);
      const single = await fixRun();
      const c = fixGridCanvas(single);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      const one = await window.__hash(new Uint8Array(await blob.arrayBuffer()));
      window.toast = realToast;
      return { fwd, rev, one, names: Object.keys(fwd.out) };
    });
    expect(r.names.length).toBe(2);
    for (const n of r.names) expect(r.fwd.out[n], n + ' is the same picture in both orders').toBe(r.rev.out[n]);
    const bName = r.names.find(n => n.indexOf('b-') === 0 || n.indexOf('b.') === 0 || /(^|\/)b-fixed\.png$/.test(n));
    expect(bName, 'the second fixture is in the batch').toBeTruthy();
    expect(r.fwd.out[bName], 'and equals its own single-image run').toBe(r.one);
    /* the note, which the page itself computes, agrees with itself */
    expect(r.fwd.note.replace(/done in [\d.]+s/, 'done'), 'the batch note is the same in both orders')
      .toBe(r.rev.note.replace(/done in [\d.]+s/, 'done'));
  });

  test('and without the reset the second picture depends on the first - the control', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async () => {
      let text = document.getElementById('pfcore').textContent;
      const needle = 'PF.setRNGSeed(0xffffffff);';
      const n = text.split(needle).length - 1;
      if (n !== 1) throw new Error('reset line found ' + n + ' times');
      const mutant = text.replace(needle, '');
      // eslint-disable-next-line no-new-func
      const PFm = new Function('globalThis', mutant + '\nreturn globalThis.PF;')({});
      // eslint-disable-next-line no-new-func
      const PFs = new Function('globalThis', text + '\nreturn globalThis.PF;')({});
      const pixels = async (file) => {
        const bm = await createImageBitmap(file);
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
        const d = g.getImageData(0, 0, bm.width, bm.height).data; c.width = 1; c.height = 1; return d;
      };
      const A = await pixels(window.__A), B = await pixels(window.__B);
      const cells = (p, q) => { let k = 0; for (let i = 0; i < p.data.length; i += 4) { if (!p.data[i + 3] && !q.data[i + 3]) continue; if (p.data[i] !== q.data[i] || p.data[i + 1] !== q.data[i + 1] || p.data[i + 2] !== q.data[i + 2] || p.data[i + 3] !== q.data[i + 3]) k++; } return k; };
      /* mutant: B fresh, then B after A */
      PFm.setRNGSeed(0xffffffff);
      const bFresh = PFm.process(new Uint8ClampedArray(B), 1280, 1280, { forceStep: 8 });
      PFm.setRNGSeed(0xffffffff);
      PFm.process(new Uint8ClampedArray(A), 1280, 1280, { forceStep: 8 });
      const bAfter = PFm.process(new Uint8ClampedArray(B), 1280, 1280, { forceStep: 8 });
      /* shipped: the same sequence */
      const sFresh = PFs.process(new Uint8ClampedArray(B), 1280, 1280, { forceStep: 8 });
      PFs.process(new Uint8ClampedArray(A), 1280, 1280, { forceStep: 8 });
      const sAfter = PFs.process(new Uint8ClampedArray(B), 1280, 1280, { forceStep: 8 });
      return { mutantMoved: cells(bFresh, bAfter), shippedMoved: cells(sFresh, sAfter), sameFresh: cells(bFresh, sFresh) };
    });
    expect(r.mutantMoved, 'the fixture is sensitive: without the reset it moves').toBeGreaterThan(1000);
    expect(r.shippedMoved, 'with the reset it does not').toBe(0);
    expect(r.sameFresh, 'and a fresh run is the same with or without the reset').toBe(0);
  });
});
