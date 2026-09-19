/* PNG BYTES ARE READ AND WRITTEN WITHOUT THE BROWSER'S CANVAS.

   The fixer used to take its pixels from the browser's canvas, which
   premultiplies alpha and rounds it back, so a translucent pixel's colour
   changed on the way in (4,230 of Solana Hue Skin's 569,572, measured by
   the review) and scale mode could not keep "the bytes that came in are
   the bytes that go out". The page reads PNG bytes itself now, checked
   against the browser wherever the browser is exact, and writes scale-mode
   saves from the raw pixels.

   The PNGs here are built in node (every colour type, several depths, the
   five filters in turn, tRNS), so what the page decodes is compared with
   what was put in, not with another decoder's opinion. */
import { test, expect } from '@playwright/test';
import zlib from 'zlib';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PNG } = require('E:/X content/sprout-github/node_modules/pngjs');

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CRCT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (u8) => { let c = -1; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
/* A PNG of any colour type and depth, rows filtered 0,1,2,3,4 in turn. */
const build = (W, H, ctype, depth, pixel, plte, trns) => {
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const stride = Math.ceil(W * chans * depth / 8), bpp = Math.max(1, (chans * depth) >> 3);
  const rows = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = pixel(x, y);
    for (let k = 0; k < chans; k++) {
      const v = s[k], i = x * chans + k;
      if (depth === 8) rows[y * stride + i] = v;
      else if (depth === 16) { rows[y * stride + i * 2] = v >> 8; rows[y * stride + i * 2 + 1] = v & 255; }
      else { const bit = i * depth; rows[y * stride + (bit >> 3)] |= v << (8 - depth - (bit & 7)); }
    }
  }
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    const f = y % 5; raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const x = rows[y * stride + i], a = i >= bpp ? rows[y * stride + i - bpp] : 0, b = y ? rows[(y - 1) * stride + i] : 0, c = (y && i >= bpp) ? rows[(y - 1) * stride + i - bpp] : 0;
      let p; if (f === 0) p = 0; else if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1; else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      raw[y * (stride + 1) + 1 + i] = (x - p) & 255;
    }
  }
  const chunk = (type, body) => { const c = Buffer.alloc(12 + body.length); c.writeUInt32BE(body.length, 0); c.write(type, 4, 'ascii'); body.copy(c, 8); c.writeUInt32BE(crc32(c.subarray(4, 8 + body.length)), 8 + body.length); return c; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = depth; ihdr[9] = ctype;
  const parts = [Buffer.from(SIG), chunk('IHDR', ihdr)];
  if (plte) parts.push(chunk('PLTE', Buffer.from(plte)));
  if (trns) parts.push(chunk('tRNS', Buffer.from(trns)));
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
};

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof pngDecode === 'function' && typeof fixScaledBytes === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};
const b64 = (buf) => Buffer.from(buf).toString('base64');
/* decode in the page and hand the RGBA back */
const decodeInPage = (page, buf) => page.evaluate(async (s) => {
  const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const d = await pngDecode(u8);
  return { w: d.width, h: d.height, type: d.type, depth: d.depth, data: Array.from(d.data) };
}, b64(buf));

/* 30x42 translucent picture: colour under alpha 0 (which must come back as
   0), a run of alphas 1..254, and opaque pixels. NEITHER SIDE DIVIDES 1280:
   with a whole factor the corner rule and the centre rule pick the same
   source pixel for every output pixel, and a mutant that sampled the corner
   survived the first draft of this test (40 wide, 1280/40 = 32). */
const W = 30, H = 42;
const pix = (x, y) => {
  const a = (x + y) % 7 === 0 ? 0 : ((x + y) % 3 === 0 ? 1 + ((x * 13 + y * 29) % 254) : 255);
  return [(x * 37 + y * 11) & 255, (x * 7 + y * 91) & 255, (x * y + 5) & 255, a];
};
const wantRGBA = () => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = pix(x, y); out.push(...(p[3] === 0 ? [0, 0, 0, 0] : p)); } return out; };

