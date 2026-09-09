/* Editing on a phone.

   "mobile editing is impossible with how small the grid is, it should be as
   big as it can possibly be to fit squarely onto the screen ... also i really
   think the bottom bar is too full and cluttered still".

   Measured at 375x812 with a 160-cell trait open, before any of this:

     header    62px
     tools    107px
     stage    347px   and the canvas inside it 160x160
     footer    82px   over TWO rows
     side     214px

   The canvas was 8% of the screen in a stage that could hold 320x320. The
   cause is timing rather than arithmetic: fitZoom runs inside startEditor
   while the panel is still settling, measures a stage that is still growing,
   and floors to 1x. Pixel art scales in whole steps, so one step out is a
   QUARTER OF THE AREA.

   That is also why it went unnoticed for so long - opening a second image
   always worked, because by then the stage was the size it was going to be.
   So the test that matters opens ONE image into a freshly loaded page, and
   anything that opens a second one first would pass against the defect. */
import { test, expect } from '@playwright/test';

const openOne = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const W = 160, H = 160;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#c85'; x.fillRect(0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  fileName = 'phone.png';
  startEditor(d, W, H, W, H, palette(d, W * H, 24, 64), false);
  /* Long enough for the two frames the deferred fit waits for, and for the
     layout they are waiting on. */
  await new Promise(r => setTimeout(r, 500));
  const box = el => { const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const f = document.querySelector('footer');
  return {
    art: box(document.getElementById('art')),
    zoom,
    stage: box(document.querySelector('.stage')),
    footer: box(f),
    /* Flex LINES, not distinct tops. A 40px zoom cluster and a 16px label on
       one line are vertically centred, so their tops differ by 12px - and the
       first version of this counted that as two rows and failed a footer that
       was already correct. Two children are on different lines only when their
       vertical ranges do not overlap at all. */
    footerRows: (() => {
      const bs = [...f.children].map(e => e.getBoundingClientRect())
        .filter(r => r.width > 0).sort((a, b) => a.top - b.top);
      let lines = 0, end = -1;
      for (const r of bs) { if (r.top >= end) { lines++; end = r.bottom; }
        else end = Math.max(end, r.bottom); }
      return lines;
    })(),
    /* Measured as SPACE TAKEN, not as computed display. #pos sits inside a
       wrapper that is hidden, and a child of a display:none parent still
       reports its own "inline" - the first version asserted that and failed
       against markup that was already correct. */
    hidden: ['pos', 'under', 'zpan'].map(id =>
      document.getElementById(id).getBoundingClientRect().width === 0),
    labelsGone: [...f.querySelectorAll('.ptronly')]
      .every(e => getComputedStyle(e).display === 'none'),
    /* sideDown is gone with the side column it read. Left as a note rather
       than silently dropped: every measurement above survived, because the
       header, rail, stage and footer are still there and the 214px the column
       took on a phone is stage now. */
  };
});

test.describe('editing on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
  });

  test('the art fills the stage instead of opening at 1x', async ({ page }) => {
    /* THE ONE THAT MATTERS. 160 into a stage that holds 320 is a quarter of
       the area, and it happened on the FIRST image only. */
    const r = await openOne(page);
    expect(r.zoom, 'a whole step up, not the 1x it settled on').toBeGreaterThan(1);
    expect(r.art.w, 'so the art is 320 rather than 160').toBe(320);
    expect(r.art.w, 'and it still fits across the screen').toBeLessThanOrEqual(375);
    expect(r.art.h, 'and down it').toBeLessThanOrEqual(r.stage.h);
  });

  test('and it is square, and as big as a whole step allows', async ({ page }) => {
    /* "as big as it can possibly be to fit squarely". Squarely is the easy
       half. The other half is that the next whole step must NOT fit - if 3x
       fitted and this settled on 2x it would be leaving a third of the screen
       unused, which is the defect in a smaller size. */
    const r = await openOne(page);
    expect(r.art.w, 'square').toBe(r.art.h);
    const next = 160 * (r.zoom + 1);
    expect(next, 'and one step bigger genuinely would not fit')
      .toBeGreaterThan(Math.min(r.stage.w, r.stage.h));
  });

  test('the bottom bar is one row, not two', async ({ page }) => {
    /* It was 82px over two rows. The first row was two readouts of the cell
       under the POINTER, on a device with none to hover with. */
    const r = await openOne(page);
    expect(r.footerRows, 'one row').toBe(1);
    expect(r.footer.h, 'and about half the height it was').toBeLessThan(60);
  });

  test('and the pointer readouts go with their labels, not without them',
    async ({ page }) => {
      /* The first attempt hid #pos and #under, which are the VALUES - and left
         their labels behind, so the bar read "Cell" and "Under" with nothing
         after them. Worse than the readout was. */
      const r = await openOne(page);
      expect(r.hidden[0], 'the cell value takes no space').toBe(true);
      expect(r.hidden[1], 'and the under value').toBe(true);
      expect(r.labelsGone, 'and the words in front of them went too').toBe(true);
    });

  test('and Move is not offered twice', async ({ page }) => {
    /* $("zpan").onclick is $("panbtn").click() - the footer's Move pressed the
       pan button already in the tool rail. */
    const r = await openOne(page);
    expect(r.hidden[2], 'the duplicate is gone from the bar').toBe(true);
    const rail = await page.evaluate(() =>
      getComputedStyle(document.getElementById('panbtn')).display);
    expect(rail, 'and the one in the tool rail is still there').not.toBe('none');
  });

  /* THE TWO BOTTOM-SHEET TESTS ARE GONE WITH THE SHEET.

     They covered a drag on #sidepanel: down to dismiss it, and down-while-
     scrolled to NOT dismiss it. The side panel has been deleted - its six
     sections became pop-outs on the tool rail and the three controls left
     became a strip under the header - so there is no sheet, no drag handle
     and no sideDown to guard.

     Recorded rather than silently removed, because the pair was a guard and
     its control, and a control that disappears without a word is how the
     next person concludes the behaviour was never tested. If a draggable
     sheet ever comes back, these two are the shape its tests should take:
     one that it closes on a deliberate drag, one that it does NOT close on
     a drag that was a scroll. */
});
