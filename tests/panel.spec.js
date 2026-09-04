import { test, expect } from '@playwright/test';
import { openTrait, openSection, art, setField } from './helpers.js';

test.describe('the panel', () => {
  test('fits its window on arrival, with every heading reachable', async ({ page }) => {
    /* It used to scroll 2,780px inside a 1,185px window, which is how a button
       that had shipped hours earlier still could not be found. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    const panel = await page.evaluate(() => {
      const s = document.querySelector('.side');
      const rect = s.getBoundingClientRect(), r = rect;
      const heads = [...s.querySelectorAll('section h2')].map(h => {
        const hr = h.getBoundingClientRect();
        return { name: h.textContent.replace(/[^A-Za-z ]/g, '').trim(),
                 onScreen: hr.top >= r.top - 1 && hr.bottom <= r.bottom + 1 };
      });
      /* The two controls the old `open === 2` stood for, measured directly.
         Counting sections never checked WHICH two were open. */
      const usable = id => {
        const e = document.getElementById(id);
        if (!e) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= rect.top - 1 && r.bottom <= rect.bottom + 1;
      };
      return { scroll: s.scrollHeight, window: s.clientHeight, heads,
               brush: usable('bslider'), palette: usable('pal'),
               open: [...s.querySelectorAll('section')].filter(x => !x.classList.contains('folded')).length };
    });
    expect(panel.scroll, 'no scrolling on arrival').toBeLessThanOrEqual(panel.window + 2);
    /* NOT a count. The code's own reason for opening two was "the brush and the
       palette are what you need before you have decided what you are doing" - two
       was how that got delivered, not what it meant, and counting sections never
       checked WHICH two were open.

       Merging Recolour into the palette section put the brush, the palette, the
       mode chips and the replace controls into one, so the same promise is kept
       by one open section now. Asserting the promise instead of the number is
       also strictly stronger: this would fail on two open sections that happened
       to be the wrong two, which the old assertion would have passed. */
    expect(panel.open, 'something must be open').toBeGreaterThan(0);
    expect(panel.brush, 'the brush is usable on arrival, without scrolling').toBe(true);
    expect(panel.palette, 'and so is the palette').toBe(true);
    for (const h of panel.heads) expect(h.onScreen, `${h.name} should be reachable without scrolling`).toBe(true);
  });

  test('one click on a heading reveals its controls', async ({ page }) => {
    /* The subject moved with the sections. This used to open Recolour and watch
       #rcerase appear - but Recolour is no longer a heading, its controls having
       moved under the palette they act on, and that section is open on arrival.
       Aiming this at 'Colour' would keep the test passing while proving nothing,
       because there would be nothing folded to unfold. Base layer is folded on
       arrival and has a control of its own. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    const box = () => page.evaluate(() => {
      const b = document.getElementById('baseop'), s = document.querySelector('.side');
      const r = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
      return { visible: r.width > 0 && r.height > 0,
               inView: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1 };
    });
    expect((await box()).visible, 'folded to begin with').toBe(false);

    await openSection(page, 'Base layer');
    const shown = await box();
    expect(shown.visible).toBe(true);
    expect(shown.inView, 'and in view, not below the fold').toBe(true);
  });

  test('no button label wraps onto a second line', async ({ page }) => {
    /* Two did, and stood 65px tall next to their 44px neighbours. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    await page.evaluate(() => document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded')));
    await page.waitForTimeout(150);
    const wrapped = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.side button').forEach(b => {
        const r = b.getBoundingClientRect();
        if (r.height < 1) return;
        const cs = getComputedStyle(b);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const lines = Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh);
        const t = (b.textContent || '').trim();
        if (lines > 1 && t) out.push(t + ' (' + Math.round(r.height) + 'px)');
      });
      return out;
    });
    expect(wrapped).toEqual([]);
  });
});

test.describe('the merged sections', () => {
  test('the palette survives a tool that is not the brush', async ({ page }) => {
    /* The palette was moved into #brushsec, which selectTool hides whenever the
       tool is not the pencil or the eraser. If the hiding is ever put back onto
       the section instead of the rows, your colours vanish the moment you pick
       the fill, the move or the picker - and nothing else would notice. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); set(2, 2, [9, 9, 9]); } });
    await openSection(page, 'Colour');
    const shown = async () => page.evaluate(() => {
      const p = document.getElementById('pal');
      const r = p.getBoundingClientRect();
      return { palette: r.width > 0 && r.height > 0,
               brushRows: (() => { const b = document.getElementById('brushrows');
                 const br = b.getBoundingClientRect(); return br.width > 0 && br.height > 0; })() };
    });

    for (const t of ['pencil', 'eraser']) {
      await page.evaluate(x => selectTool(x), t);
      await page.waitForTimeout(80);
      const s = await shown();
      expect(s.palette, 'the palette with the ' + t).toBe(true);
      expect(s.brushRows, 'the brush size with the ' + t).toBe(true);
    }
    for (const t of ['fill', 'move', 'pick']) {
      await page.evaluate(x => selectTool(x), t);
      await page.waitForTimeout(80);
      const s = await shown();
      expect(s.palette, 'the palette must stay with the ' + t + ' tool').toBe(true);
      expect(s.brushRows, 'the brush size is not wanted with the ' + t + ' tool').toBe(false);
    }
  });

  test('every control from the merged pairs is still reachable', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    await openSection(page, 'Colour');
    await openSection(page, 'Save and export');
    const seen = id => page.evaluate(i => {
      const e = document.getElementById(i);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, id);

    const missing = await page.evaluate(() => {
      /* filltol is deliberately NOT in this list any more - see below. */
      const want = ['bslider','pal','tname','tlayer','tstatus','saveproj',
                    'dlNative','dlBig','dlTrim','reset','saveclose','closeed'];
      return want.filter(id => {
        const e = document.getElementById(id);
        if (!e) return true;
        const r = e.getBoundingClientRect();
        return !(r.width > 0 && r.height > 0);
      });
    });
    expect(missing).toEqual([]);

    /* Fill spread is reachable from the tool that uses it, which is a change:
       this test used to assert it was visible with the PENCIL selected, and it
       was - because it sat inside #brushrows, the container selectTool hides
       unless the tool is pencil or eraser. So the one control only the fill
       tool reads was on screen for every tool except that one. The old
       expectation was pinning the bug. */
    expect(await seen('filltol'), 'not shown for the pencil, which never uses it').toBe(false);
    await page.evaluate(() => selectTool('fill'));
    expect(await seen('filltol'), 'and shown for the tool that does').toBe(true);
  });
});

