/* A minimal PNG decoder: file bytes -> {d: Uint8Array(w*h*4), w, h}, RGBA.

   Why not pngjs: nothing is installed next to this port (pf-port/ holds no
   node_modules) and the job vendors nothing, so this uses only node's zlib.

   What it must equal: the reference's input, which is
     np.array(Image.open(path).convert("RGBA"))
   (tools/oracle/py-decode-hash.py prints the sha256 of exactly that, and
   test-oracle-full.cjs --decode compares it with ours for every image). PIL
   does no colour management on convert(): gAMA / iCCP / sRGB / cHRM are
   ignored, so they are ignored here too.

   SCOPE, and it refuses outside it. The 360 oracle images were surveyed
   (IHDR of every file): 357 are 8-bit RGBA, 3 are 8-bit RGB, none is
   interlaced, and there is no tRNS or PLTE anywhere. So this decodes 8-bit
   grey / grey+alpha / RGB / RGBA, non-interlaced, and THROWS on anything else
   (16-bit, palette, tRNS, Adam7) rather than guess at what PIL would make of
   it - a decoder that quietly returned wrong pixels would present as a
   detector mismatch. */
'use strict';
const zlib = require('zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePNG(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let i = 8, w = 0, h = 0, bd = 0, ct = -1, il = 0, sawEnd = false;
  const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i), t = buf.toString('latin1', i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      bd = body[8]; ct = body[9]; il = body[12];
      if (body[10] !== 0 || body[11] !== 0) throw new Error('PNG: unknown compression/filter method');
    } else if (t === 'IDAT') idat.push(body);
    else if (t === 'PLTE' || t === 'tRNS') throw new Error('PNG: ' + t + ' not supported by this decoder');
    else if (t === 'IEND') { sawEnd = true; break; }
    i += 12 + n;
  }
  if (!sawEnd) throw new Error('PNG: no IEND (truncated file)');
  if (bd !== 8) throw new Error('PNG: bit depth ' + bd + ' not supported');
  if (il !== 0) throw new Error('PNG: interlaced not supported');
  const chans = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!chans) throw new Error('PNG: colour type ' + ct + ' not supported');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chans;
  if (raw.length !== h * (stride + 1)) throw new Error('PNG: inflated ' + raw.length + ' bytes, expected ' + h * (stride + 1));

  const px = new Uint8Array(h * stride);
  let prev = new Uint8Array(stride);            // row above the first is zeros
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= chans ? cur[x - chans] : 0, b = prev[x], c = x >= chans ? prev[x - chans] : 0;
      let v;
      switch (f) {
        case 0: v = src[x]; break;
        case 1: v = src[x] + a; break;
        case 2: v = src[x] + b; break;
        case 3: v = src[x] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = src[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error('PNG: filter type ' + f + ' on row ' + y);
      }
      cur[x] = v & 255;
    }
    prev = cur;
  }

  if (chans === 4) return { d: px, w, h, colourType: ct };
  const d = new Uint8Array(w * h * 4);
  for (let p = 0, q = 0; p < w * h; p++, q += chans) {
    if (chans === 3) { d[4 * p] = px[q]; d[4 * p + 1] = px[q + 1]; d[4 * p + 2] = px[q + 2]; d[4 * p + 3] = 255; }
    else if (chans === 1) { d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = px[q]; d[4 * p + 3] = 255; }
    else { d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = px[q]; d[4 * p + 3] = px[q + 1]; }
  }
  return { d, w, h, colourType: ct };
}

module.exports = { decodePNG };
