/* A SIZE YOU TYPED BEATS A SIZE I MEASURED.

   "were trying to make glasses 4 pixels and we have it set to that but its
   rendering to 5 pixels no matter what"

   Reproduced on all sixteen approved glasses, asking each for 4:

     Snap on    Dark Lens Sunglasses  -> 5   (it measures 5)
                Wake Me Up Sleep Mask -> 5   (it measures 5)
                the other fourteen    -> 10 or 8, never 4
     Snap off   all sixteen           -> 4

   patch416 made the measured block beat the declared grid, which was right -
   projectGrid said 160, the art is drawn at 128 cells, and forcing the
   setting was deleting up to 23% of a trait. It also beat a number somebody
   typed, and the box was greyed out while the snap was on, so there was no
   way to ask for 4 at all without giving up the snap.

   A measurement should beat a SETTING. It has no business beating an
   INSTRUCTION. After: all sixteen come out at 4, snap on or off.
*/
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const GLASSES = 'E:/X content/pixel art_/APPROVED TRAITS - WEBSITE UPLOAD/glasses';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixStepFor === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
};

/* Block art at a given cell size, as a data URL the page can turn into a File. */
const art = (S, cell, name) => `
  (async () => {
    const c = document.createElement('canvas');
    c.width = ${S}; c.height = ${S};
    const g = c.getContext('2d');
    for (let y = 0; y < ${S} / ${cell}; y++) for (let x = 0; x < ${S} / ${cell}; x++) {
      g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
      g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    return new File([b], ${JSON.stringify(name)}, { type: 'image/png' });
  })()
`;

/* Run one picture through the batch and read the block size off the file. */
const runAt = (page, src, snap, force) => page.evaluate(async (o) => {
  // eslint-disable-next-line no-new-func
  const file = await new Function('return (' + o.src + ')')();
  const sn = document.getElementById('fixsnap');
  sn.checked = o.snap; sn.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('fixgrid').checked = true;
  const ff = document.getElementById('fixforce');
  ff.disabled = false; ff.value = String(o.force);
  ff.dispatchEvent(new Event('input', { bubbles: true }));
  await fixBatch([file]);
  const got = fixBatchFiles[0];
  if (!got) return { err: document.getElementById('fixbatchout').textContent };
  return { cells: got.cells, block: got.w / got.cells, saved: got.w + 'x' + got.h };
}, { src, snap, force });

test('ASKING FOR 4 GIVES 4, ON ART THAT MEASURES 5', async ({ page }) => {
  await ready(page);
  /* 1280 drawn in 5px blocks is exactly what Dark Lens Sunglasses is, and it
     is the case that came back 5 no matter what was typed. */
  const r = await runAt(page, art(1280, 5, 'fives.png'), true, 4);
  expect(r.block, 'the size asked for').toBe(4);
  expect(r.cells).toBe(320);
  expect(r.saved, 'still on the collection canvas').toBe('1280x1280');
});

test('and with nothing typed the picture still decides', async ({ page }) => {
  await ready(page);
  /* THE CONTROL, and the thing that must not be broken to fix the above: 0
     has always meant work it out, and what it works out is the grid the
     picture is actually drawn on. Forcing the declared 160 here cost 202 of
     319 traits a percent or more of their pixels. */
  const r = await runAt(page, art(1280, 5, 'fives.png'), true, 0);
  expect(r.block, "the picture's own 5px blocks").toBe(5);
  expect(r.cells).toBe(256);
});

test('and the box is live again, because it decides something', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (src) => {
    showPage('fixer', false);
    // eslint-disable-next-line no-new-func
    await fixLoad(await new Function('return (' + src + ')')());
    const at = (snap) => {
      const sn = document.getElementById('fixsnap');
      sn.checked = snap; sn.dispatchEvent(new Event('change', { bubbles: true }));
      return document.getElementById('fixforce').disabled;
    };
    const snapOn = at(true), snapOff = at(false);
    const s = document.getElementById('fixmode');
    s.value = 'scale'; s.dispatchEvent(new Event('change', { bubbles: true }));
    const scale = document.getElementById('fixforce').disabled;
    return { snapOn, snapOff, scale,
      title: document.getElementById('fixforce').title };
  }, art(1280, 5, 'fives.png'));
  /* It was greyed out while the snap was on, for the honest reason that a
     live box changing no answer is a control that lies. It changes the
     answer now, so it is live. */
  expect(r.snapOn, 'live while snapping').toBe(false);
  expect(r.snapOff).toBe(false);
  /* SCALE ONLY STILL TURNS IT OFF, and that one is still true: there the
     picture really is already one pixel per cell. */
  expect(r.scale, 'except in scale only').toBe(true);
});

