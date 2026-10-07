/* A SCALE ONLY PICTURE IS COUNTED IN THE BLOCKS IT IS DRAWN IN (patch634).

   A folder run keeps each file's cell count (`cells`) and reads it four ways: the off-grid clause ("N not on the
   160 cell grid (k at Kpx)"), the uneven-pixels clause, and the block a tile - and the recent rail - opens at. In
   Scale only there is no engine to land on a count, and `cells` was the picture's width in pixels: a finished 1280
   trait drawn in 8px blocks read "1 not on the 160 cell grid (1 at 1px)" while the same line called it ready for
   the collection, and its tile opened in the editor with a one-pixel grid and brush. Over the owner's 311 saved
   traits a Scale only folder said "311 not on the 160 cell grid (311 at 1px)"; 144 of them are drawn in blocks.
   Now Scale only counts a picture's width over the block fixNativeBlock measures, or its width when it has none,
   and calls a file off the grid when its blocks do not land on the grid's cells (16px art and a one-colour picture
   are on the 160 grid, as the gate says). The single run's result opens at the same block as the tile, and its two
   sentences say a picture's exact blocks come out whole where its pixels do not. A Scale only tile asks the single
   run's question of shape too, so a file opens at one block from a tile, the recent rail or a single run, whatever
   its shape. (Review of patch634: the 16px and flat cases, the engine-path and recent-rail opens, pictures that are
   not square, and the single run's sentences - exact blocks and stray-pixel ones - were added after it; after the
   third, the folder's word for stray pixels, strays at varied places in their blocks, and soft claims in the first
   test, so each of its pictures is reported whatever the others do; after the fourth, stray pixels have their own
   clause in the folder and their own words in the single run, each saying they can come out uneven; after the
   fifth, that they can be lost above 1280, one stray said as one, a mixed folder, and Save at 1280 off; after the
   sixth, the folder's stray clause for square pictures only, with how many strays, one said as one.)

   Each claim has a control one thing away: the same pattern in 10px blocks, in no blocks at all, or a size whose
   blocks do not land on the canvas. Pictures are built in the page and written with its own pngEncode, so their
   bytes are exact. RUN AGAINST THE PAGE BEFORE patch634 (df3a344) every test is red at its claim. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function' && typeof fileWithPath === 'function'
    && typeof pngEncode === 'function' && typeof fixNativeBlock === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

const install = (page) => page.evaluate(() => {
  const COLS = [[0x2e, 0x22, 0x2f], [0x8b, 0x5f, 0xbf], [0xf2, 0xa6, 0x5a], [0xe8, 0xd5, 0xb7]];
  const S = {};
  /* n x n in `block` px blocks; neighbouring blocks always differ, so the measured block is `block` itself and
     not a multiple of it. stray: one pixel of another colour in every stray-th block, at a place in its block that
     varies from block to block - so at a size the pixels do not land on, some strays come out larger than others. */
  S.blocks = (n, block, stray) => {
    const d = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const bx = Math.floor(x / block), by = Math.floor(y / block);
      d.set([...COLS[(bx * 5 + by * 3) % 4], 255], (y * n + x) * 4);
    }
    if (stray) {
      const nb = n / block; let k = 0;
      for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) if (k++ % stray === 0) {
        const ox = (bx + by) % block, oy = (bx * 3 + by) % block;
        const i = ((by * block + oy) * n + bx * block + ox) * 4; d.set([0x11, 0x99, 0x44, 255], i);
      }
    }
    return d;
  };
  /* w x h in `block` px blocks, for a picture that is not square */
  S.rect = (w, h, block) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([...COLS[(Math.floor(x / block) * 5 + Math.floor(y / block) * 3) % 4], 255], (y * w + x) * 4);
    return d;
  };
  /* n x n of one colour */
  S.flat = (n) => { const d = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < n * n; i++) d.set([...COLS[1], 255], i * 4); return d; };
  /* n x n with no blocks: every pixel its own colour from a hash */
  S.noise = (n) => {
    const d = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) { const h = Math.imul(i + 1, 2654435761) >>> 0; d.set([h & 255, (h >>> 8) & 255, (h >>> 16) & 255, 255], i * 4); }
    return d;
  };
  S.png = async (d, n, h) => new Uint8Array(await pngEncode(d, n, h || n));
  /* n x n in `block` px blocks with exactly one stray pixel */
  S.oneStray = (n, block) => { const d = S.blocks(n, block); d.set([0x11, 0x99, 0x44, 255], ((block * 5 + 3) * n + block * 3 + 2) * 4); return d; };
  /* the stray-coloured pixels of a saved picture, counted in each k x k block: the set of counts, and the total */
  S.strayCounts = (o, k) => {
    const sizes = new Set(); let total = 0;
    for (let by = 0; by < o.height; by += k) for (let bx = 0; bx < o.width; bx += k) {
      let c = 0;
      for (let y = by; y < by + k && y < o.height; y++) for (let x = bx; x < bx + k && x < o.width; x++) {
        const i = (y * o.width + x) * 4; if (o.data[i] === 0x11 && o.data[i + 1] === 0x99 && o.data[i + 2] === 0x44) c++;
      }
      if (c) { sizes.add(c); total += c; }
    }
    return { sizes: [...sizes].sort((a, b) => a - b), total };
  };
  S.setMode = (m) => { const el = document.getElementById('fixmode'); el.value = m; el.dispatchEvent(new Event('change', { bubbles: true })); };
  S.setGrid = (on) => { const el = document.getElementById('fixgrid'); el.checked = on; el.dispatchEvent(new Event('change', { bubbles: true })); };
  S.folder = async (files, gridOff) => {
    S.setMode('scale'); S.setGrid(!gridOff);
    const realToast = window.toast; window.toast = () => {};
    try { await fixBatch(files.map(([rel, bytes]) => fileWithPath(bytes, rel))); } finally { window.toast = realToast; }
    return document.getElementById('fixbatchout').textContent;
  };
  /* the off-grid clause alone, or '' */
  S.offGrid = (said) => { const m = said.match(/\d+ not on the \d+ cell grid \([^)]*\)/); return m ? m[0] : ''; };
  window.__G = S;
});

