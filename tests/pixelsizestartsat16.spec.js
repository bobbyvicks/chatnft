/* The Pixel size box starts at 16.

   "ignore the rules fix, id rather default be 16 now pls" - the owner,
   2026-09-27, after "i shouldnt need rules tho if i want to chang it to 2x2 i
   should be able too". One visible number, which anybody can change; 0 still
   works it out.

   What that changes, and what this file pins:
   - the Snap switch decides nothing while a size is set, so it is greyed out
     and says why - and comes back the moment the size is 0, however the box
     got there (typing, rounding, PB.fix);
   - art drawn at 8px is MERGED 2 to 1 at 16, and the run says so, with the
     one-block strokes at risk. "for the mouth traits i had to basically remake
     them all ... and the eyes are near impossible" - that detail is exactly
     what a merge drops, so it is not left silent;
   - a folder at 16 is not told every file is off the 160 cell grid;
   - scale only does not quote a size it does not use;
   - a size the readout offers gives exactly what it offers.

   Every positive claim here has its control in the same test, one thing
   different, so a clause printed on every run could not pass it.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function' && typeof PB === 'object');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} showPage('fixer', false); });
};

/* 1280 drawn at 8px: the lower half in blocks, and ONE-BLOCK line across the
   transparent upper half - a mouth line, as fixThinStrokes counts one (the
   same colour left and right of it, something else above and below). */
const ART8 = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 80; y < 160; y++) for (let x = 0; x < 160; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  g.fillStyle = '#2e222f'; g.fillRect(40 * 8, 30 * 8, 80 * 8, 8);
`;

/* A 1024x768 with no block structure at all: a smooth diagonal ramp. */
const RAMP = `
  const W = 1024, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, H), d = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; d[i] = (x * 255 / W) | 0; d[i + 1] = (y * 255 / H) | 0; d[i + 2] = ((x + y) * 127 / (W + H)) | 0; d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;

/* The same 1024x768 drawn in 8px blocks: 128x96 cells. */
const BLOCKY = `
  const W = 1024, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < H / 8; y++) for (let x = 0; x < W / 8; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 8, y * 8, 8, 8);
  }
`;

/* The same ramp, square: 1024 across, no blocks. */
const RAMPSQ = RAMP.replace('H = 768', 'H = 1024');

/* A square 960 ramp - 960 has many divisors that land on 1280, so there are
   sizes to offer. */
const RAMP960 = RAMP.replace('W = 1024, H = 768', 'W = 960, H = 960');

/* The 1024x1024 drawn in 8px blocks: 128 cells, which 10 keeps on the canvas. */
const BLOCKYSQ = BLOCKY.replace('H = 768', 'H = 1024');

/* 1280 drawn at 10px and at 5px: blocks 16 cuts across. */
const TEN = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 10, y * 10, 10, 10);
  }
`;
const FIVE = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 5, y * 5, 5, 5);
  }
`;

/* 128x128 at one pixel per cell: every pixel its own colour. */
const SPRITE = `
  const W = 128, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pal = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7', '#45293f', '#c85368'];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    g.fillStyle = pal[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 6];
    g.fillRect(x, y, 1, 1);
  }
`;

/* 96x96 drawn at 4px: 96 does not divide 1280, so a count kept as it is comes
   out uneven on the canvas. */
const NINETYSIX = `
  const W = 96, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 4, y * 4, 4, 4);
  }
`;

/* 64x64 drawn at 4px: narrower than the 80 cells 16 means, so it cannot take it. */
const SMALL = `
  const W = 64, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * 4, y * 4, 4, 4);
  }
`;

/* Load one picture into the tab, leaving the box as it is unless `size` is given. */
const load = (page, src, name = 'one.png') => page.evaluate(async ({ src, name }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  document.getElementById('fixgrid').checked = true;
  document.getElementById('fixsnap').checked = true;
  return fixLoad(new File([blob], name, { type: 'image/png' }));
}, { src, name });

/* Type into the box the way a person does: the value, then an input event. */
const type = (page, v) => page.evaluate((v) => {
  const f = document.getElementById('fixforce');
  f.value = String(v); f.dispatchEvent(new Event('input', { bubbles: true }));
  return f.value;
}, v);

const run = (page) => page.evaluate(async () => {
  const realToast = window.toast; window.toast = () => {};
  const r = await fixRun();
  window.toast = realToast;
  return { cols: r.width, rows: r.height, said: document.getElementById('fixout').textContent };
});