test('THE READOUT SAYS WHAT THE RUN WILL DO, in every state', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (src) => {
    showPage('fixer', false);
    // eslint-disable-next-line no-new-func
    await fixLoad(await new Function('return (' + src + ')')());
    const say = (snap, force) => {
      const sn = document.getElementById('fixsnap');
      sn.checked = snap; sn.dispatchEvent(new Event('change', { bubbles: true }));
      const ff = document.getElementById('fixforce');
      ff.disabled = false; ff.value = String(force);
      ff.dispatchEvent(new Event('input', { bubbles: true }));
      /* And what the run itself would use, from the one place that decides. */
      const step = fixStepFor(FIX.src.width, FIX.src.data, FIX.src.height);
      return { text: document.getElementById('fixsize').textContent,
        runCells: Math.round(FIX.src.width / step) };
    };
    return { snapZero: say(true, 0), snapFour: say(true, 4), offFour: say(false, 4) };
  }, art(1280, 5, 'fives.png'));

  /* Was "160x160 pixels, x8 to 1280" for the first two - the declared grid,
     on a picture about to come out at 256 and 320. A readout that describes a
     different answer than the one about to be produced is worse than none. */
  expect(r.snapZero.text).toContain('256×256');
  expect(r.snapZero.runCells, 'and that is what the run does').toBe(256);
  expect(r.snapFour.text).toContain('320×320');
  expect(r.snapFour.runCells).toBe(320);
  expect(r.offFour.text).toContain('320×320');
  expect(r.offFour.runCells).toBe(320);
});

test('and the cache cannot hand a batch the wrong block', async ({ page }) => {
  await ready(page);
  /* The measurement is cached on the loaded picture so the readout is not
     paying 39ms a keystroke. Keyed on being the very array FIX.src holds - a
     cache keyed on width would give every 1280 file in a folder run the block
     size of whatever the other tab happens to have open. */
  const r = await page.evaluate(async (srcs) => {
    showPage('fixer', false);
    // eslint-disable-next-line no-new-func
    const mk = (s) => new Function('return (' + s + ')')();
    /* Ten pixel art loaded in the single tab. */
    await fixLoad(await mk(srcs.ten));
    const loaded = FIX.native;
    /* Five pixel art through the batch, same width, different pixels. */
    const sn = document.getElementById('fixsnap');
    sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('fixgrid').checked = true;
    const ff = document.getElementById('fixforce');
    ff.disabled = false; ff.value = '0';
    await fixBatch([await mk(srcs.five)]);
    const got = fixBatchFiles[0];
    return { loaded, batchCells: got.cells, batchBlock: got.w / got.cells };
  }, { ten: art(1280, 10, 'ten.png'), five: art(1280, 5, 'five.png') });

  expect(r.loaded, 'the loaded picture measured 10').toBe(10);
  /* THE ONE THAT MATTERS: the batch file is 5px art of the same width, and it
     gets 5 - not the 10 sitting in the cache. */
  expect(r.batchBlock, 'the batch measured its own pixels').toBe(5);
  expect(r.batchCells).toBe(256);
});

test('THE REAL GLASSES, ALL OF THEM, AT 4', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  await ready(page);
  const files = fs.existsSync(GLASSES)
    ? fs.readdirSync(GLASSES).filter(f => /\.png$/i.test(f)) : [];
  /* Skipped rather than passed vacuously if the folder is not on this
     machine - a test that quietly checks nothing is worse than one that
     says it could not run. */
  test.skip(!files.length, 'the approved traits folder is not on this machine');
  const bad = [];
  for (const name of files) {
    const b64 = fs.readFileSync(path.join(GLASSES, name)).toString('base64');
    const r = await page.evaluate(async (o) => {
      const bin = atob(o.b64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const sn = document.getElementById('fixsnap');
      sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('fixgrid').checked = true;
      const ff = document.getElementById('fixforce');
      ff.disabled = false; ff.value = '4';
      ff.dispatchEvent(new Event('input', { bubbles: true }));
      await fixBatch([new File([u], o.name, { type: 'image/png' })]);
      const got = fixBatchFiles[0];
      return got ? { block: got.w / got.cells, saved: got.w + 'x' + got.h }
        : { err: document.getElementById('fixbatchout').textContent };
    }, { b64, name });
    if (r.block !== 4 || r.saved !== '1280x1280') bad.push(name + ': ' + JSON.stringify(r));
  }
  /* Every one of them came back 5, 8 or 10 before. */
  expect(bad, 'glasses that did not come out at 4 pixels').toEqual([]);
});
