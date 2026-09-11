/* THE PROJECT PALETTE, AND CHANGING A TRAIT ONTO IT.

   "make this the default colour pallete on the site and can we make a
   'change colours to pallete button' that will automatically detect colours
   and put them to the closest version of the colour that is on the trait
   (green turns to a different shade of green to accomidate" ...
   "i need it to show both tho" ... "in fix pixels ^ and png edit"

   The palette was already baked in - PALETTE_HEX holds all 256 of Mrkt Mkrs
   256, the Resurrect 64 expansion, with its source and a hash of those
   colours in that order. What it was not was reachable while drawing: the
   swatch panel is built from the colours found IN THE PICTURE, so painting a
   colour the trait did not already contain meant the colour picker, one at a
   time, by eye.

   And the nearest-colour arithmetic existed only as a REPORT: the rules audit
   walks a trait, skips what is already in the palette, and works out the
   nearest palette colour and its distance for the rest. Nothing applied it.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function');
};

/* A trait in colours deliberately NOT in the palette, with a transparent
   stripe so alpha has something to be preserved in. */
const openOffPalette = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  const S = 160, d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (y < S / 2) { d[i] = 40; d[i + 1] = 150; d[i + 2] = 55; }
    else { d[i] = 190; d[i + 1] = 45; d[i + 2] = 38; }
    d[i + 3] = (x < 4) ? 0 : 255;
  }
  fileName = 'probe.png';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));
  return S;
});

const offPaletteCount = (page) => page.evaluate(() => {
  const W = art.width, H = art.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  const pal = new Set(paletteList().map(h => h.toLowerCase()));
  let off = 0;
  for (let i = 0; i < W * H; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const h = '#' + ((d[i * 4] << 16 | d[i * 4 + 1] << 8 | d[i * 4 + 2]) >>> 0)
      .toString(16).padStart(6, '0');
    if (!pal.has(h)) off++;
  }
  return off;
});

test('BOTH SETS ARE ON THE PANEL AT ONCE', async ({ page }) => {
  await ready(page);
  await openOffPalette(page);
  const r = await page.evaluate(() => ({
    trait: document.querySelectorAll('#pal .sw').length,
    project: document.querySelectorAll('#projpal .sw').length,
    note: document.getElementById('projpalnote').textContent,
    /* Every view classed .swatches must hold the SAME set - recolour.spec.js
       asserts that, and the project palette is a different set, so it must
       not carry that class. */
    swatchViews: [...document.querySelectorAll('.swatches')].map(g => g.id),
  }));
  expect(r.trait, 'the colours in the picture').toBe(2);
  expect(r.project, 'and all 256 of the collection').toBe(256);
  expect(r.swatchViews, 'the project palette is not a second trait grid')
    .not.toContain('projpal');
  expect(r.note).toContain('Mrkt Mkrs 256');
  expect(r.note).toContain('256 colours');
});

test('and the project palette is the one that is baked in', async ({ page }) => {
  await ready(page);
  await openOffPalette(page);
  /* Not a copy that can drift: the swatches are paletteList() in order. */
  const r = await page.evaluate(() => ({
    shown: [...document.querySelectorAll('#projpal .sw')].map(s => s.dataset.hex),
    real: paletteList(),
  }));
  expect(r.shown).toEqual(r.real);
});

test('CHANGE COLOURS TO PALETTE PUTS A GREEN ON A GREEN', async ({ page }) => {
  await ready(page);
  await openOffPalette(page);
  expect(await offPaletteCount(page), 'the fixture is off-palette to start')
    .toBeGreaterThan(1000);
  const r = await page.evaluate(() => {
    const S = art.width;
    const at = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]]; };
    const greenBefore = at(10, 10), redBefore = at(10, S - 10);
    const realToast = window.toast; let said = '';
    window.toast = (m) => { said = String(m); };
    try { document.getElementById('palsnap').click(); } finally { window.toast = realToast; }
    return { greenBefore, redBefore, greenAfter: at(10, 10), redAfter: at(10, S - 10),
      clearKept: at(1, 10), said,
      note: document.getElementById('palsnapnote').textContent };
  });
  /* Every opaque pixel is now a palette colour. */
  expect(await offPaletteCount(page), 'nothing off the palette is left').toBe(0);
  /* A GREEN BECAME A GREEN, which is the ask in its own words. Green is the
     largest channel before and after; it does not land on a red. */
  const greenest = (c) => c[1] > c[0] && c[1] > c[2];
  expect(greenest(r.greenBefore)).toBe(true);
  expect(greenest(r.greenAfter), 'the green is still a green').toBe(true);
  const reddest = (c) => c[0] > c[1] && c[0] > c[2];
  expect(reddest(r.redBefore)).toBe(true);
  expect(reddest(r.redAfter), 'and the red is still a red').toBe(true);
  /* ALPHA IS NOT TOUCHED. */
  expect(r.clearKept[3], 'a transparent pixel stays transparent').toBe(0);
  /* And it says what it did, including how far the worst one had to go. */
  expect(r.note).toContain('2 colours moved');
  expect(r.note).toContain('furthest');
  expect(r.said).toContain('Changed to the palette');
});