/* Start a run, type into the box while the worker is busy, then let it answer.
   Typing redraws the readout, which asks fixStepFor again and resets every flag
   - so what comes back must be what the run DECIDED, not what the box says now. */
const midRun = (page, typeTo) => page.evaluate(async (typeTo) => {
  const realToast = window.toast; window.toast = () => {};
  const pending = fixRun();
  const f = document.getElementById('fixforce');
  f.value = String(typeTo); f.dispatchEvent(new Event('input', { bubbles: true }));
  const r = await pending;
  window.toast = realToast;
  return { cols: r.width, said: document.getElementById('fixout').textContent };
}, typeTo);

/* The same folder run every folder test uses, with an optional size typed first. */
const folderRun = (page, srcs, size, mode = 'fast') => page.evaluate(async ({ srcs, size, mode }) => {
  const files = [];
  for (let i = 0; i < srcs.length; i++) {
    // eslint-disable-next-line no-new-func
    const c = new Function(srcs[i] + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    files.push(new File([blob], 'mouth' + i + '.png', { type: 'image/png' }));
  }
  const s = document.getElementById('fixmode'); s.value = mode; s.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('fixpal').checked = false;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  if (size !== null) { const f = document.getElementById('fixforce'); f.value = String(size); f.dispatchEvent(new Event('input', { bubbles: true })); }
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  return { said: document.getElementById('fixbatchout').textContent, cells: fixBatchFiles.map(r => r.cells) };
}, { srcs, size, mode });

const switchState = (page) => page.evaluate(() => {
  const sn = document.getElementById('fixsnap');
  return { box: document.getElementById('fixforce').value, greyed: sn.disabled,
    words: sn.closest('label').title, snapping: fixSnapping() };
});

test.describe('the Pixel size box starts at 16', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('A FRESH PAGE SAYS 16, AND THE SNAP SWITCH SAYS IT IS NOT USED', async ({ page }) => {
    const fresh = await switchState(page);
    expect(fresh.box, 'the number in the box').toBe('16');
    expect(fresh.greyed, 'Snap decides nothing while a size is set').toBe(true);
    expect(fresh.words).toContain('Not used while a pixel size is set');
    /* NOT "set 0 to snap": unticked, 0 works the grid out instead. */
    expect(fresh.words).toContain('Set Pixel size to 0 to hand the choice back to this switch');
    expect(fresh.snapping).toBe(false);
    /* THE CONTROL: typing 0 hands the decision back to the switch, with its
       own words back on it - and typing a size takes it away again. */
    await type(page, 0);
    const zero = await switchState(page);
    expect(zero.greyed, 'live again at 0').toBe(false);
    expect(zero.snapping, 'and snapping').toBe(true);
    expect(zero.words, 'with its own words').toContain('Use the collection\'s own cell grid');
    await type(page, 16);
    expect((await switchState(page)).greyed, 'and greyed again at 16').toBe(true);
  });

  test('a size rounded down to 0 gives the switch back too', async ({ page }) => {
    /* 0.4 is a size while it sits there, and rounds to 0 when the field is
       left - which sets the value with no input event. */
    await type(page, '0.4');
    expect((await switchState(page)).greyed).toBe(true);
    const after = await page.evaluate(() => {
      const f = document.getElementById('fixforce');
      f.dispatchEvent(new Event('change', { bubbles: true }));
      return f.value;
    });
    expect(after).toBe('0');
    expect((await switchState(page)).greyed, 'live beside the 0').toBe(false);
  });

  test('EIGHT-PIXEL ART AT 16 IS MERGED, AND THE RUN SAYS SO', async ({ page }) => {
    await load(page, ART8);
    const at16 = await run(page);
    expect(at16.cols, '1280 / 16').toBe(80);
    expect(at16.said).toContain('drawn at 8px blocks (160 cells), merged 2 to 1 onto the 80 cell grid');
    expect(at16.said, 'with the one-block line it may lose').toMatch(/\d+ strokes? one block wide may not survive it/);
    expect(at16.said, 'instead of the engine repeating its instruction').not.toContain('confidence (forced)');
    /* THE CONTROLS, one number different each. 8 is the art's own size: no
       merge, nothing said. 0 works it out: the measured 160, as before. */
    await type(page, 8);
    const at8 = await run(page);
    expect(at8.cols).toBe(160);
    expect(at8.said, 'nothing merged at its own size').not.toContain('merged');
    await type(page, 0);
    const worked = await run(page);
    expect(worked.cols, 'worked out, it is the 160 it is drawn at').toBe(160);
    expect(worked.said).not.toContain('merged');
  });

  test('TYPING DURING A RUN DOES NOT CHANGE WHAT THE RUN SAYS IT DID', async ({ page }) => {
    /* Typing redraws the readout, which asks fixStepFor again and resets every
       flag - while the worker is still busy with the run that was decided at
       16. What that run did is what it must say. */
    await load(page, ART8);
    const said = await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      const pending = fixRun();
      const f = document.getElementById('fixforce');
      f.value = '8'; f.dispatchEvent(new Event('input', { bubbles: true }));
      const r = await pending;
      window.toast = realToast;
      return { cols: r.width, text: document.getElementById('fixout').textContent };
    });
    expect(said.cols, 'the run was decided at 16').toBe(80);
    expect(said.text).toContain('merged 2 to 1 onto the 80 cell grid');
  });

  test('and so for every other thing a run can say it did', async ({ page }) => {
    /* One per flag, each typed to a size that sets NONE of them, or a
       different one, while the worker is busy. */
    await load(page, TEN);
    const recut16 = await midRun(page, 10);
    expect(recut16.cols).toBe(80);
    expect(recut16.said, 'the typed cut it decided').toContain('drawn at 10px blocks (128 cells), which the 80 cell grid cuts across');
    /* The SNAP path's re-cut, decided at 0 and then 16 typed mid-run. */
    await type(page, 0);
    const recut0 = await midRun(page, 16);
    expect(recut0.cols).toBe(160);
    expect(recut0.said, 'the snap re-cut it decided').toContain('re-cut them on the 160 cell grid');
    /* And a resample, decided at 16 and then 0 typed mid-run. */
    await type(page, 16);
    await load(page, RAMPSQ, 'ramp.png');
    const resampled = await midRun(page, 0);
    expect(resampled.cols).toBe(80);
    expect(resampled.said, 'the resample it decided').toContain('no block grid found; resampled from 1024 across');
  });

  test('WITH SAVE AT 1280 OFF A SIZE IS STILL SAID FOR WHAT IT DID', async ({ page }) => {
    /* The switch-off path returned before any flag was set, so a merge there
       was still "medium confidence (forced)". Off, 16 is sixteen picture pixels
       to one: 8px art on 1280 is merged 2 to 1 onto 80 pixels. */
    await load(page, ART8);
    await page.evaluate(() => { document.getElementById('fixgrid').checked = false; });
    const at16 = await run(page);
    expect(at16.cols).toBe(80);
    expect(at16.said).toContain('drawn at 8px blocks (160 cells), merged 2 to 1 onto the 80 cell grid');
    /* THE CONTROL: 8, its own size, merges nothing. */
    await type(page, 8);
    const at8 = await run(page);
    expect(at8.cols).toBe(160);
    expect(at8.said).not.toContain('merged');
  });

  test('A TYPED CUT NAMES THE GRID ITS OWN SIZE MEANS', async ({ page }) => {
    await load(page, TEN);
    const at16 = await run(page);
    expect(at16.said).toContain('drawn at 10px blocks (128 cells), which the 80 cell grid cuts across');
    /* THE CONTROL: at 8 the size's grid is 160, the project's too. */
    await type(page, 8);
    const at8 = await run(page);
    expect(at8.said).toContain('drawn at 10px blocks (128 cells), which the 160 cell grid cuts across');
  });

  test('A PICTURE WITH NO GRID IS RESAMPLED AT 16, AND THE RUN SAYS SO', async ({ page }) => {
    /* 53% of SAVED TRAITS and 13 of the 20 mouths have no pixel grid. The run
       used to call this "medium confidence (forced)". */
    await load(page, RAMPSQ, 'ramp.png');
    const at16 = await run(page);
    expect(at16.cols).toBe(80);
    /* WAS: "..., which kept \d+% of the paint". RAMPSQ is painted edge to edge,
       where any count keeps all the paint, so that figure was 100 by
       construction; patch626 leaves it out there (runsayswhatchanged.spec.js)
       and the next test still pins the measured figure on a picture with
       clear pixels. What 80 cells may lose is said instead. */
    expect(at16.said).toContain('no block grid found; resampled from 1024 across onto the 80 cell grid - small details (text, thin lines, stars) may be lost at 80 cells; 8 keeps more');
    expect(at16.said).not.toContain('of the paint');
    expect(at16.said).not.toContain('confidence (forced)');
    /* THE CONTROL: worked out, it is the gridless search's own sentence -
       said positively, so the negative is about THIS run's words. */
    await type(page, 0);
    const at0 = await run(page);
    expect(at0.said).not.toContain('no block grid found');
    expect(at0.said).toContain('no pixel grid found; put on ');
  });

  test('THE PAINT KEPT IS MEASURED, NOT A FIGURE THAT IS ALWAYS 100', async ({ page }) => {
    /* Every fixture above is opaque edge to edge, where any count keeps all the
       paint. A soft round shape on a clear canvas - a mouth, an eye - loses some
       at its edge, and the sentence has to say how much, on the grid it used. */
    const BLOB = `
      const W = 1024, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      const im = g.createImageData(W, W), d = im.data;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x - 512, dy = (y - 512) * 3, r = Math.sqrt(dx * dx + dy * dy);
        if (r > 300) continue;
        const i = (y * W + x) * 4; d[i] = 200 - (r / 3 | 0); d[i + 1] = 40 + (x & 63); d[i + 2] = 60; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    `;
    await load(page, BLOB, 'blob.png');
    const at16 = await run(page);
    const m = at16.said.match(/which kept (\d+)% of the paint/);
    expect(m, 'the sentence gives a figure: ' + at16.said).not.toBeNull();
    const own = await page.evaluate(() => { const k = fixCellsKept(FIX.src.data, 1024, 1024, 80); return Math.round(k.kept / k.srcN * 100); });
    const at160 = await page.evaluate(() => { const k = fixCellsKept(FIX.src.data, 1024, 1024, 160); return Math.round(k.kept / k.srcN * 100); });
    expect(+m[1], 'the page\'s own measure, on the 80 cells it used').toBe(own);
    expect(own, 'and it is not everything').toBeLessThan(100);
    expect(own, 'nor the figure a different grid would give').not.toBe(at160);
  });

  test('A SPRITE AT ONE PIXEL PER CELL IS RESAMPLED AT 16, AND SAID', async ({ page }) => {
    await load(page, SPRITE, 'sprite.png');
    const at16 = await run(page);
    expect(at16.cols).toBe(80);
    /* The block measure cannot tell a sprite from a render - it finds no
       block of 2 or more in either - so it is said the same way, with the
       width it came from. */
    expect(at16.said).toContain('no block grid found; resampled from 128 across onto the 80 cell grid');
    /* THE CONTROL: worked out, it is kept exactly as it is. */
    await type(page, 0);
    const at0 = await run(page);
    expect(at0.cols).toBe(128);
    expect(at0.said).toContain('kept at one pixel per cell');
  });

  test('TYPE 2 AND IT IS 2x2', async ({ page }) => {
    /* The owner's own example. */
    await load(page, ART8);
    await type(page, 2);
    const r = await run(page);
    expect(r.cols, '1280 / 2').toBe(640);
    expect(r.rows).toBe(640);
  });

  test('PB.fix USES THE BOX, AND LEAVES THE SWITCH TRUE TO IT', async ({ page }) => {
    const r = await page.evaluate(async (src) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(src + '\nreturn c;')();
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const sn = document.getElementById('fixsnap');
      const plain = await PB.fix({ data: d, width: c.width, height: c.height, name: 'a.png' });
      const zero = await PB.fix({ data: d, width: c.width, height: c.height, name: 'a.png', forceStep: 0 });
      const zeroGreyed = sn.disabled;
      const sixteen = await PB.fix({ data: d, width: c.width, height: c.height, name: 'a.png', forceStep: 16 });
      return { plain: plain.width, zero: zero.width, zeroGreyed, sixteen: sixteen.width, sixteenGreyed: sn.disabled };
    }, ART8);
    expect(r.plain, 'no forceStep: the box, which starts at 16').toBe(80);
    expect(r.zero, 'forceStep 0 works it out').toBe(160);
    expect(r.zeroGreyed, 'and the Snap switch is live for it').toBe(false);
    expect(r.sixteen).toBe(80);
    expect(r.sixteenGreyed, 'and greyed again at 16').toBe(true);
  });

  test('A FOLDER AT 16 SAYS WHAT IT MERGED, AND DOES NOT CALL EVERY FILE OFF-GRID', async ({ page }) => {
    const folder = (size) => page.evaluate(async ({ srcs, size }) => {
      const files = [];
      for (let i = 0; i < srcs.length; i++) {
        // eslint-disable-next-line no-new-func
        const c = new Function(srcs[i] + '\nreturn c;')();
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        c.width = 1; c.height = 1;
        files.push(new File([blob], 'mouth' + i + '.png', { type: 'image/png' }));
      }
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixpal').checked = false;
      document.getElementById('fixsnap').checked = true;
      document.getElementById('fixgrid').checked = true;
      if (size !== null) { const f = document.getElementById('fixforce'); f.value = String(size); f.dispatchEvent(new Event('input', { bubbles: true })); }
      const realToast = window.toast; window.toast = () => {};
      await fixBatch(files);
      window.toast = realToast;
      return { said: document.getElementById('fixbatchout').textContent, cells: fixBatchFiles.map(r => r.cells) };
    }, { srcs: [ART8, ART8, TEN, RAMPSQ, FIVE], size });
    const at16 = await folder(null);
    expect(at16.cells, 'all cut to the 80 cells 16 means').toEqual([80, 80, 80, 80, 80]);
    expect(at16.said).toContain('2 drawn in finer blocks (8px) were merged onto the 80 cell grid');
    expect(at16.said, 'naming the files holding one-block detail').toContain('2 of them holding detail one block wide that may not survive it');
    expect(at16.said).toContain('2 were drawn at a block size the 80 cell grid cuts across (5px, 10px)');
    expect(at16.said).toContain('1 with no block grid was resampled onto the 80 cell grid');
    expect(at16.said, 'and not calling them off the 160 grid').not.toContain('not on the 160 cell grid');
    /* THE CONTROL: the same folder worked out - nothing merged or resampled,
       and the off-grid note IS given, for the 5px art kept at its own 256. So
       the negative above is a note switched off, not a note that is gone. */
    const at0 = await folder(0);
    expect(at0.cells.slice(0, 2)).toEqual([160, 160]);
    expect(at0.said).not.toContain('merged onto');
    expect(at0.said).not.toContain('resampled onto');
    expect(at0.said).toContain('not on the 160 cell grid');
  });

  test('SCALE ONLY DOES NOT QUOTE A SIZE IT DOES NOT USE', async ({ page }) => {
    await load(page, SMALL, 'small.png');
    /* THE PRECONDITION: in quick mode 16 really is refused for this 64px
       picture, and the readout says so - so the flag is set. */
    const quick = await page.evaluate(() => { fixSizeHint(); return document.getElementById('fixsize').textContent; });
    expect(quick).toContain('16 means 80 cells on 1280');
    const scale = await page.evaluate(() => {
      const s = document.getElementById('fixmode'); s.value = 'scale';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return document.getElementById('fixsize').textContent;
    });
    expect(scale, 'scale only says the picture, not the greyed-out size').not.toContain('16 means');
    expect(scale, 'and still says something').toContain('64\u00d764');
    /* AND A FLAG FROM THE SNAP PATH: 10px art worked out is re-cut on 160. */
    await page.evaluate(() => { const s = document.getElementById('fixmode'); s.value = 'fast'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await type(page, 0);
    await load(page, TEN, 'ten.png');
    const quick0 = await page.evaluate(() => { fixSizeHint(); return document.getElementById('fixsize').textContent; });
    expect(quick0, 'the precondition').toContain('re-cut on the 160 cell grid');
    const scale0 = await page.evaluate(() => {
      const s = document.getElementById('fixmode'); s.value = 'scale';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return document.getElementById('fixsize').textContent;
    });
    expect(scale0).not.toContain('re-cut');
  });

  test('A SCALE-ONLY FOLDER DOES NOT BLAME THE SIZE FOR WHAT IT KEPT', async ({ page }) => {
    const r = await page.evaluate(async (src) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(src + '\nreturn c;')();
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      const s = document.getElementById('fixmode'); s.value = 'scale'; s.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('fixgrid').checked = true;
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([new File([blob], 'ninetysix.png', { type: 'image/png' })]);
      window.toast = realToast;
      return { box: document.getElementById('fixforce').value, said: document.getElementById('fixbatchout').textContent };
    }, NINETYSIX);
    expect(r.box, 'the box still holds 16, greyed out').toBe('16');
    expect(r.said, 'the uneven one is named').toContain('came back on a pixel count that does not divide 1280');
    expect(r.said).toContain('scale only keeps each picture\'s own count');
    expect(r.said).not.toContain('16 cannot land');
    /* AND ITS OFF-GRID COUNT STANDS: nothing typed decided this file, whatever
       the greyed box holds. */
    expect(r.said, 'scale only keeps the off-grid count').toContain('1 not on the 160 cell grid (1 at 13.33px)');
  });

  test('A SIZE CHANGED BETWEEN FILES IS SAID FILE BY FILE', async ({ page }) => {
    /* The summary is written at the end; each file was cut at the size the box
       held at its own turn. The decoder is wrapped so the box changes between
       the first file and the second - before the second is decided, after the
       first was. */
    await page.evaluate(() => {
      const real = fixDecodeFile; let n = 0;
      fixDecodeFile = async (f) => {
        const d = await real(f);
        if (++n === 2) { const b = document.getElementById('fixforce'); b.value = '8'; b.dispatchEvent(new Event('input', { bubbles: true })); }
        return d;
      };
    });
    const r = await folderRun(page, [ART8, TEN], null);
    expect(r.cells, '16 for the first, 8 for the second').toEqual([80, 160]);
    expect(r.said, 'the merge names the grid ITS file went to').toContain('1 drawn in finer blocks (8px) was merged onto the 80 cell grid');
    expect(r.said, 'the cut names the grid ITS file went to').toContain('1 were drawn at a block size the 160 cell grid cuts across (10px)');
    expect(r.said, 'neither names both').not.toContain('80 and 160');
  });

  test('A PICTURE THAT IS NOT SQUARE IS TOLD SO, AND OFFERED NOTHING A SIZE CANNOT FIX', async ({ page }) => {
    /* It used to read "1280/80 is 16, so pixels come out uneven. 5 gives
       256x192, 10 gives 128x96, 20 gives 64x48 and divide evenly" - none of
       which is even, because the canvas is square and stretches all of them. */
    await load(page, RAMP, 'ramp.png');
    const said = await page.evaluate(() => { fixSizeHint(); return document.getElementById('fixsize').textContent; });
    expect(said).toContain('80\u00d760 pixels');
    expect(said).toContain('not square, so on the 1280 canvas each pixel comes out 16 wide and 21.33 tall');
    expect(said).not.toContain('divide');
    expect(said).not.toContain(' gives ');
    /* THE CONTROL: the square one is even at 16 and says so. */
    await load(page, RAMPSQ, 'rampsq.png');
    const sq = await page.evaluate(() => { fixSizeHint(); return document.getElementById('fixsize').textContent; });
    expect(sq).toContain('\u00d716 to 1280');
    expect(sq).not.toContain('not square');
  });

  test('A SIZE THE READOUT OFFERS GIVES EXACTLY WHAT IT OFFERS', async ({ page }) => {
    /* fixEvenSizes, asked directly - on the default path it is reached only
       when a size comes out uneven. Every offer is typed and run. */
    await load(page, RAMP960, 'ramp960.png');
    await type(page, 0);
    const offered = await page.evaluate(() => fixEvenSizes(0));
    const offers = [...offered.matchAll(/(\d+) gives (\d+)\u00d7(\d+)/g)].map(m => ({ k: +m[1], cols: +m[2], rows: +m[3] }));
    expect(offers.length, 'it offers something: ' + offered).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.cols, 'square, or it would not divide evenly').toBe(o.rows);
      expect(1280 % o.cols, o.cols + ' divides the canvas').toBe(0);
      await type(page, o.k);
      const r = await run(page);
      expect(r.cols + 'x' + r.rows, 'typing ' + o.k).toBe(o.cols + 'x' + o.rows);
    }
    /* AND NEVER A NON-SQUARE ONE. The readout no longer asks for offers on a
       picture that is not square, so this asks directly: every size divides
       1024x768 onto a count that is not square, and none of them is even. */
    await load(page, RAMP, 'ramp.png');
    const notSquare = await page.evaluate(() => fixEvenSizes(0));
    expect(notSquare).toBe('. Nothing divides this image evenly onto the 1280 canvas.');
    await load(page, RAMP960, 'ramp960.png');
    await type(page, 0);
    /* AND NEVER THE SIZE ALREADY TYPED. */
    await type(page, offers[0].k);
    const again = await page.evaluate(() => fixEvenSizes(0));
    expect(again).not.toContain(offers[0].k + ' gives ');
    /* A PICTURE DRAWN IN BLOCKS is told the one canvas size that keeps them. */
    await load(page, BLOCKYSQ, 'blocky.png');
    await type(page, 16);
    const b = await page.evaluate(() => fixEvenSizes(8));
    expect(b).toContain('Type 10 to keep its 8px blocks (128 cells)');
    await type(page, 10);
    const kept = await run(page);
    expect(kept.cols + 'x' + kept.rows, 'and 10 does keep them').toBe('128x128');
  });

  test('THE EDITOR\'S FIX BUTTON LEAVES THE EDITOR ON THE RESULT\'S GRID', async ({ page }) => {
    /* One click merged an 8px trait to 16 and left the grid, the brush and the
       "drawn at" readout on 8. */
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false); activeWs = null; await dbClear(); LAYERS = ['hats', 'unsorted'];
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
        g.fillStyle = (x === 2 || y === 2 || x === 13 || y === 13) ? '#2e222f' : ['#8b5fbf', '#f2a65a'][(x + y) % 2];
        g.fillRect(x * 8, y * 8, 8, 8);
      }
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await dbPut({ id: 't_box_hats_wip', kind: 'trait', name: 'box', layer: 'hats', status: 'wip', blob, w: 128, h: 128, rarity: 1, at: 1 });
      await openTraitRecord(await dbGet('t_box_hats_wip'));
      window.toast = () => {};
      const opened = gridBlock;
      await editorFix();
      const at16 = { block: gridBlock, w: art.width };
      /* THE CONTROL: undo, 0 in the box, fix again - a different result, and
         the editor follows that one instead. */
      document.getElementById('undo').click();
      const f = document.getElementById('fixforce'); f.value = '0'; f.dispatchEvent(new Event('input', { bubbles: true }));
      await editorFix();
      return { opened, at16, at0: { block: gridBlock, w: art.width } };
    });
    expect(r.opened, 'it opened on its own 8px blocks').toBe(8);
    expect(r.at16.w).toBe(1280);
    expect(r.at16.block, '80 cells on 1280').toBe(16);
    expect(r.at0.block, 'worked out: its own 16 cells on 1280').toBe(80);
  });

  test('UNDO PUTS THE GRID BACK WITH THE PIXELS, AND SCALE ONLY KEEPS ITS OWN', async ({ page }) => {
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false); activeWs = null; await dbClear(); LAYERS = ['hats', 'unsorted'];
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
        g.fillStyle = (x === 2 || y === 2 || x === 13 || y === 13) ? '#2e222f' : ['#8b5fbf', '#f2a65a'][(x + y) % 2];
        g.fillRect(x * 8, y * 8, 8, 8);
      }
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await dbPut({ id: 't_box_hats_wip', kind: 'trait', name: 'box', layer: 'hats', status: 'wip', blob, w: 128, h: 128, rarity: 1, at: 1 });
      await openTraitRecord(await dbGet('t_box_hats_wip'));
      window.toast = () => {};
      const opened = { block: gridBlock, w: art.width };
      await editorFix();
      const fixed = { block: gridBlock, w: art.width };
      document.getElementById('undo').click();
      const undone = { block: gridBlock, w: art.width };
      document.getElementById('redo').click();
      const redone = { block: gridBlock, w: art.width };
      document.getElementById('undo').click();
      /* SCALE ONLY: the picture untouched, taken up to 1280 - ten times the
         canvas, so its 8px blocks are 80px blocks now, not "one per pixel". */
      const s = document.getElementById('fixmode'); s.value = 'scale'; s.dispatchEvent(new Event('change', { bubbles: true }));
      await editorFix();
      const scaled = { block: gridBlock, w: art.width };
      return { opened, fixed, undone, redone, scaled };
    });
    expect(r.opened).toEqual({ block: 8, w: 128 });
    expect(r.fixed).toEqual({ block: 16, w: 1280 });
    expect(r.undone, 'undo: the 8px art AND its 8px grid').toEqual({ block: 8, w: 128 });
    expect(r.redone, 'redo: the fix and its grid again').toEqual({ block: 16, w: 1280 });
    expect(r.scaled, 'scale only keeps its blocks, ten times larger').toEqual({ block: 80, w: 1280 });
  });
});