test.describe('fill interior holes', () => {
  /* A square with a 4x4 gap the art surrounds, three single-cell specks, and a
     notch running out to the border. Only the first two are holes. */
  const holed = (set) => {
    for (let y = 5; y < 55; y++) for (let x = 5; x < 55; x++) set(x, y, [226, 146, 116]);
    for (let y = 20; y < 26; y++) for (let x = 20; x < 26; x++) set(x, y, [0, 0, 0, 0]);
    for (const [x, y] of [[40, 40], [44, 42], [12, 45]]) set(x, y, [0, 0, 0, 0]);
    for (let y = 0; y < 12; y++) set(30, y, [0, 0, 0, 0]);
  };

  test('closes every gap when the limit is 0', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openSection(page, 'Edges and holes');
    const before = await art.empty(page);
    await setField(page, 'holemax', 0);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    // 36 in the square gap plus 3 specks
    expect(before - await art.empty(page)).toBe(39);
  });

  test('a limit leaves the big gap and takes the specks', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openSection(page, 'Edges and holes');
    const before = await art.empty(page);
    await setField(page, 'holemax', 4);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    expect(before - await art.empty(page), 'only the three specks').toBe(3);
  });

  test('never closes a gap that reaches the border', async ({ page }) => {
    /* That is the outside of the trait, not a hole in it. */
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openSection(page, 'Edges and holes');
    await setField(page, 'holemax', 0);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    const notchStillOpen = await page.evaluate(() => {
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let n = 0;
      for (let y = 5; y < 12; y++) if (d[(y * art.width + 30) * 4 + 3] === 0) n++;
      return n;
    });
    expect(notchStillOpen, 'the notch is untouched').toBe(7);
  });
});

