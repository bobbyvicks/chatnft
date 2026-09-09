/* The Fix pixels tab.

   Retro Diffusion's Pixel Art Fixer, ported to JavaScript and running in the
   page. The engine's own agreement with the Python it came from is measured
   outside the browser, image by image, in pixelfixer-js/tools/test-detect.js
   and test-endtoend.js - that is where "does it find the right grid" is
   answered, and repeating it here would only test a slower copy of it.

   What this file is for is everything between the engine and a person: that
   the tab exists and hides the other pages, that an image can be handed to
   it, that the work happens OFF the main thread, that the answer is shown
   before anything is done with it, and that "Open in the editor" hands the
   result to startEditor exactly as a dropped PNG would.

   THE FIXTURE IS REAL FAKE PIXEL ART: a 16-cell sprite blown up by 3, which
   is precisely the thing the tool exists to undo. Asserting it comes back at
   16x16 is asserting the engine ran, in the browser, through the worker -
   not that a canvas was drawn on. */
import { test, expect } from '@playwright/test';

/* A 48x48 PNG that is a 16x16 sprite at 3x, built in the page and handed to
   the tab as a File - the same object a drop or a file chooser produces. */
const feed = (page, scale = 3, n = 16) => page.evaluate(async ({ scale, n }) => {
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  /* EVERY CELL COLOURED INDEPENDENTLY, which took a wrong answer to get
     right. The first fixture used pal[((x >> 1) + (y >> 2)) % 4], so
     neighbouring pixels shared a colour in pairs - and the detector
     answered 8x8, correctly: a 16-cell sprite of 2x2 blocks IS an 8-cell
     sprite at twice the scale, and the reference's own README names that
     trap ("that period is very often the content scale, not the pixel
     scale"). A fixture whose true grid is ambiguous cannot be used to ask
     what grid something found.

     A cheap deterministic hash per cell, so adjacent cells almost never
     agree and 16 is the only period in the picture. Deterministic because
     an expected size has to be a fact, not a sample. */
  const pal = ['#2e222f', '#45293f', '#7a3045', '#c85368', '#e8c170', '#4b3d44'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = ((x * 73856093) ^ (y * 19349663) ^ ((x * y) * 83492791)) >>> 0;
    g.fillStyle = pal[k % pal.length];
    g.fillRect(x, y, 1, 1);
  }
  const big = document.createElement('canvas');
  big.width = n * scale; big.height = n * scale;
  const bg = big.getContext('2d');
  bg.imageSmoothingEnabled = false;
  bg.drawImage(c, 0, 0, n * scale, n * scale);
  const blob = await new Promise(r => big.toBlob(r, 'image/png'));
  const file = new File([blob], 'fake.png', { type: 'image/png' });
  await fixLoad(file);
  return { w: big.width, h: big.height };
}, { scale, n });

const runFix = (page) => page.evaluate(async () => {
  const r = await fixRun();
  return r && { cols: r.cols, rows: r.rows, consensus: r.consensus,
    confidence: r.confidence, w: r.width, h: r.height };
});

