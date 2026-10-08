/* A FOLDER SAYS EACH FILE AS IT WAS SAVED (patch635).

   Each file of a folder run is saved by the Save at 1280 switch as it stands when that file finishes (fixGridPixels
   reads it then), and the gate judges it then too. The summary's grid clauses - the uneven clause, the stray clause,
   the off-grid clause - read the switch once, when the run ends. So a switch flipped part way described every file
   by the last setting: turned on, a file saved at its own size was counted as uneven at 1280; turned off, a file
   saved at 1280 went unsaid. Found by the last review of patch634; older than it (df3a344's uneven clause does it).
   Now each file records the switch as its save read it, and the clauses count the files saved at 1280.

   On the engine path the switch can also decide the cut, only when a size is typed and has a count that lands on
   1280: with it on, a picture that holds the count is cut to it and a smaller one keeps its own block; with it off
   the size is source pixels per cell. An uneven file cut with the switch off whose cut would have landed with it on,
   then saved with it on, is uneven because the switch moved, and the uneven clause says so instead of blaming the
   size; otherwise the clause keeps its own advice.

   Pictures are built in the page and written with its own pngEncode. Controls, where a test has them, are the same
   folder with the switch left on (and for tests 1 and 3, left off) the whole run. AGAINST THE PAGE BEFORE patch635
   (d47d902) tests 1-6, 8, 10 and 11 are red at their claims; tests 7, 9, 12 and 13 are guards that pass there by
   design. Round 2 of this patch, which said "turned on after they were cut" for any uneven file cut with the switch
   off, fails 3, 8, 9, 12 and 13 (test 7 has no flip and passes there too). Round 3, which counted only pictures at
   least as big as the count, fails 10. Round 4 passes all 13 (tests 12 and 13 guard against wrong rules it does not
   have). Measured 2026-10-07 (red-r5-on-*.txt in the patch635 scratch folder). (Review of round 1 added the stray flips, the save-time flip, the size-typed engine flip
   and the off controls; review of round 2 added test 9, the singular, the counts in test 8 and the cause assertions
   in tests 3 and 6; review of round 3 added tests 10 and 11 and fixed test 3's engine count; review of round 4 added
   test 12, a small picture the switch changes but whose own blocks do not land, and test 13, the one picture that is
   not square, which a cutLands without its height test fails.) */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fileWithPath === 'function' && typeof pngEncode === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

const install = (page) => page.evaluate(() => {
  const COLS = [[0x2e, 0x22, 0x2f], [0x8b, 0x5f, 0xbf], [0xf2, 0xa6, 0x5a], [0xe8, 0xd5, 0xb7]];
  const S = {};
  /* n x n in `block` px blocks, neighbours always differing; stray: one odd pixel in every stray-th block, placed
     at a varying spot */
  S.blocks = (n, block, stray) => {
    const d = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d.set([...COLS[(Math.floor(x / block) * 5 + Math.floor(y / block) * 3) % 4], 255], (y * n + x) * 4);
    if (stray) { const nb = n / block; let k = 0;
      for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) if (k++ % stray === 0)
        d.set([0x11, 0x99, 0x44, 255], ((by * block + (bx * 3 + by) % block) * n + bx * block + (bx + by) % block) * 4); }
    return d;
  };
  /* n x n of one colour with a few single-pixel dots: no blocks */
  S.dots = (n) => { const d = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < n * n; i++) d.set([0x44, 0x50, 0x5c, 255], i * 4);
    d.set([0x8b, 0x5f, 0xbf, 255], (10 * n + 10) * 4); d.set([0xf2, 0xa6, 0x5a, 255], (5 * n + 20) * 4); return d; };
  S.png = async (d, n, h) => new Uint8Array(await pngEncode(d, n, h || n));
  /* w x h of one colour with two single-pixel dots, like S.dots */
  S.dotsWH = (w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set([0x44, 0x50, 0x5c, 255], i * 4);
    d.set([0x8b, 0x5f, 0xbf, 255], (10 * w + 10) * 4); d.set([0xf2, 0xa6, 0x5a, 255], (5 * w + 20) * 4); return d; };
  S.setMode = (m) => { const el = document.getElementById('fixmode'); el.value = m; el.dispatchEvent(new Event('change', { bubbles: true })); };
  S.grid = () => document.getElementById('fixgrid');
  /* a folder run whose Save at 1280 switch is `start`, and is set to `after` once the first file is done - the
     tile is drawn right after a file is recorded, so the second file is saved by the new setting */
  /* where: 'tile' flips after the first file is recorded; 'save' flips inside the first file's pngEncode, between its
     saved pixels and its record; 'cut' flips when the first file is sent to the engine, after its cut. The flips are
     synchronous, inside the page's own calls, where no click can land - each stands for a flip made at any time
     between the two things it falls between. */
  /* 'cutN' flips at the Nth file's cut instead of the first; `engines` fixes how many files the run cuts ahead of
     saving (fixEnginesFor), so which files are cut before a flip does not depend on the machine */
  S.folder = async (files, start, after, where, engines) => {
    const g = S.grid(); g.checked = start; g.dispatchEvent(new Event('change', { bubbles: true }));
    const realTile = window.fixTile, realEnc = window.pngEncode, realAsk = window.fixAsk, realEng = window.fixEnginesFor; let n = 0;
    const at = where && where.startsWith('cut') ? (+where.slice(3) || 1) : 1;
    const flip = () => { if (++n === at && after !== undefined) g.checked = after; };
    if (!where || where === 'tile') window.fixTile = function () { const r = realTile.apply(this, arguments); flip(); return r; };
    if (where === 'save') window.pngEncode = function () { flip(); return realEnc.apply(this, arguments); };
    if (where && where.startsWith('cut')) window.fixAsk = function () { flip(); return realAsk.apply(this, arguments); };
    if (engines) window.fixEnginesFor = () => engines;
    const realToast = window.toast; window.toast = () => {};
    try { await fixBatch(files.map(([rel, bytes]) => fileWithPath(bytes, rel))); }
    finally { window.toast = realToast; window.fixTile = realTile; window.pngEncode = realEnc; window.fixAsk = realAsk; window.fixEnginesFor = realEng; }
    return { said: document.getElementById('fixbatchout').textContent, saved: fixBatchFiles.map(f => f.w + 'x' + f.h) };
  };
  window.__W = S;
});

