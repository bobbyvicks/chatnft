/* A PNG IS READ BY THE PAGE'S READER, ONCE, AND NOT THROUGH THE CANVAS.

   SUPERSEDED (patch623, 2026-10-01). This spec pinned "A PLAIN PNG WITH NO
   TRANSLUCENT PIXEL IS READ ONCE": fixDecodeFile handed back the BROWSER'S
   pixels for a plain opaque PNG (reads of pngDecode: 0) on the reasoning that
   a second read "changes nothing for a file with no translucent pixel". That
   premise was measured false in the owner's Chrome on 2026-10-01 by the
   controlling session: the canvas pixels differed from pngDecode's by one
   unit in one channel on a few hundred OPAQUE pixels per picture (Tesseract
   Bookshelves 250 of 1,638,400; Dark Skin 98; Blue Party Hat 34), and busy
   pictures then fixed differently (12 of 75 final-project traits). Headless
   Chromium may show none of that noise, which is why this spec was green
   while the page was wrong. The reader is now the only source of a PNG's
   pixels and the browser is asked for its size alone, so the counts are the
   other way round: pngDecode once per PNG, getImageData never. A non-PNG
   still goes to the browser. The run against the unpatched page (004c0d8) is
   recorded in scratchpad/fix8/round6/patch623/REPORT.txt. */
import { test, expect } from '@playwright/test';

/* PNG files made with the page's own encoder: 8-bit RGBA, no extra chunks. */
const run = (page, o) => page.evaluate(async (o) => {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const files = [];
  for (let f = 0; f < o.n; f++) {
    const W = 64, d = new Uint8ClampedArray(W * W * 4);
    for (let p = 0; p < W * W; p++) {
      const i = p * 4, on = ((p % W) + f) % 5 !== 0;
      d[i] = (p * 7 + f * 31) & 255; d[i + 1] = (p * 3) & 255; d[i + 2] = (f * 40) & 255;
      d[i + 3] = on ? 255 : 0;
      if (o.translucent && p === 100) d[i + 3] = 128;
    }
    let bytes = await pngEncode(d, W, W);
    if (bytes instanceof Blob) bytes = new Uint8Array(await bytes.arrayBuffer());
    if (o.gama) {
      const body = new Uint8Array([103, 65, 77, 65, 0, 0, 177, 143]);
      const c = crc(body);
      const chunk = new Uint8Array([0, 0, 0, 4, ...body, c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]);
      bytes = new Uint8Array([...bytes.slice(0, 33), ...chunk, ...bytes.slice(33)]);
    }
    if (o.jpeg) {
      const c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d'), im = g.createImageData(W, W); im.data.set(d); g.putImageData(im, 0, 0);
      files.push(new File([await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))], 'f' + f + '.jpg', { type: 'image/jpeg' }));
      continue;
    }
    files.push(new File([bytes], 'f' + f + '.png', { type: 'image/png' }));
  }
  let reads = 0, canvas = 0;
  const real = pngDecode;
  pngDecode = async (...a) => { reads++; return real(...a); };
  const proto = CanvasRenderingContext2D.prototype, realGet = proto.getImageData;
  proto.getImageData = function (...a) { canvas++; return realGet.apply(this, a); };
  const out = [];
  try { for (const f of files) out.push(await fixDecodeFile(f)); } finally { pngDecode = real; proto.getImageData = realGet; }
  /* The reader's own answer, for comparison. */
  let same = true;
  if (!o.jpeg) for (let i = 0; i < files.length; i++) {
    const ref = await real(new Uint8Array(await files[i].arrayBuffer()));
    const a = out[i].data;
    for (let k = 0; k < a.length; k++) if (a[k] !== ref.data[k]) { same = false; break; }
  }
  return { reads, canvas, same, how: out.map(r => r.how).join(','), w: out.map(r => r.width).join(',') };
}, o);

test.describe('reading a picture for Fix pixels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixDecodeFile === 'function' && typeof pngEncode === 'function');
  });

  test('TWENTY OPAQUE FILES are each read by the reader once', async ({ page }) => {
    const r = await run(page, { n: 20 });
    expect(r.reads).toBe(20);
    expect(r.how).toBe(Array(20).fill('png').join(','));
  });

  test('AND NOT THROUGH THE CANVAS: no getImageData for any of them', async ({ page }) => {
    const r = await run(page, { n: 20 });
    expect(r.canvas).toBe(0);
  });

  test('the control: what they read is the reader\'s own answer, byte for byte', async ({ page }) => {
    const r = await run(page, { n: 20 });
    expect(r.same).toBe(true);
  });

  test('the control: a file with a translucent pixel, the same', async ({ page }) => {
    const r = await run(page, { n: 1, translucent: true });
    expect(r).toEqual({ reads: 1, canvas: 0, same: true, how: 'png', w: '64' });
  });

  test('the control: a colour-managed file, the same - the browser no longer judges the reader', async ({ page }) => {
    const r = await run(page, { n: 1, gama: true });
    expect(r).toEqual({ reads: 1, canvas: 0, same: true, how: 'png', w: '64' });
  });

  test('the control: a JPEG is the browser\'s, and the one canvas read', async ({ page }) => {
    const r = await run(page, { n: 1, jpeg: true });
    expect(r.reads).toBe(0);
    expect(r.canvas).toBe(1);
    expect(r.how).toBe('browser');
    expect(r.w).toBe('64');
  });
});
