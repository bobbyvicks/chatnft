/* A FOLDER IN SCALE ONLY PASSES ITS PICTURES THROUGH, AS A SINGLE RUN DOES (patch632).

   Scale only promises the bytes that came in, and a single run keeps that promise (040d639). A folder run called
   the palette step and the outline pass on every file whatever the mode, and the palette switch - greyed in Scale
   only, and ticked by default - recoloured every picture off the palette. The owner, told it is a bug: "yes go ahead".

   Each claim has a control one thing away: the palette on a copy of the same pixels (the fixture is one it moves),
   a picture all in the palette (ready either way), a Quick folder (the steps do run there), two PNGs the page
   reads itself against two PNGs the browser reads (the reader, not the format), the same switches outside Scale
   only, and the size advice in a Quick folder. Fixtures are built in the page: the PNGs the page reads with its
   own pngEncode, so their bytes are exact; the ones the browser reads as interlaced PNGs written here (the page's
   reader refuses interlacing) and as a WEBP from a canvas. No collection art is in the repo. (Review of patch632:
   the reader/format split, the advice control and the ticked states were added after it.) RUN AGAINST THE PAGE BEFORE
   patch632 (645dbfe) every test here is red. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function' && typeof fileWithPath === 'function' && typeof pngEncode === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Page-side helpers, installed once per page as window.__S. */
const install = (page) => page.evaluate(() => {
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const S = {};
  /* An RGBA picture n x n of one colour, with optional single pixels {x, y, c: '#rrggbb', a}. */
  S.pic = (n, bg, dots, bgA) => {
    const d = new Uint8ClampedArray(n * n * 4); const b = hx(bg);
    for (let i = 0; i < n * n; i++) d.set([b[0], b[1], b[2], bgA === undefined ? 255 : bgA], i * 4);
    for (const p of dots || []) { const c = hx(p.c); d.set([c[0], c[1], c[2], p.a === undefined ? 255 : p.a], (p.y * n + p.x) * 4); }
    return d;
  };
  S.png = async (d, n) => new Uint8Array(await pngEncode(d, n, n));
  S.setMode = (m) => { const el = document.getElementById('fixmode'); el.value = m; el.dispatchEvent(new Event('change', { bubbles: true })); };
  S.setGrid = (on) => { const el = document.getElementById('fixgrid'); el.checked = on; el.dispatchEvent(new Event('change', { bubbles: true })); };
  S.folder = async (files) => {
    const realToast = window.toast; window.toast = () => {};
    try { await fixBatch(files.map(([rel, bytes]) => fileWithPath(bytes, rel))); } finally { window.toast = realToast; }
    return document.getElementById('fixbatchout').textContent;
  };
  S.out = async (i) => { const f = fixBatchFiles[i]; const r = await pngDecode(new Uint8Array(await new Blob([f.data]).arrayBuffer())); return r; };
  S.same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  /* The same RGBA as an Adam7-interlaced PNG, 8-bit RGBA: a real PNG the page's own reader refuses, so the browser
     reads it (fixDecodeFile's how "browser", why "interlaced"). Written by the patch632 review's probe. */
  S.interlaced = async (d, n) => {
    const passes = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
    const raw = [];
    for (const [x0, y0, dx, dy] of passes) {
      if (x0 >= n || y0 >= n) continue;
      for (let y = y0; y < n; y += dy) { raw.push(0); for (let x = x0; x < n; x += dx) { const i = (y * n + x) * 4; raw.push(d[i], d[i + 1], d[i + 2], d[i + 3]); } }
    }
    const z = await pngZlib([new Uint8Array(raw)], 'out');
    const T = new Uint32Array(256); for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); T[k] = c >>> 0; }
    const crc = u => { let c = 0xffffffff; for (const v of u) c = T[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const tt = new TextEncoder().encode(type), out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
      dv.setUint32(0, data.length); out.set(tt, 4); out.set(data, 8); const td = new Uint8Array(4 + data.length); td.set(tt, 0); td.set(data, 4); dv.setUint32(8 + data.length, crc(td)); return out; };
    const ih = new Uint8Array(13), idv = new DataView(ih.buffer); idv.setUint32(0, n); idv.setUint32(4, n); ih[8] = 8; ih[9] = 6; ih[12] = 1;
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  window.__S = S;
});

/* The fixture: a flat area the palette moves, a stray speck in it, and translucent pixels. */
const FIX = { n: 32, bg: '#44505c', dots: [{ x: 10, y: 10, c: '#44535c' }, { x: 20, y: 5, c: '#8b5fbf', a: 120 }, { x: 21, y: 5, c: '#44505c', a: 60 }] };