test.describe('the Fix pixels tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixLoad === 'function');
  });

  test('IS A TAB AT THE TOP, and its page hides the others', async ({ page }) => {
    const r = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.pgtab')].map(b => b.dataset.page);
      showPage('fixer', false);
      const seen = id => { const e = document.getElementById(id); const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0; };
      return { tabs, page: document.getElementById('land').getAttribute('data-page'),
        fixerShown: seen('fixer'),
        agentHidden: !seen('aggrids'), homeHidden: !seen('drop'),
        current: document.querySelector('.pgtab[data-page="fixer"]').getAttribute('aria-current') };
    });
    expect(r.tabs, 'a fifth tab, after the four that were there').toEqual(['home', 'project', 'agent', 'fixer']);
    expect(r.page).toBe('fixer');
    expect(r.fixerShown, 'its own page is on screen').toBe(true);
    expect(r.agentHidden, 'and the agent page is not').toBe(true);
    expect(r.homeHidden, 'nor the main one').toBe(true);
    expect(r.current, 'and the tab is marked as where you are').toBe('page');
  });

  test('only offers a mode the engine answers to', async ({ page }) => {
    /* core.detect throws by name on "full" - the arbitration pass is not
       ported. A menu offering it would be a button that fails on its first
       press, which is how this read before it was measured. */
    const r = await page.evaluate(() => ({
      values: [...document.getElementById('fixmode').options].map(o => o.value),
      picked: document.getElementById('fixmode').value,
    }));
    expect(r.values).toEqual(['fast']);
    expect(r.picked).toBe('fast');
  });

  test('TAKES AN IMAGE, SHOWS IT, AND WAITS TO BE TOLD TO GO', async ({ page }) => {
    await page.evaluate(() => showPage('fixer', false));
    const size = await feed(page);
    const r = await page.evaluate(() => ({
      before: { w: document.getElementById('fixbefore').width, h: document.getElementById('fixbefore').height },
      pairShown: !document.getElementById('fixpair').hidden,
      runEnabled: !document.getElementById('fixrun').disabled,
      actsHidden: document.getElementById('fixacts').hidden,
      said: document.getElementById('fixout').textContent,
      cap: document.getElementById('fixbeforecap').textContent,
    }));
    expect(r.before, 'the image as it came in').toEqual({ w: size.w, h: size.h });
    expect(r.pairShown).toBe(true);
    expect(r.runEnabled, 'and now Fix it can be pressed').toBe(true);
    expect(r.actsHidden, 'but nothing can be done with a result there is not').toBe(true);
    expect(r.said).toContain('48×48');
    expect(r.cap).toContain('as it came in');
  });

  test('REBUILDS A 3x FAKE AT ITS NATIVE 16x16, IN A WORKER', async ({ page }) => {
    /* The whole point, end to end and in the browser. A 16-cell sprite at
       3x has to come back 16x16 - and the engine that decides that is in a
       <script type="text/plain"> the page never executes, so if the worker
       were not started this returns nothing at all. */
    await page.evaluate(() => showPage('fixer', false));
    await feed(page, 3, 16);
    const r = await runFix(page);
    expect(r, 'the run produced an answer').not.toBeNull();
    expect({ cols: r.cols, rows: r.rows }, 'the native size, recovered').toEqual({ cols: 16, rows: 16 });
    expect(r.w, 'and the canvas it wrote is that size').toBe(16);
    expect(r.h).toBe(16);
    expect(r.confidence, 'a clean 3x is the case the quick pass is sure of').toBe('high');

    const after = await page.evaluate(() => ({
      w: document.getElementById('fixafter').width,
      h: document.getElementById('fixafter').height,
      cap: document.getElementById('fixaftercap').textContent,
      acts: !document.getElementById('fixacts').hidden,
      progressGone: document.getElementById('fixprog').hidden,
      said: document.getElementById('fixout').textContent,
    }));
    expect(after.w).toBe(16);
    expect(after.cap).toContain('16×16');
    /* RENAMED, not relaxed. The control and the caption call this the PIXEL
       SIZE now - "i'd rather it be pixel size instead of cell" - and the
       number it names is unchanged, so this asserts the same fact in the
       words the page uses. */
    expect(after.cap).toContain('pixel size 3');
    expect(after.acts, 'and now there is something to do with it').toBe(true);
    expect(after.progressGone, 'the progress bar is put away').toBe(true);
    expect(after.said).toContain('high confidence');
  });

  test('and the engine is text the page never runs itself', async ({ page }) => {
    /* If the bundle were a live <script> it would parse on every page load,
       on every page, for a tab most visits never open - and it would run on
       the main thread. Both are why it is text. */
    const r = await page.evaluate(() => {
      const el = document.getElementById('pfcore');
      return { type: el.type, bytes: el.textContent.length,
        onMainThread: typeof PF !== 'undefined' };
    });
    expect(r.type).toBe('text/plain');
    expect(r.bytes, 'and it is the whole engine').toBeGreaterThan(300000);
    expect(r.onMainThread, 'the page itself never defines PF').toBe(false);
  });

  test('OPENS THE RESULT IN THE EDITOR THE WAY A DROPPED FILE DOES',
    async ({ page }) => {
      await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); showPage('fixer', false); });
      await feed(page, 3, 16);
      await runFix(page);
      await page.evaluate(() => fixOpen());
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => ({
        editorOpen: !document.getElementById('app').hidden,
        art: art.width + 'x' + art.height,
        name: fileName,
        colours: document.querySelectorAll('#pal .sw').length,
      }));
      expect(r.editorOpen, 'the editor is up').toBe(true);
      expect(r.art, 'holding the rebuilt pixels at their own size').toBe('16x16');
      expect(r.name, 'under a name that says what it is').toContain('-fixed.png');
      expect(r.colours, 'with a palette read off it, as any opened file gets')
        .toBeGreaterThan(1);
    });

  test('refuses what it cannot work on, and says why', async ({ page }) => {
    await page.evaluate(() => showPage('fixer', false));
    const tooSmall = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      c.getContext('2d').fillRect(0, 0, 8, 8);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      await fixLoad(new File([b], 'tiny.png', { type: 'image/png' }));
      return { said: document.getElementById('fixout').textContent,
        canRun: !document.getElementById('fixrun').disabled };
    });
    expect(tooSmall.said, 'the reason, in the words a person would use').toContain('Too small');
    expect(tooSmall.canRun, 'and there is nothing to press').toBe(false);

    const notAnImage = await page.evaluate(async () => {
      await fixLoad(new File(['not a picture'], 'x.txt', { type: 'text/plain' }));
      return document.getElementById('fixout').textContent;
    });
    expect(notAnImage).toContain('not an image');
  });

  test('and PB.fix does the same run without a mouse', async ({ page }) => {
    await page.evaluate(() => showPage('fixer', false));
    const r = await page.evaluate(async () => {
      const n = 16, scale = 3;
      const c = document.createElement('canvas'); c.width = n; c.height = n;
      const g = c.getContext('2d');
      const pal = ['#2e222f', '#45293f', '#7a3045', '#c85368', '#e8c170', '#4b3d44'];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const k = ((x * 73856093) ^ (y * 19349663) ^ ((x * y) * 83492791)) >>> 0;
        g.fillStyle = pal[k % pal.length]; g.fillRect(x, y, 1, 1);
      }
      const big = document.createElement('canvas');
      big.width = n * scale; big.height = n * scale;
      const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false;
      bg.drawImage(c, 0, 0, n * scale, n * scale);
      const d = bg.getImageData(0, 0, big.width, big.height).data;
      return PB.fix({ data: d, width: big.width, height: big.height, name: 'probe' });
    });
    expect(r.ok).toBe(true);
    expect({ cols: r.cols, rows: r.rows }).toEqual({ cols: 16, rows: 16 });
    expect(r.confidence).toBe('high');
  });

  test('SAYS WHAT A PIXEL SIZE WILL GIVE YOU, BEFORE THE RUN', async ({ page }) => {
    /* The control was called "Cell size" and its tooltip said "for when you
       already know it", which tells somebody who does not know it nothing.
       The number it wants is the size of one pixel of the artwork, and the
       readout now says what that leaves you with. */
    await page.evaluate(() => showPage('fixer', false));
    const size = await feed(page, 4, 24);   /* 96x96 */
    const r = await page.evaluate(() => {
      const box = document.getElementById('fixforce'), out = document.getElementById('fixsize');
      const at = (v) => { box.value = String(v); box.dispatchEvent(new Event('input', { bubbles: true })); return out.textContent; };
      return { label: document.querySelector('label[for="fixforce"]').textContent,
        detect: at(0), four: at(4), twelve: at(12) };
    });
    expect(size).toEqual({ w: 96, h: 96 });
    expect(r.label, 'the control is named for what it sets').toBe('Pixel size');
    expect(r.detect, 'with 0 there is nothing to promise').toBe('');
    expect(r.four, 'four pixels to one gives a 24 square').toContain('24×24');
    expect(r.twelve, 'and twelve gives an 8').toContain('8×8');
  });

  test('and a result it is not sure of says what to do about it', async ({ page }) => {
    /* The complaint this came from was "there is still blurred pixel art", on
       an image whose edges were soft to begin with - which makes the detectors
       find a small step, and a small step keeps the softness faithfully. That
       is the tool working and finding the wrong answer, and it looks exactly
       like the tool not working. */
    await page.evaluate(() => showPage('fixer', false));
    await feed(page, 3, 16);
    const sure = await page.evaluate(async () => {
      const r = await fixRun();
      return { conf: r && r.confidence, said: document.getElementById('fixout').textContent };
    });
    expect(sure.conf, 'a clean 3x is the case it is sure of').toBe('high');
    expect(sure.said, 'so it says nothing extra').not.toContain('Pixel size');

    /* Forced: the person has already answered, so it stays quiet there too. */
    const forced = await page.evaluate(async () => {
      document.getElementById('fixforce').value = '3';
      const r = await fixRun();
      document.getElementById('fixforce').value = '0';
      return { conf: r && r.confidence, cons: r && r.consensus,
        said: document.getElementById('fixout').textContent };
    });
    expect(forced.cons, 'the forced path was taken').toBe('forced');
    expect(forced.conf, 'which the engine calls medium').toBe('medium');
    expect(forced.said, 'and it does not tell you to do what you just did')
      .not.toContain('run it again');
  });

  test('AND SAYS SO WHEN THE ANSWER IS STILL TOO BIG TO BE PIXEL ART', async ({ page }) => {
    /* The complaint this came from was a generated scene that came back with
       its soft edges intact. The detector was not unsure - it locked onto the
       finest repeating thing in a picture that has 1px texture in it, and
       answered with a pixel size so small that the softness survives.

       TWO FIXTURES WERE TRIED AND NEITHER FOOLED THE DETECTOR: 12px blocks
       under a blur came back 43x43 at 11.91px, high confidence and right; pure
       per-pixel noise came back 93x93. That is worth recording, because it is
       also why the FIRST version of this advice was wrong - it fired on low
       confidence, and the case it was written for is answered confidently.

       So this asserts the RULE rather than trying to reproduce the picture: a
       result bigger than pixel art gets says so, however it got there. A small
       pixel size put in by hand reaches that state exactly and deterministically,
       and is a thing somebody really does. */
    await page.evaluate(() => showPage('fixer', false));
    const said = await page.evaluate(async () => {
      const S = 512;
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d');
      const pal = ['#2e222f', '#c85368', '#e8c170', '#3fa66a'];
      for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) {
        g.fillStyle = pal[(((x >> 3) * 7 + (y >> 3) * 13) >>> 0) % pal.length];
        g.fillRect(x, y, 8, 8);
      }
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await fixLoad(new File([blob], 'blocks.png', { type: 'image/png' }));
      document.getElementById('fixforce').value = '1';
      const r = await fixRun();
      document.getElementById('fixforce').value = '0';
      return { long: r && Math.max(r.width, r.height),
        out: document.getElementById('fixout').textContent };
    });
    expect(said.long, 'the answer really is bigger than pixel art gets').toBe(512);
    expect(said.out, 'so it says the pixel size was too small').toContain('too small');
    expect(said.out, 'and names sizes to try').toContain('Try ');
    expect(said.out, 'each of which divides this image evenly').toContain('8 gives 64×64');
  });

  test('and stays quiet when the answer is the size pixel art actually is',
    async ({ page }) => {
      /* THE CONTROL. Advice on every run is noise, and noise on a good result
         is what teaches somebody to stop reading the line. */
      await page.evaluate(() => showPage('fixer', false));
      await feed(page, 3, 16);
      const r = await page.evaluate(async () => {
        const out = await fixRun();
        return { long: out && Math.max(out.width, out.height),
          said: document.getElementById('fixout').textContent };
      });
      expect(r.long, 'a 16x16 is well inside what pixel art is').toBe(16);
      expect(r.said, 'so nothing is suggested').not.toContain('Try ');
      expect(r.said, 'and nothing is called too small').not.toContain('too small');
    });
});
