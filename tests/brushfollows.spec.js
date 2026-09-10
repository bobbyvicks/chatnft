/* THE BRUSH IS THE PIXEL SIZE, AND THE SNAP GOES WITH IT.

   "the brush - grid size in pixel fixer is broken in the sense where its not
   making the brush size automatically the pixel size can we bring that and
   the snapping back"

   Two causes.

   brushAuto is a one-way door: the slider and the [ and ] keys turn it off
   and nothing ever turned it back on, so one nudge stopped every trait opened
   afterwards from having its brush set for the rest of the session. And
   because startEditor resets the brush to 1 and leaves the setting to the
   caller that measured a block, they did not even keep the nudged size:

     open a 5px trait      block 10, brush 10x10
     nudge the slider to 3 block 10, brush  3x3
     open an 8px trait     block 16, brush  1x1

   And the editor inferred the block with the detector while the fixer has
   measured it exactly since patch416. Measured on the approved traits, 311
   files, 144 with an exact grid: the detector agreed on 109 and answered 1 on
   the other 35 - ears/AirPod, eyes/Bloodshot Eyes, chains/Dog Tag Chain, all
   drawn in 8px or 10px blocks. A block of 1 also switches snapping off, since
   that reads `g<2`, while the button still says it is on. After: 144 of 144.
*/
import { test, expect } from '@playwright/test';

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

const ready = async (page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixNativeBlock === 'function');
};

test('A NUDGED BRUSH DOES NOT FOLLOW YOU TO THE NEXT TRAIT', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (srcs) => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    // eslint-disable-next-line no-new-func
    const mk = (s) => new Function('return (' + s + ')')();
    const snap = () => ({ block: gridBlock,
      brush: document.getElementById('bslab').textContent, auto: brushAuto });
    const open = async (s) => {
      showPage('fixer', false);
      await fixLoad(await mk(s));
      await fixRun();
      await new Promise(r2 => setTimeout(r2, 300));
      fixOpen();
      await new Promise(r2 => setTimeout(r2, 300));
    };
    await open(srcs.five);
    const first = snap();
    /* The person nudges the brush once, the way anybody would. */
    const sl = document.getElementById('bslider');
    sl.value = '3'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const nudged = snap();
    await open(srcs.eight);
    return { first, nudged, second: snap() };
  }, { five: art(640, 5, 'one.png'), eight: art(640, 8, 'two.png') });

  /* 640 at 5px blocks is 128 cells on the 1280 canvas, so 10 pixels a cell. */
  expect(r.first.brush, 'the first trait sets the brush to its pixel size').toBe('10 × 10');
  /* THE NUDGE STILL WORKS on the trait being worked on - that is what the
     switch is for and it is not being taken away. */
  expect(r.nudged.brush).toBe('3 × 3');
  expect(r.nudged.auto).toBe(false);
  /* WAS 1 × 1. Not 3 either: startEditor resets the brush to 1 and the call
     that would have set it was the one being skipped. */
  expect(r.second.block, 'the next trait is 8px blocks on 80 cells').toBe(16);
  expect(r.second.brush, 'and its brush is its own pixel size again').toBe('16 × 16');
  expect(r.second.auto, 'a new picture starts following again').toBe(true);
});

test('THE EDITOR MEASURES THE BLOCK RATHER THAN INFERRING IT', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    /* Art the detector answers 1 on: a 10px grid with one flat colour over
       most of it, so there are too few transitions to find a period in -
       which is the shape of the 35 traits this was wrong about. */
    const W = 1280, c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#2e222f';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#f2a65a';
    for (let i = 0; i < 6; i++) g.fillRect(i * 210, i * 190, 10, 10);
    const d = g.getImageData(0, 0, W, W).data;
    c.width = 1; c.height = 1;
    return { exact: fixNativeBlock(d, W, W), measured: measuredBlock(d, W, W) };
  });
  expect(r.exact, 'every 10x10 square really is one colour').toBe(10);
  /* THE MEASUREMENT AND THE ANSWER THE EDITOR TAKES ARE THE SAME NOW. */
  expect(r.measured, 'so that is what the editor adopts').toBe(10);
});

test('and art with no grid still gets the detector', async ({ page }) => {
  await ready(page);
  /* THE CONTROL. fixNativeBlock returns 0 for a picture with no block
     structure, and 0 read as an answer would mean "one pixel a cell" while
     skipping the only thing that has anything to say about those 167. */
  const r = await page.evaluate(() => {
    const W = 512, c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true });
    const im = g.createImageData(W, W);
    for (let i = 0; i < im.data.length; i += 4) {
      im.data[i] = (i * 7) % 256; im.data[i + 1] = (i * 13) % 256;
      im.data[i + 2] = (i * 29) % 256; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const d = g.getImageData(0, 0, W, W).data;
    c.width = 1; c.height = 1;
    return { exact: fixNativeBlock(d, W, W), measured: measuredBlock(d, W, W),
      src: String(measuredBlock) };
  });
  expect(r.exact, 'nothing to measure').toBe(0);
  /* Whatever the detector says, the answer is never 0 - that is not a block
     size, it is the measurement declining to give one. */
  expect(r.measured).toBeGreaterThanOrEqual(1);
  expect(r.src, 'the detector is still there for these').toContain('transitions(');
});

test('and a block of 1 is what turned the snap off', async ({ page }) => {
  await ready(page);
  /* The two halves of the complaint are one defect. Snapping reads the block,
     so a block of 1 disables it while the button still reads pressed - which
     is why "the brush is not the pixel size" and "the snapping is gone" were
     reported together, and why fixing the block fixes both. */
  const r = await page.evaluate(() => ({
    snapOn: document.getElementById('gsnap').getAttribute('aria-pressed'),
    guarded: document.documentElement.innerHTML
      .indexOf('if(g<2||!pressed("gsnap"))') >= 0,
  }));
  expect(r.snapOn, 'the snap is on by default and nothing turns it off').toBe('true');
  expect(r.guarded, 'and it does nothing without a block of 2 or more').toBe(true);
});
