/* ALREADY FIXED - SCALE ONLY.

   A trait that has been hand-edited is finished artwork, not a source to be
   fixed. Putting one back through the detectors returns it at the right size
   and with the wrong pixels: measured on a 37x41 finished image with the
   pixel size forced to 1, which is the closest the tool came to doing
   nothing, 487 of 6068 bytes differed - the engine still quantises colour and
   decides alpha, which is its job and is exactly wrong here.

   So this mode does nothing but scale. The test that matters is the first
   one: byte-for-byte identity at native size. Everything else about the mode
   is a convenience; that is the promise. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A finished piece: one pixel per cell, awkward size, some transparency. */
const loadFinished = (page, W = 37, H = 41) => page.evaluate(async ({ W, H }) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const im = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    im.data[i] = (x * 17) % 256; im.data[i + 1] = (y * 23) % 256;
    im.data[i + 2] = ((x * y) * 7) % 256;
    im.data[i + 3] = (x + y) % 9 === 0 ? 0 : 255;
  }
  g.putImageData(im, 0, 0);
  const before = Array.from(g.getImageData(0, 0, W, H).data);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  await fixLoad(new File([b], 'finished.png', { type: 'image/png' }));
  window.__before = before;
  return before.length;
}, { W, H });

const setMode = (page, v) => page.evaluate((m) => {
  const s = document.getElementById('fixmode');
  s.value = m;
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return s.value;
}, v);

test('scale only returns the picture byte for byte at native size', async ({ page }) => {
  await ready(page);
  await loadFinished(page);
  expect(await setMode(page, 'scale')).toBe('scale');
  const r = await page.evaluate(async () => {
    document.getElementById('fixgrid').checked = false;
    const out = await fixRun();
    const c = fixGridCanvas(out);
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let diff = 0;
    for (let i = 0; i < window.__before.length; i++)
      if (px[i] !== window.__before[i]) diff++;
    return { w: c.width, h: c.height, diff, of: window.__before.length };
  });
  expect(r.w + 'x' + r.h).toBe('37x41');
  /* THE WHOLE POINT. The fixing mode differed in 487 of these bytes. */
  expect(r.diff, 'not one byte may change').toBe(0);
});

test('and at 1280 it is the same picture, larger', async ({ page }) => {
  await ready(page);
  await loadFinished(page, 32, 32);
  await setMode(page, 'scale');
  const r = await page.evaluate(async () => {
    document.getElementById('fixgrid').checked = true;
    const out = await fixRun();
    const c = fixGridCanvas(out);
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < px.length; i += 4)
      seen.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2] + ',' + px[i + 3]);
    const was = new Set();
    for (let i = 0; i < window.__before.length; i += 4)
      was.add(window.__before[i] + ',' + window.__before[i + 1] + ','
        + window.__before[i + 2] + ',' + window.__before[i + 3]);
    return { w: c.width, h: c.height, invented: [...seen].filter(k => !was.has(k)).length };
  });
  expect(r.w + 'x' + r.h).toBe('1280x1280');
  /* 1280/32 is 40 exactly, so nearest neighbour cannot produce a colour that
     was not already there. One that did would be a smoothed resize. */
  expect(r.invented, 'no colour is invented').toBe(0);
});

test('scale only never builds an engine, in a batch either', async ({ page }) => {
  await ready(page);
  await setMode(page, 'scale');
  const r = await page.evaluate(async () => {
    let built = 0;
    const real = window.fixWorker;
    window.fixWorker = function (...a) { built++; return real.apply(this, a); };
    const files = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas'); c.width = 24; c.height = 24;
      const g = c.getContext('2d');
      g.fillStyle = '#2e222f'; g.fillRect(0, 0, 24, 24);
      g.fillStyle = '#8b5fbf'; g.fillRect(i, i, 4, 4);
      const b = await new Promise(res => c.toBlob(res, 'image/png'));
      files.push(new File([b], 'f' + i + '.png', { type: 'image/png' }));
    }
    await fixBatch(files);
    const out = { built, done: fixBatchFiles.length,
      sizes: [...new Set(fixBatchFiles.map(f => f.w + 'x' + f.h))] };
    window.fixWorker = real;
    return out;
  });
  expect(r.done).toBe(3);
  /* Parsing 380 KB of engine to ask it nothing is the one avoidable cost in
     a run of five hundred. */
  expect(r.built, 'no worker is built for a scale run').toBe(0);
  expect(r.sizes).toEqual(['1280x1280']);
});

