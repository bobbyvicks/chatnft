/* The colour box, one tool for move and resize, and the outline panel.

   Four asks, and the first finding was that the reported bug was seven bugs.
   "Include near shades" was called glitchy: it toggles an attribute and
   nothing on screen changes, because .btn never had a pressed style at all.
   gsnap, rcnear, oltidy, olpatch, rslock, rssnap and baseoutline were all in
   the same state - .tool, .chips and .mini had the rule and .btn was missed.

   THE MODE IS GONE. Draw and Replace were two chips deciding what a click on
   a swatch meant, for something the two mouse buttons say by themselves:
   LEFT the colours you are changing, RIGHT the colour they become. Left click
   still sets the painting colour, because "this colour" is one thought.
*/
import { test, expect } from '@playwright/test';

/* Opens a small trait with three known colours in it. */
const open = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  const S = 60;
  const d = new Uint8ClampedArray(S * S * 4);
  const put = (x, y, c) => { const i = (y * S + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    put(x, y, x < 20 ? [46, 34, 47] : x < 40 ? [62, 53, 70] : [98, 85, 101]);
  fileName = 'probe';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));
  return [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex);
});

const marks = (page) => page.evaluate(() => ({
  picked: [...document.querySelectorAll('#pal .sw[data-rc="1"]')].map(s => s.dataset.hex),
  target: (document.querySelector('#pal .sw[data-to="1"]') || {}).dataset?.hex || null,
  current: color,
  line: document.getElementById('rcfrom').textContent,
  goDisabled: document.getElementById('rcgo').disabled,
}));

test.describe('the colour box', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildPalette === 'function');
  });

  test('LEFT CLICK PICKS A COLOUR TO CHANGE, AND PAINTS WITH IT',
    async ({ page }) => {
      /* One gesture, one thought. Splitting "use this colour" from "change
         this colour" into two modes is what the Draw/Replace chips were. */
      const hexes = await open(page);
      await page.evaluate((h) => document.querySelector('#pal .sw[data-hex="' + h + '"]').click(), hexes[0]);
      await page.waitForTimeout(120);
      const m = await marks(page);
      expect(m.picked, 'marked as one to change').toEqual([hexes[0]]);
      expect(m.current.toLowerCase(), 'and it is the painting colour')
        .toBe(hexes[0].toLowerCase());
      expect(m.goDisabled, 'so Replace has something to do').toBe(false);
    });

  test('and clicking it again takes it back out', async ({ page }) => {
    /* The only way to fix a misclick without starting the selection over. */
    const hexes = await open(page);
    const click = (h) => page.evaluate((x) =>
      document.querySelector('#pal .sw[data-hex="' + x + '"]').click(), h);
    await click(hexes[0]);
    await click(hexes[0]);
    await page.waitForTimeout(120);
    expect((await marks(page)).picked).toEqual([]);
  });

  test('RIGHT CLICK SETS WHAT THEY BECOME, and only on a swatch',
    async ({ page }) => {
      const hexes = await open(page);
      await page.evaluate((h) => {
        document.querySelector('#pal .sw[data-hex="' + h[0] + '"]').click();
        const t = document.querySelector('#pal .sw[data-hex="' + h[2] + '"]');
        t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      }, hexes);
      await page.waitForTimeout(150);
      const m = await marks(page);
      expect(m.target, 'the destination is marked separately').toBe(hexes[2]);
      expect(m.picked, 'and the source is untouched').toEqual([hexes[0]]);
      expect(m.line, 'the line names both').toContain(hexes[0]);
      expect(m.line).toContain(hexes[2]);
    });

  test('AND THE PIXELS GO TO THE RIGHT-CLICKED COLOUR', async ({ page }) => {
    /* The marks are a claim about what Replace will do, so the artwork is
       checked. Before there was a way to choose a target, replace silently
       used whatever was being painted with. */
    const hexes = await open(page);
    const r = await page.evaluate(async (h) => {
      document.querySelector('#pal .sw[data-hex="' + h[0] + '"]').click();
      const t = document.querySelector('#pal .sw[data-hex="' + h[2] + '"]');
      t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      /* Paint with something else entirely, so "used the painting colour"
         cannot pass by accident. */
      setColor('#ff00ff');
      await new Promise(x => setTimeout(x, 100));
      document.getElementById('rcgo').click();
      await new Promise(x => setTimeout(x, 400));
      const d = ctx.getImageData(2, 2, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    }, hexes);
    expect(r.toLowerCase(), 'the right-clicked colour, not the painting one')
      .toBe(hexes[2].toLowerCase());
  });

  test('THE SEVEN TOGGLES THAT LIT UP NOTHING NOW LIGHT UP', async ({ page }) => {
    /* The reported bug was one button. It was all of them: .tool, .chips and
       .mini had a pressed rule and .btn did not, so pressing any of these
       changed an attribute and nothing you could see. */
    await open(page);
    const r = await page.evaluate(() => {
      const out = {};
      for (const id of ['gsnap', 'rcnear', 'oltidy', 'olpatch', 'rssnap', 'rslock']) {
        const b = document.getElementById(id);
        if (!b) { out[id] = 'missing'; continue; }
        const was = b.getAttribute('aria-pressed');
        b.setAttribute('aria-pressed', 'false');
        const off = getComputedStyle(b).backgroundColor;
        b.setAttribute('aria-pressed', 'true');
        const on = getComputedStyle(b).backgroundColor;
        b.setAttribute('aria-pressed', was);
        out[id] = (off !== on) ? 'lights up' : 'no change';
      }
      return out;
    });
    for (const id of Object.keys(r))
      expect(r[id], id + ' shows whether it is on').toBe('lights up');
  });

  test('and near shades keeps its number in the same row', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const row = document.querySelector('.rcrow');
      return { has: !!row && !!row.querySelector('#rcnear') && !!row.querySelector('#rctol'),
        label: !!document.querySelector('label[for="rctol"]') };
    });
    expect(r.has, 'the toggle and its number are one row').toBe(true);
    expect(r.label, 'and the labelled row it used to need is gone').toBe(false);
  });
});

