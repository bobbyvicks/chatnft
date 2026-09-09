import { test, expect } from '@playwright/test';
import { openTrait, openPanel, art, setField } from './helpers.js';

test.describe('the strip that replaced the panel', () => {
  test('IS ON SCREEN ON ARRIVAL, and the palette is one press away', async ({ page }) => {
    /* SUPERSEDES "fits its window on arrival, with every heading reachable".

       That test existed because the side column scrolled 2,780px inside a
       1,185px window - a button that had shipped hours earlier still could
       not be found. The column is gone. Its six sections became pop-outs on
       the tool rail, and the three controls you look at while you draw - the
       colour, the brush size with its snap, the fill spread - became a strip
       under the header.

       So the promise is the same and its shape is not. There are no headings
       to reach and nothing to scroll; what has to be true is that the strip
       is entirely on screen, that the brush is usable the moment a trait
       opens, and that the palette is exactly one press away rather than
       somewhere you have to go looking. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    const bar = await page.evaluate(() => {
      const s = document.querySelector('.opts');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const usable = (id) => {
        const e = document.getElementById(id);
        if (!e) return false;
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0
          && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
      };
      return { onScreen: r.top >= -1 && r.bottom <= innerHeight + 1,
               height: Math.round(r.height),
               scrolls: s.scrollWidth > s.clientWidth + 1,
               brush: usable('bslider'), snap: usable('gsnap'),
               colour: usable('clbtn') };
    });
    expect(bar, 'the strip exists').not.toBeNull();
    expect(bar.onScreen, 'and is entirely on screen').toBe(true);
    expect(bar.scrolls, 'and does not scroll sideways').toBe(false);
    /* A ceiling, not a measurement: the column cost the artwork 244px of
       width and the point of the trade is that a strip costs it far less
       height than that. */
    expect(bar.height, 'a strip, not a second header').toBeLessThan(90);
    expect(bar.brush, 'the brush is usable on arrival').toBe(true);
    expect(bar.snap, 'and so is its snap toggle').toBe(true);
    expect(bar.colour, 'and the colour you are painting with is right there').toBe(true);

    /* ONE PRESS FOR THE PALETTE. It moved into the card the colour button
       opens - "instead of just having a colour wheel when you click the
       colour button also put the projects pallete in that box" - so the
       promise is reachability in one gesture, and it is asserted rather
       than assumed. */
    await openPanel(page, 'cl');
    const pal = await page.evaluate(() => {
      const p = document.getElementById('pal'), card = p.closest('.card');
      const r = p.getBoundingClientRect(), cr = card.getBoundingClientRect();
      return { drawn: r.width > 0 && r.height > 0,
               swatches: p.querySelectorAll('.sw').length,
               inCard: r.left >= cr.left - 1 && r.right <= cr.right + 1 };
    });
    expect(pal.drawn, 'one press and the palette is there').toBe(true);
    expect(pal.swatches, 'with the colour this trait uses in it').toBe(1);
    expect(pal.inCard, 'and inside the card rather than cut off by it').toBe(true);
  });

  /* THE FOLDING TEST IS GONE, AND SO IS WHAT IT WATCHED.

     It opened a section by its heading and watched a control appear. There
     are no sections: foldDefaults and setupFolds were deleted with the
     column, because folding existed only to stop a 244px column burying its
     own tail and a strip cannot. Rewriting it a fourth time would have meant
     manufacturing a window short enough to force a fold - a state nobody
     using this editor is in, asserted so a line of test could go on
     existing. Recorded here rather than left as a silent deletion. */

  test('no button label wraps onto a second line', async ({ page }) => {
    /* Two did, and stood 65px tall next to their 44px neighbours.

       The population moved with the controls: the strip, plus every pop-out
       panel, opened so their buttons have a size to measure. Measuring only
       what is left in the strip would be a guard over three buttons calling
       itself a guard over all of them. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    await page.evaluate(() => {
      for (const id of ['cl', 'tx', 'eh', 'qa', 'tf', 'bl', 'sv'])
        try { railPanel(id, true); } catch (_) {}
      try { outlinePanel(true); } catch (_) {}
    });
    await page.waitForTimeout(150);
    const wrapped = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.opts button, .scrim.pop:not([hidden]) .card button').forEach(b => {
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
       the fill, the move or the picker - and nothing else would notice.

       The palette has since moved again, into the card the colour button
       opens, and the brush rows stayed in the column. That splits the subject
       across two places and changes nothing about the defect: selectTool
       still sweeps by tool, and the palette must still survive the sweep
       wherever it is living. Both are opened, and both are measured. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); set(2, 2, [9, 9, 9]); } });
    /* The brush rows are in the strip and always on screen; the palette is
       in the colours panel. Neither is behind a heading any more. */
    await openPanel(page, 'cl');
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
    /* The pairs this names are spread over the column and the pop-out panels
       now, so all of them are opened. What is being asserted is unchanged:
       nothing that used to be reachable was quietly dropped on the way. */
    await openTrait(page, { w: 80, h: 80, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    for (const id of ['cl', 'sv']) await openPanel(page, id);
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
    await openPanel(page, 'eh');
    const before = await art.empty(page);
    await setField(page, 'holemax', 0);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    // 36 in the square gap plus 3 specks
    expect(before - await art.empty(page)).toBe(39);
  });

  test('a limit leaves the big gap and takes the specks', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openPanel(page, 'eh');
    const before = await art.empty(page);
    await setField(page, 'holemax', 4);
    await page.click('#fillholes');
    await page.waitForTimeout(300);
    expect(before - await art.empty(page), 'only the three specks').toBe(3);
  });

  test('never closes a gap that reaches the border', async ({ page }) => {
    /* That is the outside of the trait, not a hole in it. */
    await openTrait(page, { w: 60, h: 60, draw: holed });
    await openPanel(page, 'eh');
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

/* THE STAGE TAKES THE WIDTH NOW, WHICH IS THE WHOLE POINT.

   SUPERSEDES "the panel fills the width the art cannot", four tests that
   measured fitPanel widening the side column to two, three or four 250px
   columns on big screens. The reasoning was sound while there was a column:
   a 160-cell trait is limited by HEIGHT, so the width beside it could never
   become artwork and the panel may as well have it.

   The column is gone, so the premise is gone with it. The width beside the
   stage is not spare any more - it IS the stage. That is a stronger claim
   and an easier one to check: nothing between the tool rail and the edge of
   the window takes horizontal space, at any screen size.

   Kept as a test rather than dropped, because "the canvas got the room" is
   the thing that was asked for, and an ask nobody asserts is an ask that
   quietly comes undone the next time something needs somewhere to live. */
test.describe('the stage takes the width', () => {
  const shape = (page) => page.evaluate(() => {
    const st = document.getElementById('stage');
    const rail = document.querySelector('nav.tools');
    const app = document.getElementById('app');
    return {
      stageW: st.clientWidth, stageH: st.clientHeight,
      railW: Math.round(rail.getBoundingClientRect().width),
      appW: app.clientWidth,
      side: !!document.querySelector('.side'),
      zoom,
    };
  });
  const open = (page) => openTrait(page, { w: 160, h: 160, draw: (set, W, H) => {
    for (let y = 10; y < H - 10; y++) for (let x = 10; x < W - 10; x++) set(x, y, [226, 146, 116]);
  } });

  for (const [name, viewport] of [
    ['on a 1080p screen', { width: 1920, height: 1080 }],
    ['on a 1440p screen', { width: 2560, height: 1440 }],
    ['on a tall narrow window', { width: 1100, height: 1400 }],
  ]) {
    test.describe(name, () => {
      test.use({ viewport });
      test('nothing stands between the rail and the edge', async ({ page }) => {
        await open(page);
        const s = await shape(page);
        expect(s.side, 'there is no side column any more').toBe(false);
        /* Within a couple of pixels for the stage's own border. The old
           layout left 244 here, and at 2560 the widened panel left 500. */
        expect(s.appW - s.railW - s.stageW,
          'the stage is everything the rail does not take')
          .toBeLessThanOrEqual(4);
      });
    });
  }

  test.describe('and the width it gained is width the artwork can use', () => {
    test.use({ viewport: { width: 900, height: 1400 } });
    test('on a tall window the stage is width-bound, and has all of it',
      async ({ page }) => {
        /* MY FIRST VERSION OF THIS ASSERTED A ZOOM AND WAS WRONG. It claimed a
           240-wide trait at 1280x900 would go from 4x to 5x, and measured 3x.
           fitZoom divides by max(w,h) against the SMALLER stage dimension, so
           it fits a square of the trait's longest side - on a short window the
           height binds no matter how wide the trait is, and the extra width
           changes nothing. The code was right and the arithmetic in the test
           was not, which is the same way round as the note further up this
           file records for the version before it.

           So this picks the case where width really is the binding dimension -
           a tall narrow window - and asserts the two things that make the
           gained width real artwork rather than dead space: the stage is
           narrower than it is tall, and it holds everything the rail does not.
           No zoom is predicted, because predicting one means re-deriving
           fitZoom in the test and then testing the derivation. */
        await openTrait(page, { w: 160, h: 160, draw: (set, W, H) => {
          for (let y = 10; y < H - 10; y++) for (let x = 10; x < W - 10; x++)
            set(x, y, [226, 146, 116]);
        } });
        const s = await shape(page);
        expect(s.stageW, 'width is the binding dimension here').toBeLessThan(s.stageH);
        expect(s.appW - s.railW - s.stageW,
          'so every pixel the column used to take is artwork now')
          .toBeLessThanOrEqual(4);
      });
  });
});
