/* THE FIXER READS A PNG WITH THE PAGE'S OWN READER, NOT THE BROWSER'S CANVAS (patch623).

   fixDecodeFile decoded every file with createImageBitmap + drawImage +
   getImageData and, for a "plain" PNG with no translucent pixel (pngPlain:
   8-bit, not interlaced, no gAMA/iCCP/sRGB/cHRM before the pixels), HANDED
   THE BROWSER'S PIXELS BACK as how:"png" - "READ ONCE when reading twice
   could change nothing". For every other PNG it ran pngDecode and then
   REFUSED it when it disagreed with the browser on an opaque pixel. Both
   rested on the browser being exact for opaque pixels.

   MEASURED 2026-10-01 BY THE CONTROLLING SESSION IN THE OWNER'S CHROME on the
   live page (65ecad7): for 8-bit RGBA non-interlaced PNGs with no colour
   chunk, the canvas pixels differed from pngDecode's by one unit in one
   channel on a few hundred OPAQUE pixels per picture - Tesseract Bookshelves
   250 of 1,638,400, Dark Skin 98, Blue Party Hat 34; alpha identical. So the
   engine's input was off by one there, and on busy pictures the k-means ties
   flipped: the page's result differed from an exact offline run on 12 of 75
   final-project traits (Tesseract 564 of 6,400 cells, Suburban Sidewalk 192,
   Market Makers Sakura 124, Blue Camo Skin 70). The page itself is
   deterministic (the same file in three batch orders: identical).

   Now a PNG the reader can read is the reader's pixels, by construction
   exact, how:"png"; the browser is consulted for its size only (a reader size
   that differs is still a reason to fall back) and no canvas is drawn. The
   browser decode is the fallback for a non-PNG or a PNG the reader cannot
   read (interlaced, a throw), disclosed as how:"browser" with its why.

   WHAT FAILED BEFORE THIS PATCH, AND WHERE. In the owner's Chrome "the pixels
   are pngDecode's" failed by 34-250 pixels per picture; headless Chromium
   under Playwright may show none of that noise, so there that check can be
   green on the unpatched page. The control that fails regardless is the
   canvas count: before the patch the plain PNG went through getImageData
   once (its pixels WERE that read); after, zero. The JPEG control is the
   positive side of that count. The pre-patch run on the unpatched copy
   (004c0d8) is recorded in scratchpad/fix8/round6/patch623/REPORT.txt. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixDecodeFile === 'function' && typeof pngEncode === 'function' && typeof pngDecode === 'function');
};

/* A busy plain PNG: 1280 x 1280, every pixel a colour of its position
   (thousands of distinct colours), opaque except a transparent band, encoded
   by the page's own pngEncode (8-bit RGBA, no colour chunk - pngPlain's case). */
const busy = (page) => page.evaluate(async () => {
  const W = 1280, d = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    d[o] = (x * 7 + y) & 255; d[o + 1] = (x ^ y) & 255; d[o + 2] = ((x * y) >> 4) & 255;
    d[o + 3] = (y >= 600 && y < 680) ? 0 : 255;
  }
  const bytes = await pngEncode(d, W, W);
  window.__busy = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
  const ref = await pngDecode(window.__busy);
  const colours = new Set();
  for (let o = 0; o < ref.data.length; o += 4) if (ref.data[o + 3]) colours.add((ref.data[o] << 16) | (ref.data[o + 1] << 8) | ref.data[o + 2]);
  return { bytes: window.__busy.length, colours: colours.size, plain: typeof pngPlain === 'function' ? pngPlain(window.__busy) : null };
});

/* fixDecodeFile on a file, with the canvas reads counted: every
   getImageData on any 2d context while it runs. */
const decode = (page, kind) => page.evaluate(async (kind) => {
  let file;
  if (kind === 'png') file = new File([window.__busy], 'busy.png', { type: 'image/png' });
  else if (kind === 'gama') {
    const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
    const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const body = new Uint8Array([103, 65, 77, 65, 0, 0, 177, 143]), c = crc(body);
    const chunk = new Uint8Array([0, 0, 0, 4, ...body, c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]);
    file = new File([new Uint8Array([...window.__busy.slice(0, 33), ...chunk, ...window.__busy.slice(33)])], 'busy-gama.png', { type: 'image/png' });
  } else {
    const c = document.createElement('canvas'); c.width = 96; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#c85368'; g.fillRect(0, 0, 96, 64); g.fillStyle = '#2a6f97'; g.fillRect(10, 10, 40, 30);
    file = new File([await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))], 'x.jpg', { type: 'image/jpeg' });
  }
  const proto = CanvasRenderingContext2D.prototype, real = proto.getImageData; let reads = 0;
  proto.getImageData = function (...a) { reads++; return real.apply(this, a); };
  let dec;
  try { dec = await fixDecodeFile(file); } finally { proto.getImageData = real; }
  if (!dec) return { none: true, reads };
  let off = 0;
  if (kind !== 'jpeg') {
    const ref = await pngDecode(new Uint8Array(await file.arrayBuffer()));
    for (let i = 0; i < ref.data.length; i++) if (dec.data[i] !== ref.data[i]) off++;
  }
  return { how: dec.how, why: dec.why, w: dec.width, h: dec.height, reads, off, len: dec.data.length };
}, kind);

test.describe('reading a picture for Fix pixels, without a canvas', () => {
  test.setTimeout(120000);
  let pic;
  test.beforeEach(async ({ page }) => { await ready(page); pic = await busy(page); });

  test('A BUSY PLAIN PNG IS PNGDECODE\'S PIXELS, EXACTLY, read by the page and not through a canvas', async ({ page }) => {
    expect(pic.colours, 'thousands of distinct colours').toBeGreaterThan(5000);
    const r = await decode(page, 'png');
    console.log('plain: ' + JSON.stringify({ ...r, pic }));
    expect(r.how).toBe('png');
    expect(r.why).toBe('');
    expect([r.w, r.h]).toEqual([1280, 1280]);
    expect(r.off, 'bytes that differ from pngDecode\'s').toBe(0);
    expect(r.reads, 'getImageData calls while reading a PNG the page can read').toBe(0);
  });

  test('and a colour-managed PNG is read the same way - the browser is no longer the judge of the reader', async ({ page }) => {
    const r = await decode(page, 'gama');
    expect(r.how).toBe('png');
    expect(r.off).toBe(0);
    expect(r.reads).toBe(0);
  });

  test('the control: a JPEG still decodes, by the browser, and says so', async ({ page }) => {
    const r = await decode(page, 'jpeg');
    expect(r.how).toBe('browser');
    expect(r.why).toBe('not a PNG');
    expect([r.w, r.h]).toEqual([96, 64]);
    expect(r.len).toBe(96 * 64 * 4);
    expect(r.reads, 'the browser path is the canvas read').toBe(1);
  });
});