test('the controls say what this mode does and stop lying about the rest', async ({ page }) => {
  await ready(page);
  await loadFinished(page, 85, 85);
  const fixing = await page.evaluate(() => ({
    button: document.getElementById('fixrun').textContent,
    stepOff: document.getElementById('fixforce').disabled,
  }));
  expect(fixing.button).toBe('Fix it');
  expect(fixing.stepOff).toBe(false);

  await setMode(page, 'scale');
  const scaled = await page.evaluate(() => {
    fixSizeHint();
    return { button: document.getElementById('fixrun').textContent,
      stepOff: document.getElementById('fixforce').disabled,
      hint: document.getElementById('fixsize').textContent };
  });
  expect(scaled.button).toBe('Scale it');
  /* A live field nothing reads is a control that lies. */
  expect(scaled.stepOff, 'the pixel size is not used here').toBe(true);
  /* The readout still says the size and the grid, with no pixel size typed. */
  expect(scaled.hint).toContain('85×85 pixels');
  expect(scaled.hint).toContain('uneven');
  /* AND OFFERS NO OTHER SIZE, because there is nothing being detected to
     choose one for - it would read as advice to go and re-fix finished art. */
  expect(scaled.hint).not.toMatch(/\d+ gives/);
});

test('the fixing mode still offers other sizes, so the silence above means something', async ({ page }) => {
  await ready(page);
  await loadFinished(page, 85, 85);
  await setMode(page, 'fast');
  const hint = await page.evaluate(() => {
    /* SNAP OFF: this asks what a TYPED pixel size is told. Snapping is on
       by default and answers a different question - the grid decides the
       count - so leaving it on would quietly stop covering this. */
    document.getElementById('fixsnap').checked = false;
    FIX.src = { width: 1020, height: 1020 };
    const f = document.getElementById('fixforce');
    f.disabled = false; f.value = '12';
    document.getElementById('fixgrid').checked = true;
    fixSizeHint();
    return document.getElementById('fixsize').textContent;
  });
  /* The positive control for the assertion above: same uneven division, and
     here the offer IS made. Without this, "no sizes offered" could mean the
     readout was broken rather than deliberately quiet. */
  expect(hint).toContain('uneven');
  expect(hint).toMatch(/\d+ gives/);
});

test('the pixel size steps in whole numbers and only whole numbers', async ({ page }) => {
  await ready(page);
  /* ON THE PAGE, not just in the document. The rest of this file drives the
     fixer through evaluate, which reaches a hidden element happily; the
     arrows have to be pressed for real, and a real press needs the tab open
     the way a person opens it. */
  await page.evaluate(() => showPage('fixer', true));
  await page.waitForTimeout(80);
  /* "make it so that when i go up and down on the pixels its never by .00 its
     only whole numbers too". It was step="0.01", so one press of the up arrow
     went 0 to 0.01 and 8 to 12 was four hundred presses. */
  const f = page.locator('#fixforce');
  expect(await f.getAttribute('step')).toBe('1');
  expect(await f.getAttribute('inputmode')).toBe('numeric');

  /* THE ARROWS, driven the way a person drives them rather than by reading
     the attribute back - the attribute is what should make this true, not
     the thing being asserted. */
  await f.fill('7');
  await f.press('ArrowUp');
  expect(await f.inputValue()).toBe('8');
  await f.press('ArrowDown');
  await f.press('ArrowDown');
  expect(await f.inputValue()).toBe('6');

  /* And a fraction typed or pasted in is rounded when the value is meant. */
  await f.fill('12.37');
  await f.blur();
  expect(await f.inputValue()).toBe('12');
  await f.fill('0.4');
  await f.blur();
  expect(await f.inputValue()).toBe('0');

  /* NOT WHILE TYPING. Rounding on every keystroke makes 12 unreachable if you
     pause after the 1 - it snaps to 1 and fights you. */
  await f.fill('');
  await f.type('1', { delay: 20 });
  await page.waitForTimeout(60);
  await f.type('2', { delay: 20 });
  expect(await f.inputValue(), 'typing 12 gives 12, not 1 then 12').toBe('12');
});

test('the fractions that are OUTPUTS keep their decimals', async ({ page }) => {
  await ready(page);
  /* The change is about what is typed. 1280/85 really is 15.06 and the
     readout exists to say so - rounding that away would hide the warning
     this whole feature turns on. */
  const said = await page.evaluate(() => {
    /* SNAP OFF: this asks what a TYPED pixel size is told. Snapping is on
       by default and answers a different question - the grid decides the
       count - so leaving it on would quietly stop covering this. */
    document.getElementById('fixsnap').checked = false;
    FIX.src = { width: 1020, height: 1020 };
    document.getElementById('fixgrid').checked = true;
    const f = document.getElementById('fixforce');
    f.value = '12';
    fixSizeHint();
    return document.getElementById('fixsize').textContent;
  });
  expect(said).toContain('15.06');
  expect(said).toContain('uneven');
});