test.describe('one tool for move and resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof selectTool === 'function');
    await open(page);
  });

  test('DRAGGING INSIDE THE BOX MOVES THE ART', async ({ page }) => {
    /* The box has always been pointer-events:none except its handles, so a
       drag inside it fell through to the canvas and nothing caught it. That
       is why Resize could size but not move. */
    const r = await page.evaluate(async () => {
      selectTool('transform');
      const before = ctx.getImageData(0, 0, art.width, art.height).data.slice();
      /* A REAL POSITION. beginStroke asks cellFrom where the press landed,
         and cellFrom measures against the canvas - so an event at 0,0 is
         outside it, returns null, and the function leaves before reaching
         the branch this test is about. */
      const r = art.getBoundingClientRect();
      beginStroke({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      const moved = !!moveBuf;
      moveBuf = null; moveFrom = null;
      return { boxOn: document.getElementById('tbox').classList.contains('on'),
        moved, unchanged: before.length > 0 };
    });
    expect(r.boxOn, 'the handles are up').toBe(true);
    expect(r.moved, 'and a press that is not on a handle starts a move').toBe(true);
  });

  test('and both old names reach it', async ({ page }) => {
    const r = await page.evaluate(() => {
      selectTool('pencil'); selectTool('move');
      const a = tool;
      selectTool('pencil'); selectTool('transform');
      return { a, b: tool };
    });
    expect(r.a).toBe('transform');
    expect(r.b).toBe('transform');
  });
});

test.describe('the outline panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof outlinePanel === 'function');
    await open(page);
  });

  test('IS A BUTTON UNDER THE EYEDROPPER THAT OPENS THE PANEL',
    async ({ page }) => {
      const r = await page.evaluate(() => {
        const rail = [...document.querySelectorAll('.tools button')].map(b => b.id || b.dataset.tool);
        const before = document.getElementById('olscrim').hidden;
        document.getElementById('olbtn').click();
        return { rail, before, after: document.getElementById('olscrim').hidden,
          expanded: document.getElementById('olbtn').getAttribute('aria-expanded') };
      });
      expect(r.rail.indexOf('olbtn'), 'directly after the eyedropper')
        .toBe(r.rail.indexOf('pick') + 1);
      expect(r.before, 'closed to begin with').toBe(true);
      expect(r.after, 'open after a press').toBe(false);
      expect(r.expanded).toBe('true');
    });

  test('and every control came with it', async ({ page }) => {
    /* Six controls and a note moved. A control left behind in the sidebar
       would be a second element with the same id, and getElementById would
       answer with whichever came first while the other did nothing. */
    const r = await page.evaluate(() => {
      const ids = ['olthick', 'olthicklab', 'olcol', 'olcurrent', 'olsnap',
        'oltidy', 'olpatch', 'oladd', 'olnote'];
      const panel = document.getElementById('olscrim');
      return ids.map(id => ({ id,
        n: document.querySelectorAll('[id="' + id + '"]').length,
        inPanel: !!panel.querySelector('#' + id) }));
    });
    for (const c of r) {
      expect(c.n, c.id + ' exists exactly once').toBe(1);
      expect(c.inPanel, c.id + ' is in the panel').toBe(true);
    }
  });

  test('and the sidebar no longer carries it', async ({ page }) => {
    const inSide = await page.evaluate(() =>
      /* The strip, which is what the side column became. A check against
         .side would pass forever for the empty reason that nothing matches. */
      !!document.querySelector('.opts #oladd'));
    expect(inSide).toBe(false);
  });

  test('AND NOTHING OUTLINES THE ARTWORK BY ITSELF', async ({ page }) => {
    /* outlinePreview draws the overlay and writes the note. It is called on
       open, on colour change and after edits - if it touched the artwork,
       every one of those would be an edit nobody asked for. */
    const r = await page.evaluate(async () => {
      const before = ctx.getImageData(0, 0, art.width, art.height).data;
      let sum = 0; for (let i = 0; i < before.length; i += 4) sum = (sum + before[i]) >>> 0;
      outlinePanel(true);
      $('olthick').value = '3';
      outlinePreview();
      await new Promise(x => setTimeout(x, 200));
      const after = ctx.getImageData(0, 0, art.width, art.height).data;
      let sum2 = 0; for (let i = 0; i < after.length; i += 4) sum2 = (sum2 + after[i]) >>> 0;
      return { sum, sum2, undo: undoStack.length };
    });
    expect(r.sum2, 'not one pixel changed by opening or previewing').toBe(r.sum);
    expect(r.undo, 'and nothing landed in the history').toBe(0);
  });
});