test.describe('a Scale only picture is counted in the blocks it is drawn in', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); await install(page); });

  test('A FINISHED 1280 PICTURE IN 8PX BLOCKS IS ON THE 160 CELL GRID; in 10px blocks it is not, at 10px; with no blocks, at 1px', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__G;
      const eight = S.blocks(1280, 8), ten = S.blocks(1280, 10), none = S.noise(1280), sixteen = S.blocks(1280, 16), flat = S.flat(1280);
      const measured = [eight, ten, none, sixteen, flat].map(d => fixNativeBlock(d, 1280, 1280));
      const b8 = await S.png(eight, 1280), b10 = await S.png(ten, 1280), b0 = await S.png(none, 1280);
      return {
        measured, grid: fixGridCells().cells,
        /* (review) blocks that are a whole number of the grid's cells: on the grid, as the gate says */
        sixteen: await S.folder([['backgrounds/sixteen.png', await S.png(sixteen, 1280)]]),
        flat: await S.folder([['backgrounds/flat.png', await S.png(flat, 1280)]]),
        eight: await S.folder([['backgrounds/eight.png', b8]]),
        ten: await S.folder([['backgrounds/ten.png', b10]]),
        none: await S.folder([['backgrounds/none.png', b0]]),
        all: await S.folder([['backgrounds/eight.png', b8], ['backgrounds/ten.png', b10], ['backgrounds/none.png', b0]]),
      };
    });
    expect(r.measured, 'the pictures are what this test says').toEqual([8, 10, 0, 16, 64]);
    expect(r.grid).toBe(160);
    expect(r.eight, 'the run finished').toContain('1 of 1 done');
    /* THE CLAIM */
    /* soft (third review): each picture's claim is reported whatever the others do */
    expect.soft(r.eight, 'a 1280 picture in 8px blocks is 160 cells').not.toContain('cell grid (');
    /* and blocks the grid's cells divide: 16px art (80 cells) and one colour (64px blocks, 20 cells) */
    expect(r.sixteen, 'the run finished').toContain('1 of 1 done');
    expect.soft(r.sixteen, '16px blocks sit on the 160 grid').not.toContain('cell grid (');
    expect(r.flat, 'the run finished').toContain('1 of 1 done');
    expect.soft(r.flat, 'one colour sits on any grid').not.toContain('cell grid (');
    /* CONTROLS, ONE THING AWAY: the same pattern in 10px blocks, and a picture with no blocks */
    expect(r.ten).toContain('1 not on the 160 cell grid (1 at 10px)');
    expect(r.none).toContain('1 not on the 160 cell grid (1 at 1px)');
    /* and together, counted file by file */
    expect(r.all).toContain('3 of 3 done');
    const off = r.all.match(/(\d+) not on the 160 cell grid \(([^)]*)\)/);
    expect(off && off[1], r.all).toBe('2');
    expect(off && off[2].split(', ').sort()).toEqual(['1 at 10px', '1 at 1px']);
  });

  test('A PICTURE IN BLOCKS WITH STRAY PIXELS IS COUNTED IN ITS BLOCKS, the gate still names the strays, and the shared noisy count is left as it was', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__G;
      const noisy = S.blocks(1280, 8, 7), clean = S.blocks(1280, 8);
      fixNativeBlock(noisy, 1280, 1280); const noisyCount = fixNativeNoisy;
      const measured = fixNativeBlock(noisy, 1280, 1280);
      const bn = await S.png(noisy, 1280), bc = await S.png(clean, 1280);
      /* a sentinel in the page's one noisy-block count: no reader would see this one (each reads it straight after
         its own measure), but the new caller is to leave no trace */
      fixNativeNoisy = 7777;
      const saidNoisy = await S.folder([['backgrounds/noisy.png', bn]]);
      const after = fixNativeNoisy;
      const saidClean = await S.folder([['backgrounds/clean.png', bc]]);
      return { measured, noisyCount, saidNoisy, after, saidClean };
    });
    expect(r.measured, 'measured as 8px blocks').toBe(8);
    expect(r.noisyCount, 'with blocks holding a stray pixel').toBeGreaterThan(0);
    /* THE CLAIM: counted in its blocks */
    expect(r.saidNoisy, 'on the grid').not.toContain('cell grid (');
    /* and the gate, which asks of the saved picture whether every 8px block is one colour, still says no */
    expect(r.saidNoisy).toContain('because its 8px blocks are not one colour');
    /* (third review) and not uneven: its strays are on a picture whose pixels land on 1280, so they come out whole */
    expect(r.saidNoisy).not.toContain('does not divide 1280');
    expect(r.saidNoisy).not.toContain('stray pixels');
    expect(r.after, 'the noisy count the run found it with').toBe(7777);
    /* CONTROL, ONE THING AWAY: the same picture without the strays - on the grid, and the gate has no block to name */
    expect(r.saidClean).not.toContain('cell grid (');
    expect(r.saidClean).not.toContain('not one colour');
  });

  test('THE UNEVEN-PIXELS CLAUSE COUNTS BLOCKS TOO: 1024 in 8px blocks saves as whole 10px blocks; 1000 in 8px blocks does not', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__G;
      /* every k x k block of the saved file one colour, on a k grid */
      const flat = (o, k) => {
        for (let by = 0; by + k <= o.height; by += k) for (let bx = 0; bx + k <= o.width; bx += k) {
          const i0 = (by * o.width + bx) * 4;
          for (let y = by; y < by + k; y++) for (let x = bx; x < bx + k; x++) {
            const i = (y * o.width + x) * 4;
            if (o.data[i] !== o.data[i0] || o.data[i + 1] !== o.data[i0 + 1] || o.data[i + 2] !== o.data[i0 + 2] || o.data[i + 3] !== o.data[i0 + 3]) return false;
          }
        }
        return true;
      };
      const out = async () => pngDecode(new Uint8Array(await new Blob([fixBatchFiles[0].data]).arrayBuffer()));
      const a = S.blocks(1024, 8), b = S.blocks(1000, 8);
      const measured = [fixNativeBlock(a, 1024, 1024), fixNativeBlock(b, 1000, 1000)];
      const said1024 = await S.folder([['backgrounds/k.png', await S.png(a, 1024)]]);
      const o1024 = await out();
      const said1000 = await S.folder([['backgrounds/m.png', await S.png(b, 1000)]]);
      const o1000 = await out();
      /* (third review) 1024 in the same 8px blocks with strays: the blocks land, the strays may not */
      const sn = S.blocks(1024, 8, 7);
      const strayMeasured = fixNativeBlock(sn, 1024, 1024), strayNoisy = fixNativeNoisy;
      const saidStrays = await S.folder([['backgrounds/s.png', await S.png(sn, 1024)]]);
      /* (fourth review) and 1000 in 8px blocks with strays: its blocks do not land either, so it is the uneven
         clause's, once, and not the stray clause's too */
      const saidStrays1000 = await S.folder([['backgrounds/t.png', await S.png(S.blocks(1000, 8, 7), 1000)]]);
      /* (fifth review) Save at 1280 off: neither clause - nothing is scaled */
      const saidStraysOff = await S.folder([['backgrounds/s.png', await S.png(sn, 1024)]], true);
      /* a mixed folder: an exact 1024, a 1024 with strays, a 1000 with strays - one clause each, once */
      const saidMixed = await S.folder([['backgrounds/k.png', await S.png(a, 1024)], ['backgrounds/s.png', await S.png(sn, 1024)],
        ['backgrounds/t.png', await S.png(S.blocks(1000, 8, 7), 1000)]]);
      /* 1600 in 10px blocks with strays: its blocks land (8px), and a stray is kept at one pixel or lost */
      const big = S.blocks(1600, 10, 7); let drawn = 0;
      for (let i = 0; i < big.length; i += 4) if (big[i] === 0x11 && big[i + 1] === 0x99 && big[i + 2] === 0x44) drawn++;
      const saidBig = await S.folder([['backgrounds/b.png', await S.png(big, 1600)]]);
      const bigSaved = S.strayCounts(await out(), 8);
      fixNativeBlock(big, 1600, 1600); const bigNoisy = fixNativeNoisy;
      /* (sixth review) a picture that is not square, with strays: stretched at 1280, so no stray clause - the gate
         says "not square" */
      const ns = S.rect(1024, 1000, 8);
      for (let by = 0, k = 0; by < 125; by++) for (let bx = 0; bx < 128; bx++) if (k++ % 7 === 0)
        ns.set([0x11, 0x99, 0x44, 255], ((by * 8 + (bx + by) % 8) * 1024 + bx * 8 + (bx * 3 + by) % 8) * 4);
      const nsMeasured = fixNativeBlock(ns, 1024, 1000), nsNoisy = fixNativeNoisy;
      const saidNonSquare = await S.folder([['backgrounds/n.png', await S.png(ns, 1024, 1000)]]);
      /* one stray, said as one */
      const saidOne = await S.folder([['backgrounds/o.png', await S.png(S.oneStray(1024, 8), 1024)]]);
      /* two files narrower than 1280 and one wider: "2 have ... uneven" and "1 has ... lost", with their counts */
      const half = S.blocks(512, 8, 7); fixNativeBlock(half, 512, 512); const halfNoisy = fixNativeNoisy;
      const saidKinds = await S.folder([['backgrounds/s.png', await S.png(sn, 1024)], ['backgrounds/h.png', await S.png(half, 512)],
        ['backgrounds/b.png', await S.png(big, 1600)]]);
      return { measured, said1024, said1000, w: [o1024.width, o1000.width], flat1024: flat(o1024, 10), flat1000: flat(o1000, 10),
        strayMeasured, strayNoisy, saidStrays, saidStrays1000, saidStraysOff, saidMixed, saidBig, bigSaved, drawn,
        bigNoisy, nsMeasured, nsNoisy, saidNonSquare, saidOne, halfNoisy, saidKinds };
    });
    expect(r.measured).toEqual([8, 8]);
    expect(r.w, 'both saved at 1280').toEqual([1280, 1280]);
    /* WHAT THE SENTENCE IS ABOUT: the saved 1024 file is whole 10px blocks, the 1000 one is not */
    expect(r.flat1024).toBe(true);
    expect(r.flat1000).toBe(false);
    /* THE CLAIM */
    expect(r.said1024, 'its pixels are not uneven').not.toContain('does not divide 1280');
    expect(r.said1024).toContain('1 not on the 160 cell grid (1 at 10px)');
    /* CONTROL, ONE THING AWAY: 1000 in the same 8px blocks is 125 cells, which do not land on 1280 */
    expect(r.said1000).toContain('came back on a pixel count that does not divide 1280, so their pixels are uneven');
    /* (third review) and 1024 in 8px blocks with stray pixels: counted in its blocks (10px on the canvas), and its
       strays said - they come out at more than one size here (test 5 reads the saved file) - in a clause of their own
       (fourth review), not as a pixel count that does not divide 1280: its count in blocks does */
    expect([r.strayMeasured, r.strayNoisy > 0]).toEqual([8, true]);
    expect(r.saidStrays).toContain('1 not on the 160 cell grid (1 at 10px)');
    expect(r.saidStrays).toContain('1 has ' + r.strayNoisy.toLocaleString() + ' stray pixels in blocks that land on 1280; the strays can come out uneven');
    expect(r.saidStrays).not.toContain('does not divide 1280');
    expect(r.saidStrays1000).toContain('1 came back on a pixel count that does not divide 1280');
    expect(r.saidStrays1000).not.toContain('stray pixels');
    /* (fifth review) Save at 1280 off: nothing is scaled, so neither clause */
    expect(r.saidStraysOff, 'the run finished').toContain('1 of 1 done');
    expect(r.saidStraysOff).not.toContain('stray pixels');
    expect(r.saidStraysOff).not.toContain('does not divide 1280');
    /* a mixed folder: one stray clause and one uneven clause, each counting its own file */
    expect(r.saidMixed).toContain('3 of 3 done');
    expect(r.saidMixed).toContain('1 has ' + r.strayNoisy.toLocaleString() + ' stray pixels in blocks that land on 1280; the strays can come out uneven');
    expect(r.saidMixed).toContain('1 came back on a pixel count that does not divide 1280');
    /* 1600 in 10px blocks with strays: the saved file keeps each stray at one pixel or drops it - never larger -
       and the clause says they can be lost */
    expect(r.bigSaved.sizes, 'strays kept at one pixel each').toEqual([1]);
    expect(r.bigSaved.total, 'and some lost: ' + r.bigSaved.total + ' of ' + r.drawn).toBeLessThan(r.drawn);
    expect(r.saidBig).toContain('1 has ' + r.bigNoisy.toLocaleString() + ' stray pixels in blocks that land on 1280; the strays can be lost');
    expect(r.saidBig).not.toContain('come out uneven');
    /* (sixth review) not square: no stray clause, and the gate says why it is not ready */
    expect([r.nsMeasured, r.nsNoisy > 0]).toEqual([8, true]);
    expect(r.saidNonSquare, 'the run finished').toContain('1 of 1 done');
    expect(r.saidNonSquare).toContain('because it is not square');
    expect(r.saidNonSquare).not.toContain('stray pixel');
    /* one stray, said as one */
    expect(r.saidOne).toContain('1 has a stray pixel in a block that lands on 1280; it can come out uneven');
    /* two kinds in one folder, each counted */
    expect(r.saidKinds).toContain('3 of 3 done');
    expect(r.saidKinds).toContain('2 have ' + (r.strayNoisy + r.halfNoisy).toLocaleString() + ' stray pixels in blocks that land on 1280; the strays can come out uneven');
    expect(r.saidKinds).toContain('1 has ' + r.bigNoisy.toLocaleString() + ' stray pixels in blocks that land on 1280; the strays can be lost');
  });

  test('A SCALE ONLY RESULT OPENS AT THE BLOCK IT IS DRAWN IN, from a folder tile and from a single run alike', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__G;
      const pics = { eight: S.blocks(1280, 8), ten: S.blocks(1280, 10), none: S.noise(1280) };
      const out = {};
      for (const [k, d] of Object.entries(pics)) {
        const bytes = await S.png(d, 1280);
        await S.folder([['backgrounds/' + k + '.png', bytes]]);
        gridBlock = 1; await fixOpenOne(fixBatchFiles[0]); const tile = gridBlock;
        /* the single run, on the same file */
        const realToast = window.toast; window.toast = () => {};
        await fixLoad(fileWithPath(bytes, 'backgrounds/' + k + '.png'));
        S.setMode('scale'); S.setGrid(true);
        await fixRun();
        window.toast = realToast;
        gridBlock = 1; fixOpen(); const single = gridBlock;
        /* and from the recent rail, which opens the same way: its newest entry is this folder's file */
        gridBlock = 1; await fixOpenOne(fixRecent[0]); const rail = gridBlock;
        out[k] = { tile, single, rail };
      }
      /* (review) Save at 1280 off, a picture that is not square: 1280 x 640 in 8px blocks, saved as it is */
      const rect = await S.png(S.rect(1280, 640, 8), 1280, 640);
      await S.folder([['backgrounds/rect.png', rect]], true);
      const rectCells = fixBatchFiles[0].cells;
      gridBlock = 1; await fixOpenOne(fixBatchFiles[0]); const rectTile = gridBlock;
      {
        const realToast = window.toast; window.toast = () => {};
        await fixLoad(fileWithPath(rect, 'backgrounds/rect.png'));
        S.setMode('scale'); S.setGrid(false);
        await fixRun();
        window.toast = realToast;
      }
      gridBlock = 1; fixOpen(); const rectSingle = gridBlock;
      /* (second review) and saved at 1280, where it is stretched: no whole block, from a tile, the rail or a single run */
      await S.folder([['backgrounds/rect.png', rect]]);
      gridBlock = 1; await fixOpenOne(fixBatchFiles[0]); const rectTileOn = gridBlock;
      gridBlock = 1; await fixOpenOne(fixRecent[0]); const rectRailOn = gridBlock;
      {
        const realToast = window.toast; window.toast = () => {};
        await fixLoad(fileWithPath(rect, 'backgrounds/rect.png'));
        S.setMode('scale'); S.setGrid(true);
        await fixRun();
        window.toast = realToast;
      }
      gridBlock = 1; fixOpen(); const rectSingleOn = gridBlock;
      /* (review) THE ENGINE PATH, one thing away: the same 8px picture in Quick at pixel size 4 is 320 cells, and
         opens at 4 - its result is not counted in blocks */
      let engine;
      {
        const realToast = window.toast; window.toast = () => {};
        const bytes = await S.png(pics.eight, 1280);
        await fixLoad(fileWithPath(bytes, 'backgrounds/eight.png'));
        S.setMode('fast'); S.setGrid(true);
        const f = document.getElementById('fixforce'); f.disabled = false; f.value = '4';
        const res = await fixRun();
        f.value = '0';
        window.toast = realToast;
        gridBlock = 1; fixOpen();
        engine = { cols: res && res.width, block: gridBlock };
      }
      return { ...out, rectCells, rectTile, rectSingle, rectTileOn, rectRailOn, rectSingleOn, engine };
    });
    /* THE CLAIM */
    expect(r.eight, 'a 1280 picture in 8px blocks opens with an 8px grid').toEqual({ tile: 8, single: 8, rail: 8 });
    /* CONTROLS, ONE THING AWAY */
    expect(r.ten).toEqual({ tile: 10, single: 10, rail: 10 });
    expect(r.none, 'no blocks: one pixel, as before').toEqual({ tile: 1, single: 1, rail: 1 });
    /* not square, nothing stretched: counted by its width, 160 cells, and opened on its 8px blocks both ways */
    expect(r.rectCells, 'counted across its width').toBe(160);
    expect([r.rectTile, r.rectSingle], 'tile and single run').toEqual([8, 8]);
    /* and stretched by Save at 1280: no whole block, so one pixel - the same from all three */
    expect([r.rectTileOn, r.rectRailOn, r.rectSingleOn], 'tile, rail and single run, saved at 1280').toEqual([1, 1, 1]);
    expect(r.engine, 'the engine path opens at the size it cut').toEqual({ cols: 320, block: 4 });
  });

  test('A SINGLE SCALE ONLY RUN SAYS ITS BLOCKS COME OUT WHOLE where a square picture\'s pixels do not, as the folder no longer calls it uneven', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__G;
      const one = async (n, stray) => {
        const bytes = await S.png(S.blocks(n, 8, stray), n);
        const realToast = window.toast; window.toast = () => {};
        await fixLoad(fileWithPath(bytes, 'backgrounds/s' + n + '.png'));
        S.setMode('scale'); S.setGrid(true);
        fixSizeHint();
        const readout = document.getElementById('fixsize').textContent;
        await fixRun();
        window.toast = realToast;
        /* the saved picture: how many stray-coloured pixels each 10px block holds, as a set of sizes */
        const sv = fixGridPixels(FIX.out), sizes = new Set();
        for (let by = 0; by < sv.height; by += 10) for (let bx = 0; bx < sv.width; bx += 10) {
          let c = 0;
          for (let y = by; y < by + 10 && y < sv.height; y++) for (let x = bx; x < bx + 10 && x < sv.width; x++) {
            const i = (y * sv.width + x) * 4; if (sv.data[i] === 0x11 && sv.data[i + 1] === 0x99 && sv.data[i + 2] === 0x44) c++;
          }
          if (c) sizes.add(c);
        }
        const d = S.blocks(n, 8, stray); const measured = fixNativeBlock(d, n, n);
        return { readout, said: document.getElementById('fixout').textContent, measured, noisy: fixNativeNoisy, straySizes: [...sizes].sort((a, b) => a - b) };
      };
      /* (fifth review) one stray, said as one; and 1600 in 10px blocks, whose strays can be lost */
      const single = async (d, n, rel) => {
        const realToast = window.toast; window.toast = () => {};
        await fixLoad(fileWithPath(await S.png(d, n), rel));
        S.setMode('scale'); S.setGrid(true);
        fixSizeHint();
        const readout = document.getElementById('fixsize').textContent;
        await fixRun();
        window.toast = realToast;
        fixNativeBlock(d, n, n);
        return { readout, said: document.getElementById('fixout').textContent, noisy: fixNativeNoisy };
      };
      return { k: await one(1024), m: await one(1000), s: await one(1024, 7),
        o: await single(S.oneStray(1024, 8), 1024, 'backgrounds/o.png'), b: await single(S.blocks(1600, 10, 7), 1600, 'backgrounds/b.png') };
    });
    expect([r.k.measured, r.m.measured, r.s.measured]).toEqual([8, 8, 8]);
    expect([r.k.noisy, r.s.noisy > 0], 'exact blocks, and blocks found by tolerating a stray pixel').toEqual([0, true]);
    /* THE CLAIM: 1024 in 8px blocks - its blocks are 10px on 1280 */
    expect(r.k.said).toContain('It will save at 1280\u00d71280 (its 8px blocks come out 10px each).');
    expect(r.k.readout).toContain('its 8px blocks come out 10px on 1280');
    expect(r.k.said + r.k.readout).not.toContain('uneven');
    expect(r.k.said + r.k.readout, 'no strays to name').not.toContain('stray');
    /* CONTROL, ONE THING AWAY: 1000 in the same 8px blocks - 10.24px, uneven */
    expect(r.m.said).toContain('(pixels come out uneven at this size).');
    expect(r.m.readout).toContain('so pixels come out uneven');
    /* (second review) CONTROL, ONE THING AWAY: 1024 in the same 8px blocks with a stray pixel in every 7th - the
       strays are 1px marks, and here they do come out uneven (the saved file holds them at more than one size), so
       the whole-block sentence is not said */
    /* SUPERSEDED (fourth review): the whole-block sentence is said for these too, with the strays named - "but stray
       pixels in N of them can come out uneven" - below, as the folder's stray clause says of the same file. */
    expect(r.s.straySizes.length, 'the strays saved at more than one size: ' + r.s.straySizes).toBeGreaterThan(1);
    /* (fourth review) said as such: its blocks land, and its strays can come out uneven - not "pixels come out
       uneven", which says nothing of the blocks */
    expect(r.s.said).toContain('It will save at 1280\u00d71280 (its 8px blocks come out 10px each, but stray pixels in '
      + r.s.noisy.toLocaleString() + ' of them can come out uneven).');
    expect(r.s.readout).toContain('its 8px blocks come out 10px on 1280, stray pixels in ' + r.s.noisy.toLocaleString() + ' can be uneven');
    /* (fifth review) one stray, said as one */
    expect(r.o.noisy, 'one block holds a stray').toBe(1);
    expect(r.o.said).toContain('(its 8px blocks come out 10px each, but the stray pixel in 1 of them can come out uneven).');
    expect(r.o.readout).toContain('its 8px blocks come out 10px on 1280, the stray pixel in 1 can be uneven');
    /* and above 1280 a stray is kept at one pixel or lost (test 3 reads the saved file) */
    expect(r.b.noisy).toBeGreaterThan(1);
    expect(r.b.said).toContain('(its 10px blocks come out 8px each, but stray pixels in ' + r.b.noisy.toLocaleString() + ' of them can be lost).');
    expect(r.b.readout).toContain('its 10px blocks come out 8px on 1280, stray pixels in ' + r.b.noisy.toLocaleString() + ' can be lost');
  });
});