test.describe('a folder says each file as it was saved', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); await install(page); });

  test('SAVE AT 1280 TURNED ON PART WAY: the file saved at its own size is not counted as uneven, off the grid or with strays at 1280', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('scale');
      const a = await S.png(S.blocks(1000, 8), 1000), b = await S.png(S.blocks(1024, 8, 7), 1024);
      const files = [['backgrounds/a.png', a], ['backgrounds/b.png', b]];
      return { flip: await S.folder(files, false, true), on: await S.folder(files, true), off: await S.folder(files, false) };
    });
    /* PRECONDITION: the first file saved at its own size, the second at 1280 */
    expect(r.flip.saved).toEqual(['1000x1000', '1280x1280']);
    expect(r.flip.said, 'the gate names the first file').toContain('1 because it is not saved at 1280');
    /* THE CLAIM: only the second file is described at 1280 */
    expect.soft(r.flip.said, 'the 1000 file was not saved at 1280').not.toContain('does not divide 1280');
    expect.soft(r.flip.said).toContain('1 not on the 160 cell grid (1 at 10px)');
    expect.soft(r.flip.said).toContain('stray pixels in blocks that land on 1280; the strays can come out uneven');
    /* CONTROLS, ONE THING AWAY: on the whole run, both are at 1280; off the whole run, neither clause */
    expect(r.on.saved).toEqual(['1280x1280', '1280x1280']);
    expect(r.on.said).toContain('1 came back on a pixel count that does not divide 1280');
    expect(r.on.said).toContain('2 not on the 160 cell grid');
    expect(r.off.said).not.toContain('cell grid (');
    expect(r.off.said).not.toContain('stray pixels');
    expect(r.off.said).not.toContain('does not divide 1280');
  });

  test('SAVE AT 1280 TURNED OFF PART WAY: the file saved at 1280 is still counted', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('scale');
      const a = await S.png(S.blocks(1000, 8), 1000), b = await S.png(S.blocks(1024, 8, 7), 1024);
      return { flip: await S.folder([['backgrounds/a.png', a], ['backgrounds/b.png', b]], true, false) };
    });
    expect(r.flip.saved).toEqual(['1280x1280', '1024x1024']);
    /* (review) the strays here are the second file's, saved at its own size; the stray flips are test 4 */
    /* THE CLAIM: the first file, saved at 1280, is said; the second, saved at its own size, is not */
    expect.soft(r.flip.said).toContain('1 came back on a pixel count that does not divide 1280');
    expect.soft(r.flip.said).toContain('1 not on the 160 cell grid (1 at 10.24px)');
    expect.soft(r.flip.said).not.toContain('stray pixels');
  });

  test('AND ON THE ENGINE PATH: a Quick folder with the switch turned on part way counts the one file saved at 1280', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = false;
      const f = document.getElementById('fixforce'); f.value = '0';
      const d = await S.png(S.dots(128), 128);
      const files = [['backgrounds/a.png', d], ['backgrounds/b.png', d]];
      /* two engines, so the second file is cut before the first is saved - with the switch off - and saved after the
         flip: the case the cause assertion below is about, on any machine */
      return { flip: await S.folder(files, false, true, 'tile', 2), on: await S.folder(files, true), off: await S.folder(files, false) };
    });
    expect(r.flip.saved[1]).toBe('1280x1280');
    expect(r.flip.saved[0]).not.toBe('1280x1280');
    /* THE CLAIM */
    expect(r.flip.said).toMatch(/· 1 not on the 160 cell grid/);
    /* and with no size typed the switch never decides a cut, so a flip is never the cause given */
    expect(r.flip.said).not.toContain('turned on after they were cut');
    /* CONTROLS: on the whole run, both; off, neither */
    expect(r.on.said).toMatch(/· 2 not on the 160 cell grid/);
    expect(r.off.said).not.toContain('cell grid (');
  });

  test('THE STRAY CLAUSE FOLLOWS EACH FILE TOO: strays saved at their own size are not said, strays saved at 1280 are', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('scale');
      const s = await S.png(S.blocks(1024, 8, 7), 1024), a = await S.png(S.blocks(1000, 8), 1000);
      const files = [['backgrounds/s.png', s], ['backgrounds/a.png', a]];
      return { onLater: await S.folder(files, false, true), offLater: await S.folder(files, true, false), on: await S.folder(files, true) };
    });
    /* PRECONDITIONS: the flips happened */
    expect(r.onLater.saved).toEqual(['1024x1024', '1280x1280']);
    expect(r.offLater.saved).toEqual(['1280x1280', '1000x1000']);
    /* THE CLAIM */
    expect.soft(r.onLater.said, 'strays saved at their own size').not.toContain('stray pixels');
    expect.soft(r.offLater.said, 'strays saved at 1280').toContain('stray pixels in blocks that land on 1280; the strays can come out uneven');
    /* CONTROL: on the whole run, the strays are said */
    expect(r.on.said).toContain('stray pixels in blocks that land on 1280; the strays can come out uneven');
  });

  test('A FLIP BETWEEN A FILE\'S SAVE AND ITS RECORD: the record follows the save', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('scale');
      const a = await S.png(S.blocks(1000, 8), 1000), b = await S.png(S.blocks(1024, 8), 1024);
      return { flip: await S.folder([['backgrounds/a.png', a], ['backgrounds/b.png', b]], false, true, 'save') };
    });
    /* PRECONDITION: the first file's pixels were taken with the switch off */
    expect(r.flip.saved).toEqual(['1000x1000', '1280x1280']);
    /* THE CLAIM: the first file is not counted as uneven at 1280 */
    expect(r.flip.said).not.toContain('does not divide 1280');
    expect(r.flip.said).toContain('1 not on the 160 cell grid (1 at 10px)');
  });

  test('ON THE ENGINE PATH A FILE CUT WITH THE SWITCH OFF AND SAVED WITH IT ON is said as such, not blamed on the size', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
      const a = await S.png(S.dots(1000), 1000);
      return { flip: await S.folder([['backgrounds/a.png', a]], false, true, 'cut'), on: await S.folder([['backgrounds/a.png', a]], true) };
    });
    /* PRECONDITION: saved at 1280; that the cut was made with the switch off shows in the claim itself */
    expect(r.flip.saved).toEqual(['1280x1280']);
    /* THE CLAIM: all of them flipped, so the flip is the cause and nothing is counted beside it */
    expect(r.flip.said).toContain('1 came back on a pixel count that does not divide 1280, so their pixels are uneven - Save at 1280 was turned on after they were cut');
    expect(r.flip.said).not.toContain('cannot land on 1280');
    expect(r.flip.said).not.toMatch(/of them (was|were) cut/);
    /* CONTROL, ONE THING AWAY: the switch on the whole run - 16 means 80 cells, which land */
    expect(r.on.said).not.toContain('does not divide 1280');
  });

  test('NO FLIP, A PICTURE WHOSE OWN COUNT DOES NOT LAND: the cause named is Snap or a size, not a flip', async ({ page }) => {
    /* An uneven file cut and saved with the switch on: here Snap off and no size, the picture's own count. (A typed
       24 is replaced by 20 while the switch is on - "pixel size 20 was used, not 24", measured - but not every size
       is: 3 has no landing count within a quarter and stays uneven; test 9 uses it.) Never said as a flip. */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = false;
      const f = document.getElementById('fixforce'); f.value = '0';
      const a = await S.png(S.dots(1000), 1000);
      return { on: await S.folder([['backgrounds/a.png', a]], true) };
    });
    /* PRECONDITION: saved at 1280 on a count that does not divide it */
    expect(r.on.saved).toEqual(['1280x1280']);
    expect(r.on.said).toContain('1 came back on a pixel count that does not divide 1280');
    /* THE CLAIM: cut and saved with the switch on, so the advice is Snap or a size */
    expect(r.on.said).toContain(' - turn Snap on, or type a size');
    expect(r.on.said).not.toContain('turned on after they were cut');
  });

  test('PART OF A FOLDER FLIPPED BETWEEN CUT AND SAVE: the size reason names the rest, the flipped ones are counted beside it', async ({ page }) => {
    /* Size 16 means 80 cells on the canvas. Three engines, so all three files are cut before any is saved; the switch
       goes on at the third cut, after it is read. A 1000px file cut with it off gets 62 cells where its cut would have
       landed on 80 - flipped. A 48px file cut with it off gets 3 cells; with it on it is too small for 80 and keeps
       its own block, which the page measures as 16 - 3 cells again, which do not land either, so the switch did not
       make it uneven. All are saved with it on. Measured on the patched page: 1000px {cells 62, cutLands true}, 48px
       {cells 3, cutLands false}. */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
      const big = await S.png(S.dots(1000), 1000), small = await S.png(S.dots(48), 48);
      const one = await S.folder([['backgrounds/a.png', big], ['backgrounds/b.png', small], ['backgrounds/c.png', small]], false, true, 'cut3', 3);
      const two = await S.folder([['backgrounds/a.png', big], ['backgrounds/b.png', big], ['backgrounds/c.png', small]], false, true, 'cut3', 3);
      return { one, two };
    });
    /* PRECONDITION: all saved at 1280, all three uneven */
    expect(r.one.saved).toEqual(['1280x1280', '1280x1280', '1280x1280']);
    expect(r.one.said).toContain('3 came back on a pixel count that does not divide 1280');
    expect(r.two.said).toContain('3 came back on a pixel count that does not divide 1280');
    /* THE CLAIM: the size reason is for the rest, and the flipped are counted, one and more than one */
    expect.soft(r.one.said).toContain(' - 16 cannot land on 1280 for 2 of them, and 1 of them was cut with Save at 1280 off and saved with it on');
    expect.soft(r.two.said).toContain(' - 16 cannot land on 1280 for 1 of them, and 2 of them were cut with Save at 1280 off and saved with it on');
    expect.soft(r.one.said).not.toContain('turned on after they were cut');
  });

  test('A FLIP THE CUT DID NOT DEPEND ON: no size, or a size that cannot land, keeps its own advice', async ({ page }) => {
    /* Found by review of round 2: with no size typed, or one with no landing count (3: 427 cells, the nearest that
       lands is 320, outside a quarter), fixStepFor cuts the same with the switch on or off - so a flip between cut and
       save changes nothing, and the clause must give the advice that helps, not the flip. */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      const f = document.getElementById('fixforce');
      document.getElementById('fixsnap').checked = false; f.value = '0';
      const a = await S.png(S.dots(1000), 1000);
      const none = await S.folder([['backgrounds/a.png', a]], false, true, 'cut');
      f.disabled = false; f.value = '3';
      const three = await S.folder([['backgrounds/a.png', a]], false, true, 'cut');
      return { none, three };
    });
    /* PRECONDITION: saved at 1280, uneven */
    expect(r.none.saved).toEqual(['1280x1280']);
    expect(r.none.said).toContain('1 came back on a pixel count that does not divide 1280');
    expect(r.three.said).toContain('1 came back on a pixel count that does not divide 1280');
    /* THE CLAIM */
    expect.soft(r.none.said).toContain(' - turn Snap on, or type a size');
    expect.soft(r.none.said).not.toContain('turned on after they were cut');
    expect.soft(r.three.said).toContain(' - 3 cannot land on 1280 for them');
    expect.soft(r.three.said).not.toContain('turned on after they were cut');
  });
  test('A PICTURE TOO SMALL FOR THE TYPED SIZE, flipped between cut and save: its own block would have landed, so the flip is the cause', async ({ page }) => {
    /* 48px drawn in 6px blocks, size 16 (80 cells on the canvas). Switch on: too small for 80, it keeps its own 6px
       block - 8 cells, which land. Switch off: 16px per cell - 3 cells, which do not. (A 40px picture in 8px blocks
       was tried first: off, 2.5 rounds to 2 cells, which land - measured.) Found by review of round 3, whose cutLands
       counted only pictures at least as big as the count. */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
      const a = await S.png(S.blocks(48, 6), 48);
      return { flip: await S.folder([['backgrounds/a.png', a]], false, true, 'cut'), on: await S.folder([['backgrounds/a.png', a]], true) };
    });
    /* PRECONDITION: saved at 1280 and uneven after the flip; with the switch on the whole run, not uneven */
    expect(r.flip.saved).toEqual(['1280x1280']);
    expect(r.flip.said).toContain('1 came back on a pixel count that does not divide 1280');
    expect(r.on.said).not.toContain('does not divide 1280');
    /* THE CLAIM */
    expect(r.flip.said).toContain(' - Save at 1280 was turned on after they were cut');
    expect(r.flip.said).not.toContain('cannot land on 1280');
    expect(r.flip.said).not.toMatch(/of them (was|were) cut/);
  });

  test('A FILE SAVED BEFORE THE FLIP IS NOT COUNTED AS FLIPPED: only the one cut off and saved on is', async ({ page }) => {
    /* Two engines, so both 1000px files are cut with the switch off (62 cells each, where 80 would land); the switch
       goes on inside the first file's save, after its record read the switch, so the first is saved at its own size
       and only the second at 1280. Kills round 3's mutant m10 (the flipped count without onCanvas), which survived. */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
      const a = await S.png(S.dots(1000), 1000);
      return { flip: await S.folder([['backgrounds/a.png', a], ['backgrounds/b.png', a]], false, true, 'save', 2) };
    });
    /* PRECONDITION: the first saved at its own 62 cells, the second at 1280 */
    expect(r.flip.saved).toEqual(['62x62', '1280x1280']);
    /* THE CLAIM */
    expect(r.flip.said).toContain('1 came back on a pixel count that does not divide 1280, so their pixels are uneven - Save at 1280 was turned on after they were cut');
    expect(r.flip.said).not.toMatch(/of them (was|were) cut/);
  });
  test('A SMALL PICTURE THE SWITCH CUTS DIFFERENTLY BUT WHOSE OWN BLOCKS DO NOT LAND: not the flip\'s doing', async ({ page }) => {
    /* 42px in 3px blocks, size 16. Switch on: too small for 80 cells, it keeps its own 3px block - 14 cells, which do
       not land. Switch off: 16px per cell - 3 cells, which do not either. The switch changed the cut, but with it on the
       file would be uneven too, so the flip is not the cause (a rule asking "did the switch change the cut" says it is:
       review of round 4). The reason given is the size's, as on the page before patch635 (KNOWN AND LEFT). */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
      const a = await S.png(S.blocks(42, 3), 42);
      return { flip: await S.folder([['backgrounds/a.png', a]], false, true, 'cut'), on: await S.folder([['backgrounds/a.png', a]], true) };
    });
    /* PRECONDITION: uneven after the flip, and uneven with the switch on the whole run too */
    expect(r.flip.said).toContain('1 came back on a pixel count that does not divide 1280');
    expect(r.on.said).toContain('1 came back on a pixel count that does not divide 1280');
    /* THE CLAIM */
    expect(r.flip.said).not.toContain('turned on after they were cut');
  });

  test('A WIDE SHORT PICTURE: wide enough for the count but too short for it keeps its own block, so the height decides', async ({ page }) => {
    /* 1000 x 48, size 16 (80 cells). Switch on: 48 rows are fewer than 80, so it keeps its own block - the page
       measures 8px, 125 cells, which do not land (measured by review of round 5; this test runs no switch-on control).
       Switch off: 62 cells, which do not either. Not the flip's doing; a cutLands that read only the width would say it
       is (round 4's surviving mutant m17). */
    const r = await page.evaluate(async () => {
      const S = window.__W; S.setMode('fast');
      document.getElementById('fixsnap').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
      const a = await S.png(S.dotsWH(1000, 48), 1000, 48);
      return { flip: await S.folder([['backgrounds/a.png', a]], false, true, 'cut') };
    });
    /* PRECONDITION */
    expect(r.flip.said).toContain('1 came back on a pixel count that does not divide 1280');
    /* THE CLAIM */
    expect(r.flip.said).not.toContain('turned on after they were cut');
  });
});