test.describe('PNG bytes', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('EVERY COLOUR TYPE AND FILTER DECODES TO WHAT WAS WRITTEN', async ({ page }) => {
    const rgba = await decodeInPage(page, build(W, H, 6, 8, pix));
    expect([rgba.w, rgba.h, rgba.type, rgba.depth]).toEqual([30, 42, 6, 8]);
    expect(rgba.data).toEqual(wantRGBA());
    /* RGB with a colour key */
    const rgb = (x, y) => [(x * 5) & 255, (y * 9) & 255, ((x ^ y) * 3) & 255];
    const key = rgb(2, 3);
    const d2 = await decodeInPage(page, build(W, H, 2, 8, rgb, null, [0, key[0], 0, key[1], 0, key[2]]));
    const want2 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = rgb(x, y); const hit = c[0] === key[0] && c[1] === key[1] && c[2] === key[2]; want2.push(...(hit ? [0, 0, 0, 0] : [c[0], c[1], c[2], 255])); }
    expect(d2.data).toEqual(want2);
    /* 4-bit palette with per-index alpha, 1-bit gray, 16-bit gray+alpha, 2-bit gray */
    const plte = []; for (let i = 0; i < 16; i++) plte.push(i * 16, 255 - i * 16, (i * 37) & 255);
    const d3 = await decodeInPage(page, build(W, H, 3, 4, (x, y) => [(x + y) & 15], plte, [0, 40, 255]));
    const want3 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (x + y) & 15, a = k === 0 ? 0 : k === 1 ? 40 : 255; want3.push(...(a === 0 ? [0, 0, 0, 0] : [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], a])); }
    expect(d3.data).toEqual(want3);
    const d0 = await decodeInPage(page, build(W, H, 0, 1, (x, y) => [(x + y) & 1]));
    const want0 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = (x + y) & 1 ? 255 : 0; want0.push(v, v, v, 255); }
    expect(d0.data).toEqual(want0);
    const d4 = await decodeInPage(page, build(W, H, 4, 16, (x, y) => [(x * 1000 + y) & 65535, (y * 3000 + x) & 65535]));
    const want4 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const g = ((x * 1000 + y) & 65535) >> 8, a = ((y * 3000 + x) & 65535) >> 8; want4.push(...(a === 0 ? [0, 0, 0, 0] : [g, g, g, a])); }
    expect(d4.data).toEqual(want4);
    const d02 = await decodeInPage(page, build(W, H, 0, 2, (x, y) => [(x + y) & 3]));
    const want02 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Math.round(((x + y) & 3) * 255 / 3); want02.push(v, v, v, 255); }
    expect(d02.data).toEqual(want02);
  });

  test('THE PAGE READS A TRANSLUCENT PICTURE EXACTLY, and the browser is the check on the rest', async ({ page }) => {
    const r = await page.evaluate(async (s) => {
      const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const realToast = window.toast; window.toast = () => {};
      await fixLoad(new File([u8], 'tl.png', { type: 'image/png' }));
      window.toast = realToast;
      return { how: FIX.decode, why: FIX.decodeWhy, data: Array.from(FIX.src.data), translucent: FIX.translucent.count };
    }, b64(build(W, H, 6, 8, pix)));
    expect(r.how, 'read by the page, and the browser agreed everywhere it is exact').toBe('png');
    expect(r.translucent).toBeGreaterThan(100);
    expect(r.data, 'the pixels are the file\'s, translucent ones included').toEqual(wantRGBA());
    /* a picture that is not a PNG goes to the browser and says why */
    const j = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const g = c.getContext('2d'); g.fillStyle = '#c85368'; g.fillRect(0, 0, 32, 32);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
      const realToast = window.toast; window.toast = () => {};
      await fixLoad(new File([blob], 'x.jpg', { type: 'image/jpeg' }));
      window.toast = realToast;
      return { how: FIX.decode, why: FIX.decodeWhy, w: FIX.src.width };
    });
    expect(j).toEqual({ how: 'browser', why: 'not a PNG', w: 32 });
  });

  test('SCALE MODE SAVES EVERY VISIBLE PIXEL AS THE BYTE IT CAME IN, at its size and at 1280', async ({ page }) => {
    const r = await page.evaluate(async (s) => {
      const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const realToast = window.toast; window.toast = () => {};
      await fixLoad(new File([u8], 'tl.png', { type: 'image/png' }));
      document.getElementById('fixmode').value = 'scale';
      document.getElementById('fixpal').checked = false;
      const gr = document.getElementById('fixgrid');
      gr.checked = false; gr.dispatchEvent(new Event('change', { bubbles: true }));
      const own = await fixRun();
      const ownSaid = document.getElementById('fixout').textContent;
      const ownBytes = Array.from(await fixResultBytes(own));
      gr.checked = true; gr.dispatchEvent(new Event('change', { bubbles: true }));
      const big = await fixRun();
      const bigBytes = Array.from(await fixResultBytes(big));
      /* the canvas path, for the opaque-pixel comparison of the enlargement rule */
      const c = fixGridCanvas(big);
      const canvasPx = Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
      c.width = 1; c.height = 1;
      window.toast = realToast;
      return { ownSaid, ownBytes, bigBytes, canvasPx, cells: own.width };
    }, b64(build(W, H, 6, 8, pix)));
    expect(r.cells).toBe(30);
    expect(r.ownSaid).toMatch(/translucent pixels are kept exactly, byte for byte/);
    expect(r.ownSaid).not.toContain('not byte-exact');
    /* decoded in node by pngjs, the save is the source, visible pixel for visible pixel */
    const own = PNG.sync.read(Buffer.from(r.ownBytes));
    expect([own.width, own.height]).toEqual([30, 42]);
    expect(Array.from(own.data)).toEqual(wantRGBA());
    /* at 1280: each output pixel is the source pixel under its centre */
    const big = PNG.sync.read(Buffer.from(r.bigBytes));
    expect([big.width, big.height]).toEqual([1280, 1280]);
    const want = wantRGBA();
    let wrong = 0, canvasWrong = 0;
    for (let y = 0; y < 1280; y++) {
      const sy = Math.min(H - 1, Math.floor((y + 0.5) * H / 1280));
      for (let x = 0; x < 1280; x++) {
        const sx = Math.min(W - 1, Math.floor((x + 0.5) * W / 1280));
        const s = (sy * W + sx) * 4, d = (y * 1280 + x) * 4;
        for (let k = 0; k < 4; k++) if (big.data[d + k] !== want[s + k]) { wrong++; break; }
        /* the canvas agrees wherever it is exact: alpha everywhere, colour at alpha 255 */
        if (r.canvasPx[d + 3] !== want[s + 3] || (want[s + 3] === 255 && (r.canvasPx[d] !== want[s] || r.canvasPx[d + 1] !== want[s + 1] || r.canvasPx[d + 2] !== want[s + 2]))) canvasWrong++;
      }
    }
    expect(wrong, 'pixels of the 1280 save that are not the source pixel under their centre').toBe(0);
    expect(canvasWrong, 'and the canvas path lands on the same source pixels, so the rule is the browser\'s').toBe(0);
  });

  test('and a folder run in scale mode says the translucent pixels were kept exactly', async ({ page }) => {
    const note = await page.evaluate(async (s) => {
      const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      document.getElementById('fixmode').value = 'scale';
      document.getElementById('fixpal').checked = false;
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([new File([u8], 'a.png', { type: 'image/png' }), new File([u8], 'b.png', { type: 'image/png' })]);
      window.toast = realToast;
      const out = PNG_SIG; // the page's own constant, proving the batch bytes are PNGs is done below
      return { note: document.getElementById('fixbatchout').textContent, first: Array.from(fixBatchFiles[0].data.subarray(0, 8)), sig: out };
    }, b64(build(W, H, 6, 8, pix)));
    expect(note.note).toMatch(/2 had translucent pixels \([\d,]+ in all\), kept exactly, byte for byte/);
    expect(note.note).not.toContain('read by the browser');
    expect(note.first).toEqual(note.sig);
  });
});
