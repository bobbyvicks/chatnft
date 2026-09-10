/* OPEN IN THE EDITOR HANDS YOU THE SIZE THE SAVE WILL WRITE.

   "i just spent a very long time editng a trait onn the site and when i go to
   save to grid its still saving small asf instead of 1280"

   fixOpen started the editor at the fixer's own output - 160 across - and
   never read the 1280 switch. saveTrait and download both write art.width, so
   every save off that canvas was 160. The switch governed the Download button
   and the batch and not the editor, which is the third way out.

   The test that carries the ask is the round trip: open, then ask what a save
   would write. A test that only checked art.width would pass on a version
   that opened at 1280 and saved something else. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A source the fixer answers at a size that is NOT 1280, so "the editor is
   1280" cannot be true by accident. */
const fix = (page, on) => page.evaluate(async (grid) => {
  const W = 1280, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const g = c.getContext('2d');
  const cell = 8, n = W / cell;
  for (let y = Math.floor(n * 0.3); y < n; y++) for (let x = 0; x < n; x++) {
    const k = (x * 5 + y * 3) % 4;
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][k];
    g.fillRect(x * cell, y * cell, cell, cell);
  }
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  await fixLoad(new File([b], 'trait.png', { type: 'image/png' }));
  document.getElementById('fixgrid').checked = grid;
  const out = await fixRun();
  return { cells: out.width + 'x' + out.height };
}, on);

const opened = (page) => page.evaluate(() => {
  fixOpen();
  /* What a save would actually write, through the canvas saveTrait uses -
     not just what the editor says its canvas is. */
  const c = traitCanvas({});
  const size = c.width + 'x' + c.height;
  return { art: art.width + 'x' + art.height, wouldSave: size, name: fileName };
});

test('THE SWITCH ON: the editor opens at 1280 and a save writes 1280', async ({ page }) => {
  await ready(page);
  const r = await fix(page, true);
  /* The fixer's own answer is 160 cells - the size the editor used to open at
     and the size every save off it wrote. */
  expect(r.cells).toBe('160x160');
  const o = await opened(page);
  expect(o.art, 'the canvas you are handed').toBe('1280x1280');
  expect(o.wouldSave, 'and what a save writes off it').toBe('1280x1280');
});

test('the switch off: it opens at the size that would be saved then too', async ({ page }) => {
  await ready(page);
  await fix(page, false);
  const o = await opened(page);
  /* THE POSITIVE CONTROL. If the editor were simply hard-wired to 1280 this
     would still say 1280, and the test above would prove nothing about the
     switch. Off means native, and native is what the download writes too. */
  expect(o.art).toBe('160x160');
  expect(o.wouldSave).toBe('160x160');
});

test('one switch, one answer, across all three ways out', async ({ page }) => {
  await ready(page);
  await fix(page, true);
  const r = await page.evaluate(async () => {
    /* The download. */
    const dl = fixGridCanvas(FIX.out);
    const dlSize = dl.width + 'x' + dl.height;
    dl.width = 1; dl.height = 1;
    /* The batch, on the same picture. */
    const c = document.createElement('canvas');
    c.width = FIX.src.width; c.height = FIX.src.height;
    const g = c.getContext('2d');
    const im = g.createImageData(FIX.src.width, FIX.src.height);
    im.data.set(FIX.src.data); g.putImageData(im, 0, 0);
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    await fixBatch([new File([b], 'trait.png', { type: 'image/png' })]);
    const batchSize = fixBatchFiles[0].w + 'x' + fixBatchFiles[0].h;
    return { dlSize, batchSize };
  });
  const o = await opened(page);
  /* The switch was built as "one answer to what a save is". The editor was
     the door it did not reach. */
  expect([r.dlSize, r.batchSize, o.wouldSave])
    .toEqual(['1280x1280', '1280x1280', '1280x1280']);
});

test('the trait keeps its pixels, just at the collection size', async ({ page }) => {
  await ready(page);
  await fix(page, true);
  const r = await page.evaluate(() => {
    const before = FIX.out;
    const colours = (d) => {
      const s = new Set();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8)
        s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return s;
    };
    const was = colours(before.data);
    fixOpen();
    const now = colours(ctx.getImageData(0, 0, art.width, art.height).data);
    return { was: was.size, now: now.size,
      invented: [...now].filter(k => !was.has(k)).length };
  });
  /* 1280/160 is 8 exactly and the scale is nearest neighbour, so opening
     bigger cannot invent a colour. One that did would be a smoothed resize. */
  expect(r.invented, 'no colour is invented by opening at 1280').toBe(0);
  expect(r.now).toBe(r.was);
});