test.describe('a folder in Scale only passes its pictures through', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); await install(page); });

  test('EVERY PIXEL COMES OUT AS IT WENT IN, with Colours to palette ticked and greyed, at Save at 1280 off and on', async ({ page }) => {
    const r = await page.evaluate(async (F) => {
      const S = window.__S;
      const src = S.pic(F.n, F.bg, F.dots);
      const bytes = await S.png(src, F.n);
      S.setMode('scale');
      /* read, not set: the switch as a person finds it on a fresh page in Scale only */
      const pal = document.getElementById('fixpal');
      const pre = { checked: pal.checked, disabled: pal.disabled };
      /* the page's own reading of the input - what "came in" means */
      const came = (await fixDecodeFile(fileWithPath(bytes, 'backgrounds/in.png'))).data;
      S.setGrid(false);
      const saidOff = await S.folder([['backgrounds/in.png', bytes]]);
      const off = await S.out(0);
      S.setGrid(true);
      const saidOn = await S.folder([['backgrounds/in.png', bytes]]);
      const on = await S.out(0);
      /* at 1280 the nearest-neighbour rule: the centre of each output block is its source pixel */
      const k = on.width / F.n; let onSame = on.width === 1280 && on.height === 1280;
      for (let y = 0; y < F.n && onSame; y++) for (let x = 0; x < F.n; x++) {
        const o = (((y * k + (k >> 1)) * on.width) + x * k + (k >> 1)) * 4, s = (y * F.n + x) * 4;
        if (on.data[o] !== came[s] || on.data[o + 1] !== came[s + 1] || on.data[o + 2] !== came[s + 2] || on.data[o + 3] !== came[s + 3]) { onSame = false; break; }
      }
      /* CONTROL: the palette step on a copy of the same pixels changes them - the fixture is one it would move */
      const moved = new Uint8ClampedArray(came); snapToPalette(moved, F.n * F.n, F.n);
      return { pre, offSize: [off.width, off.height], offSame: S.same(off.data, came), onSame, saidOff, saidOn,
        paletteMoves: !S.same(moved, came), files: fixBatchFiles.length };
    }, FIX);
    expect(r.pre, 'the switch is ticked and greyed, as a person finds it in Scale only').toEqual({ checked: true, disabled: true });
    expect(r.paletteMoves, 'control: the palette would change these pixels').toBe(true);
    expect(r.files).toBe(1);
    expect(r.offSize).toEqual([32, 32]);
    expect(r.offSame, 'Save at 1280 off: the file is the picture, pixel for pixel').toBe(true);
    expect(r.onSame, 'Save at 1280 on: every block is its source pixel').toBe(true);
    for (const said of [r.saidOff, r.saidOn]) {
      expect(said, 'no palette clause').not.toContain('put on the palette');
      expect(said).not.toContain('stray speck');
      expect(said).toContain('had translucent pixels (2 in all), kept exactly, byte for byte');
    }
  });

  test('IT IS JUDGED READY FOR THE COLLECTION ON THE COLOURS THAT CAME IN, as a single run judges it', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__S;
      S.setMode('scale'); S.setGrid(true); document.getElementById('fixpal').checked = true;
      /* 160 x 160 at Save at 1280: 8px blocks, so only the colours decide */
      const off = await S.png(S.pic(160, '#44505c'), 160);
      /* two colours taken from the palette itself, so the control does not depend on which ones it holds */
      const P = paletteRGB(), c1 = P[0].h, c2 = P.find(p => p.h !== c1).h;
      const onPal = await S.png(S.pic(160, c1, [{ x: 3, y: 3, c: c2 }]), 160);
      const saidOff = await S.folder([['backgrounds/off.png', off]]);
      const saidOn = await S.folder([['backgrounds/onpal.png', onPal]]);
      /* the single run on the same off-palette picture */
      const realToast = window.toast; window.toast = () => {};
      await fixLoad(fileWithPath(off, 'backgrounds/off.png'));
      await fixRun();
      window.toast = realToast;
      return { saidOff, saidOn, single: document.getElementById('fixout').textContent,
        onPalIsPal: [c1, c2].every(h => paletteRGB().some(p => p.h.toLowerCase() === h.toLowerCase())),
        offIsOff: !paletteRGB().some(p => p.h.toLowerCase() === '#44505c') };
    });
    expect(r.onPalIsPal, 'control fixture: both colours are palette colours').toBe(true);
    expect(r.offIsOff, 'and the other picture has a colour that is not').toBe(true);
    expect(r.single, 'the single run: not ready, colours off the palette').toContain('not ready for the collection');
    expect(r.single).toContain('colour off the palette');
    expect(r.saidOff).toContain('0 of 1 ready for the collection');
    expect(r.saidOff).toContain('off the palette');
    /* CONTROL, ONE THING AWAY: a picture all in the palette is ready */
    expect(r.saidOn).toContain('1 of 1 ready for the collection');
  });

  test('A MODE SWITCHED PART WAY DOES NOT REACH THE FILES STILL TO COME', async ({ page }) => {
    const r = await page.evaluate(async (F) => {
      const S = window.__S;
      const a = S.pic(F.n, F.bg, F.dots), b = S.pic(F.n, F.bg, [{ x: 4, y: 4, c: '#44535c' }]);
      const bytes = [await S.png(a, F.n), await S.png(b, F.n)];
      const came = [];
      for (const x of bytes) came.push((await fixDecodeFile(fileWithPath(x, 'backgrounds/x.png'))).data);
      const watch = async (mode, switchTo) => {
        S.setMode(mode); S.setGrid(false); document.getElementById('fixpal').checked = true; document.getElementById('fixline').checked = true;
        const realPal = window.fixPalApply, realLine = window.fixOutlineApply, realDec = window.fixDecodeFile;
        const calls = { pal: 0, line: 0 }; let decodes = 0;
        window.fixPalApply = function () { calls.pal++; return realPal.apply(this, arguments); };
        window.fixOutlineApply = function () { calls.line++; return realLine.apply(this, arguments); };
        /* the switch, made as the second file is read - after the run has started */
        window.fixDecodeFile = async function (f) { decodes++; if (decodes === 2 && switchTo) S.setMode(switchTo); return realDec.apply(this, arguments); };
        let said;
        try { said = await S.folder([['backgrounds/a.png', bytes[0]], ['backgrounds/b.png', bytes[1]]]); }
        finally { window.fixPalApply = realPal; window.fixOutlineApply = realLine; window.fixDecodeFile = realDec; }
        const outs = [await S.out(0), await S.out(1)];
        return { calls, decodes, modeAfter: fixMode(), said, same: outs.map((o, i) => S.same(o.data, came[i])) };
      };
      const scale = await watch('scale', 'fast');
      /* CONTROL: a Quick folder - the steps run there, once a file each */
      const quick = await watch('fast', null);
      return { scale, quick };
    }, FIX);
    expect(r.scale.decodes).toBe(2);
    expect(r.scale.modeAfter, 'the switch really happened part way').toBe('fast');
    expect(r.scale.calls, 'no palette step and no outline pass, before or after the switch').toEqual({ pal: 0, line: 0 });
    expect(r.scale.same, 'both files are their pictures, pixel for pixel').toEqual([true, true]);
    expect(r.scale.said).not.toContain('put on the palette');
    expect(r.quick.calls, 'control: in Quick the folder runs both steps on each file').toEqual({ pal: 2, line: 2 });
  });

  test('TRANSLUCENT PIXELS ARE SAID FILE BY FILE: the page reads its own PNGs exactly, the browser rounds the rest', async ({ page }) => {
    const r = await page.evaluate(async (F) => {
      const S = window.__S;
      S.setMode('scale'); S.setGrid(false);
      const png = await S.png(S.pic(F.n, F.bg, F.dots), F.n);
      /* the same kind of picture as a WEBP: the page's PNG reader does not take it, so the browser reads it */
      const c = document.createElement('canvas'); c.width = F.n; c.height = F.n;
      const g = c.getContext('2d'); g.putImageData(new ImageData(S.pic(F.n, F.bg, F.dots), F.n, F.n), 0, 0);
      const webp = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/webp', 1))).arrayBuffer());
      const decW = await fixDecodeFile(fileWithPath(webp, 'backgrounds/w.webp'));
      /* and as a PNG the page's reader refuses, so the browser reads it: the reader differs, the format does not */
      const il = await S.interlaced(S.pic(F.n, F.bg, F.dots), F.n);
      const decI = await fixDecodeFile(fileWithPath(il, 'backgrounds/i.png'));
      const decP = await fixDecodeFile(fileWithPath(png, 'backgrounds/p.png'));
      const mixed = await S.folder([['backgrounds/p.png', png], ['backgrounds/i.png', il]]);
      /* CONTROL: two PNGs the page reads itself */
      const own = await S.folder([['backgrounds/p.png', png], ['backgrounds/q.png', png]]);
      /* and two PNGs the browser reads */
      const theirs = await S.folder([['backgrounds/i.png', il], ['backgrounds/j.png', il]]);
      /* and a file that is not a PNG at all, beside one the page reads */
      const webpMixed = await S.folder([['backgrounds/p.png', png], ['backgrounds/w.webp', webp]]);
      return { webpHow: decW.how, webpTranslucent: fixTranslucent(decW.data, F.n * F.n).count,
        il: { how: decI.how, why: decI.why, translucent: fixTranslucent(decI.data, F.n * F.n).count }, pngHow: decP.how,
        mixed, own, theirs, webpMixed };
    }, FIX);
    expect(r.pngHow, 'the page reads its own PNG').toBe('png');
    expect(r.il, 'the interlaced PNG is read by the browser, and still has translucent pixels')
      .toEqual({ how: 'browser', why: 'interlaced', translucent: r.il.translucent });
    expect(r.il.translucent).toBeGreaterThan(0);
    expect(r.webpHow, 'the WEBP is read by the browser').toBe('browser');
    expect(r.webpTranslucent, 'and still has translucent pixels').toBeGreaterThan(0);
    expect(r.mixed).toContain('2 had translucent pixels');
    expect(r.mixed).toContain('kept exactly, byte for byte, except 1 read by the browser, which rounds their colour');
    expect(r.own).toContain('2 had translucent pixels (4 in all), kept exactly, byte for byte');
    expect(r.own).not.toContain('except');
    /* the whole phrase: "rounds" alone is inside "backgrounds", which a file name in the note can carry */
    expect(r.own).not.toContain('which rounds their colour');
    expect(r.theirs).toContain('2 had translucent pixels');
    expect(r.theirs).toContain('kept translucent - read by the browser, which rounds their colour');
    expect(r.theirs).not.toContain('byte for byte');
    expect(r.webpMixed).toContain('kept exactly, byte for byte, except 1 read by the browser, which rounds their colour');
  });

  test('THE OUTLINE SWITCH IS GREYED IN SCALE ONLY, and both switches say why where a hover lands', async ({ page }) => {
    const r = await page.evaluate(() => {
      const S = window.__S;
      const lab = id => document.getElementById(id).closest('label');
      const read = () => ({ lineDisabled: document.getElementById('fixline').disabled, lineChecked: document.getElementById('fixline').checked,
        lineTitle: lab('fixline').title, palTitle: lab('fixpal').title, palDisabled: document.getElementById('fixpal').disabled,
        palChecked: document.getElementById('fixpal').checked });
      S.setMode('full'); const full = read();
      S.setMode('scale'); const scale = read();
      S.setMode('full'); const back = read();
      return { full, scale, back };
    });
    expect(r.scale.lineDisabled).toBe(true);
    expect(r.scale.lineChecked, 'greyed, not unticked: the setting is kept').toBe(true);
    expect(r.scale.palChecked, 'the palette switch too').toBe(true);
    expect(r.scale.lineTitle).toBe('Not used in scale only - nothing is rebuilt, so there is no outline to clean.');
    expect(r.scale.palDisabled).toBe(true);
    expect(r.scale.palTitle).toBe('Not used in scale only - that mode passes the picture through untouched.');
    /* CONTROL, ONE THING AWAY: in Thorough both are live, with the markup's own words, before and after */
    for (const s of [r.full, r.back]) {
      expect(s.lineDisabled).toBe(false);
      expect([s.lineChecked, s.palChecked], 'both still ticked, before and after').toEqual([true, true]);
      expect(s.lineTitle).toMatch(/^Clean up the black outline/);
      expect(s.palTitle).toMatch(/^Change every colour in the result/);
    }
  });

  test('A SCALE ONLY FOLDER IS NOT TOLD TO TYPE A SIZE, which does nothing there', async ({ page }) => {
    const r = await page.evaluate(async (F) => {
      const S = window.__S;
      const bytes = await S.png(S.pic(F.n, F.bg, F.dots), F.n);
      const run = async (mode) => {
        S.setMode(mode); S.setGrid(true); document.getElementById('fixsnap').checked = false;
        const f = document.getElementById('fixforce'); f.value = '0';
        return S.folder([['backgrounds/small.png', bytes]]);
      };
      return { scale: await run('scale'), quick: await run('fast') };
    }, FIX);
    /* PRECONDITION: the off-grid clause is there - the advice used to end it */
    expect(r.scale).toContain('not on the 160 cell grid');
    /* THE CLAIM */
    expect(r.scale).not.toContain('to force it');
    /* CONTROL, ONE THING AWAY: the same picture in a Quick folder is told, where a size does something */
    expect(r.quick).toContain('not on the 160 cell grid');
    expect(r.quick).toContain(' - type 8 to force it, which re-cuts art drawn at another size');
  });
});