test('and art already on the palette is left exactly alone', async ({ page }) => {
  await ready(page);
  /* THE CONTROL. A version that re-matched every colour to itself would pass
     the test above and would rewrite every trait in the collection for
     nothing - and would report a change that did not happen. */
  const r = await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    await dbClear();
    const pal = paletteList();
    const S = 64, d = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const h = pal[(x + y) % pal.length];
      const i = (y * S + x) * 4;
      d[i] = parseInt(h.slice(1, 3), 16);
      d[i + 1] = parseInt(h.slice(3, 5), 16);
      d[i + 2] = parseInt(h.slice(5, 7), 16);
      d[i + 3] = 255;
    }
    fileName = 'onpal.png';
    startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
    await new Promise(r2 => setTimeout(r2, 250));
    const before = ctx.getImageData(0, 0, S, S).data.slice();
    const realToast = window.toast; let said = '';
    window.toast = (m) => { said = String(m); };
    try { document.getElementById('palsnap').click(); } finally { window.toast = realToast; }
    const after = ctx.getImageData(0, 0, S, S).data;
    let differs = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) differs++;
    return { differs, said, note: document.getElementById('palsnapnote').textContent };
  });
  expect(r.differs, 'not one byte changed').toBe(0);
  expect(r.note).toBe('already on the palette');
  expect(r.said).toContain('already in the palette');
});

test('and it is one undo', async ({ page }) => {
  await ready(page);
  await openOffPalette(page);
  const r = await page.evaluate(async () => {
    const S = art.width;
    const before = ctx.getImageData(0, 0, S, S).data.slice();
    const realToast = window.toast; window.toast = () => {};
    try { document.getElementById('palsnap').click(); } finally { window.toast = realToast; }
    const changed = ctx.getImageData(0, 0, S, S).data.slice();
    /* The button, not a function called undo - there is not one. */
    document.getElementById('undo').click();
    await new Promise(r2 => setTimeout(r2, 200));
    const back = ctx.getImageData(0, 0, S, S).data;
    let movedAtAll = 0, restored = 0;
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== changed[i]) movedAtAll++;
      if (before[i] !== back[i]) restored++;
    }
    return { movedAtAll, restored };
  });
  expect(r.movedAtAll, 'it really did change the picture').toBeGreaterThan(1000);
  expect(r.restored, 'and one undo puts all of it back').toBe(0);
});

