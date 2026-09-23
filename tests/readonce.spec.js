/* A PLAIN PNG WITH NO TRANSLUCENT PIXEL IS READ ONCE.

   fixDecodeFile read every file with the browser and again with the page's
   own PNG reader, which is 80% of the cost and changes nothing for a file
   with no translucent pixel. RUN AGAINST THE PAGE BEFORE THE FIX: the
   first test went red with the reader run on all twenty opaque files. The
   rest are controls: the pixels are the reader's own, byte for byte; a
   translucent file is still read both ways; and so is a colour-managed
   one, where the two can disagree and the run has to say so. */
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
    files.push(new File([bytes], 'f' + f + '.png', { type: 'image/png' }));
  }
  let reads = 0;
  const real = pngDecode;
  pngDecode = async (...a) => { reads++; return real(...a); };
  const out = [];
  try { for (const f of files) out.push(await fixDecodeFile(f)); } finally { pngDecode = real; }
  /* The reader's own answer, for comparison. */
  let same = true;
  for (let i = 0; i < files.length; i++) {
    const ref = await real(new Uint8Array(await files[i].arrayBuffer()));
    const a = out[i].data;
    for (let k = 0; k < a.length; k++) if (a[k] !== ref.data[k]) { same = false; break; }
  }
  return { reads, same, how: out.map(r => r.how).join(',') };
}, o);

test.describe('reading a picture for Fix pixels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixDecodeFile === 'function' && typeof pngEncode === 'function');
  });

  test('TWENTY OPAQUE FILES are read once each, not twice', async ({ page }) => {
    const r = await run(page, { n: 20 });
    expect(r.reads).toBe(0);
  });

  test('the control: and what they read is the reader\'s own answer, byte for byte', async ({ page }) => {
    const r = await run(page, { n: 20 });
    expect(r.same).toBe(true);
  });

  test('the control: a file with a translucent pixel is still read both ways', async ({ page }) => {
    const r = await run(page, { n: 1, translucent: true });
    expect(r.reads).toBe(1);
    expect(r.how).toBe('png');
  });

  test('the control: a colour-managed file is still read both ways', async ({ page }) => {
    const r = await run(page, { n: 1, gama: true });
    expect(r.reads).toBe(1);
  });
});