/* THE PANEL TAKES THE WIDTH THE ARTWORK CANNOT USE.

   Measured at 1600x1000: rail 71, panel 500, stage 1029, and 800x800 of artwork
   in the middle - 115px of dead stage either side. The art cannot grow into it,
   because a 160-cell trait is limited by HEIGHT and 6x needs 960px in the 904
   available. On wider screens it is worse: 195px a side at 1920x1080, 355 at
   2560x1440.

   THE INVARIANT IS WHAT IS TESTED, not a pixel width. fitZoom sizes the artwork
   by Math.min(stageWidth-pad, stageHeight-pad) / Math.max(w,h), so while the
   stage is at least as wide as it is tall the HEIGHT is binding and the zoom
   cannot move however much the panel takes. That holds for any trait shape, any
   content box, and with or without a base.

   My first version of these tests computed the expected artwork from art.height
   and failed at 960 against 7680 - and the code was right. fitZoom fits the
   CONTENT box when the art covers under half the canvas, and the fixture draws
   one pixel, so the 48x ceiling is correct. The invariant needs none of that. */
test.describe('the panel fills the width the art cannot', () => {
  const shape = (page) => page.evaluate(() => {
    const st = document.getElementById('stage'), side = document.querySelector('.side');
    return {
      stageW: st.clientWidth, stageH: st.clientHeight,
      side: Math.round(side.getBoundingClientRect().width),
      cols: getComputedStyle(side).gridTemplateColumns.split(' ').length,
      zoom,
    };
  });
  const open = (page) => openTrait(page, { w: 160, h: 160, draw: (set, W, H) => {
    for (let y = 10; y < H - 10; y++) for (let x = 10; x < W - 10; x++) set(x, y, [226, 146, 116]);
  } });

  test.describe('on a 1080p screen', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });
    test('a third column appears, and the stage stays wider than it is tall', async ({ page }) => {
      await open(page);
      const s = await shape(page);
      expect(s.cols, 'two columns left 195px a side doing nothing').toBeGreaterThanOrEqual(3);
      expect(s.stageW, 'the height must stay the binding dimension').toBeGreaterThanOrEqual(s.stageH);
    });
  });

  test.describe('on a 1440p screen', () => {
    test.use({ viewport: { width: 2560, height: 1440 } });
    test('a fourth appears, and the invariant still holds', async ({ page }) => {
      await open(page);
      const s = await shape(page);
      expect(s.cols, 'the dead space here was 355px a side').toBeGreaterThanOrEqual(4);
      expect(s.stageW).toBeGreaterThanOrEqual(s.stageH);
    });
  });

  test.describe('on a tall narrow window', () => {
    /* The assumption inverted: here the artwork is the WIDE one, and there is
       nothing spare to take. The panel must not take any of it. */
    test.use({ viewport: { width: 1100, height: 1400 } });
    test('the panel takes nothing when the art is the wide one', async ({ page }) => {
      await open(page);
      const s = await shape(page);
      expect(s.side, 'the stylesheet stays in charge here').toBeLessThan(600);
    });
  });

  test.describe('a wide short trait', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });
    test('the invariant holds for a trait that is not square', async ({ page }) => {
      // fitZoom scales by max(w,h), so a 320x64 trait is driven by its WIDTH. An
      // earlier version of this feature reserved art.width times the height-bound
      // zoom and got this case wrong; the invariant does not depend on shape.
      await openTrait(page, { w: 320, h: 64, draw: (set, W, H) => {
        for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) set(x, y, [226, 146, 116]);
      } });
      const s = await shape(page);
      expect(s.stageW, 'still at least as wide as it is tall').toBeGreaterThanOrEqual(s.stageH);
      expect(s.zoom, 'and the artwork is still drawn').toBeGreaterThan(0);
    });
  });
});