test('THE FIXER CAN DO IT TO A WHOLE FOLDER', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    showPage('fixer', false);
    const mk = async (name) => {
      const S = 640, c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d');
      for (let y = 0; y < S / 5; y++) for (let x = 0; x < S / 5; x++) {
        g.fillStyle = ['rgb(40,150,55)', 'rgb(190,45,38)', 'rgb(33,77,160)',
          'rgb(240,225,90)'][(x + y) % 4];
        g.fillRect(x * 5, y * 5, 5, 5);
      }
      const b = await new Promise(r2 => c.toBlob(r2, 'image/png'));
      c.width = 1; c.height = 1;
      return new File([b], name, { type: 'image/png' });
    };
    const run = async (on) => {
      const p = document.getElementById('fixpal');
      p.checked = on; p.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('fixgrid').checked = true;
      const ff = document.getElementById('fixforce');
      ff.disabled = false; ff.value = '0';
      await fixBatch([await mk('t.png')]);
      const got = fixBatchFiles[0];
      const bm = await createImageBitmap(new Blob([got.data], { type: 'image/png' }));
      const cv = document.createElement('canvas');
      cv.width = bm.width; cv.height = bm.height;
      const gg = cv.getContext('2d', { willReadFrequently: true });
      gg.drawImage(bm, 0, 0); if (bm.close) bm.close();
      const d = gg.getImageData(0, 0, cv.width, cv.height).data;
      const N = cv.width * cv.height; cv.width = 1; cv.height = 1;
      const pal = new Set(paletteList().map(h => h.toLowerCase()));
      let off = 0;
      for (let i = 0; i < N; i++) {
        if (d[i * 4 + 3] === 0) continue;
        const h = '#' + ((d[i * 4] << 16 | d[i * 4 + 1] << 8 | d[i * 4 + 2]) >>> 0)
          .toString(16).padStart(6, '0');
        if (!pal.has(h)) off++;
      }
      return { off, said: document.getElementById('fixbatchout').textContent };
    };
    const offRun = await run(false);
    const onRun = await run(true);
    return { offRun, onRun,
      defaultOn: document.getElementById('fixpal').defaultChecked };
  });
  /* ON BY DEFAULT, REVERSED. This read "OFF BY DEFAULT: it rewrites every
     colour, which is not a thing to do to somebody's art because they
     pressed Fix it" - and that was answering the wrong question. This tab
     already rebuilds every pixel of the picture on a grid it worked out;
     putting those pixels on the collection palette is the same kind of act,
     not a new liberty. Asked for in as many words: "i want the site to
     detect that and change it to the colour thats closest to it".

     It is still a switch - on by default is not the same as always - and
     the run still says what it did to every file. */
  expect(r.defaultOn, 'it does it unless told not to').toBe(true);
  expect(r.offRun.off, 'turned off, the colours are the picture own')
    .toBeGreaterThan(1000);
  expect(r.offRun.said, 'and nothing is claimed').not.toContain('palette');
  /* ON: the written file is entirely on the palette, and the run says so. */
  expect(r.onRun.off, 'every pixel of the file is a palette colour').toBe(0);
  expect(r.onRun.said).toContain('put on the palette');
  expect(r.onRun.said).toContain('colours moved across');
});

test('AND THE EDITOR SAYS WHAT IS OFF THE PALETTE WITHOUT BEING ASKED',
  async ({ page }) => {
    await ready(page);
    await openOffPalette(page);
    /* specCheck could always answer this - it is what the agent panel prints -
       but you had to go to that panel and press something. It is the line
       under the button that fixes it now, written whenever the swatches are
       rebuilt, so it is right again after anything that changes the colours. */
    const r = await page.evaluate(async () => {
      const onOpen = document.getElementById('palsnapnote').textContent;
      const realToast = window.toast; window.toast = () => {};
      try { document.getElementById('palsnap').click(); } finally { window.toast = realToast; }
      const afterPress = document.getElementById('palsnapnote').textContent;
      document.getElementById('undo').click();
      await new Promise(r2 => setTimeout(r2, 200));
      return { onOpen, afterPress,
        afterUndo: document.getElementById('palsnapnote').textContent };
    });
    expect(r.onOpen, 'it noticed on its own').toContain('2 colours not in the palette');
    expect(r.afterPress, 'and then says what it did').toContain('2 colours moved');
    /* THE ONE THAT MAKES IT USEFUL: undo puts the colours back, so the line
       has to go back to describing them. A note written once at open would
       still be claiming the trait was fixed. */
    expect(r.afterUndo, 'and is right again after an undo')
      .toContain('2 colours not in the palette');
  });

test('and it says so when there is nothing to say', async ({ page }) => {
  await ready(page);
  /* THE CONTROL. A line that only ever appears when something is wrong leaves
     you unable to tell "checked and fine" from "never ran". */
  const r = await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    await dbClear();
    const pal = paletteList();
    const S = 64, d = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const h = pal[(x + y) % pal.length], i = (y * S + x) * 4;
      d[i] = parseInt(h.slice(1, 3), 16);
      d[i + 1] = parseInt(h.slice(3, 5), 16);
      d[i + 2] = parseInt(h.slice(5, 7), 16);
      d[i + 3] = 255;
    }
    fileName = 'onpal.png';
    startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
    await new Promise(r2 => setTimeout(r2, 250));
    return document.getElementById('palsnapnote').textContent;
  });
  expect(r).toBe('every colour is in the palette');
});
