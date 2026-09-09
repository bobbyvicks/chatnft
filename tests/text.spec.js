/* Lettering.

   The renderer is Codex's, ported byte for byte from 7724c06, and its own 27
   tests already describe it - tools/text-core-check.cjs runs them against the
   copy that ships. So nothing here re-tests the glyph maths. What is untested
   by those, and what this file is for, is everything between the renderer and
   the artwork: that a sprite appears without touching the canvas, that it can
   be placed, that Add is one undoable step, and that what lands is what was
   shown.

   THE ONE PROPERTY WORTH SAYING TWICE: text is not in the artwork until Add.
   Every path that draws it - typing, restyling, dragging, centring - runs on
   its own layer. A preview that quietly wrote to ctx would make every
   keystroke an edit, and the undo stack would be the only place you found
   out.
*/
import { test, expect } from '@playwright/test';
import { openTrait, openPanel, art } from './helpers.js';

/* A flat 80x80 field, so any pixel that is not the field is lettering. */
const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
};

/* Every pixel of the artwork, as bytes. */
const pixels = (page) => page.evaluate(() =>
  [...ctx.getImageData(0, 0, art.width, art.height).data]);

/* What the sprite currently is, without reaching into the renderer. */
const sprite = (page) => page.evaluate(() => textSprite
  ? { w: textSprite.width, h: textSprite.height, x: textX, y: textY }
  : null);

const type = async (page, words) => {
  await page.evaluate((t) => {
    document.getElementById('txtext').value = t;
    document.getElementById('txtext').dispatchEvent(new Event('input', { bubbles: true }));
  }, words);
  await page.waitForTimeout(120);
};

const setNum = async (page, id, v) => {
  await page.evaluate(({ id, v }) => {
    const e = document.getElementById(id);
    e.value = String(v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, v });
  await page.waitForTimeout(120);
};

test.describe('the text panel', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: FLAT });
    await openPanel(page, 'tx');
  });

  test('OPENS FROM THE RAIL, and offers the fonts the renderer has',
    async ({ page }) => {
      /* The list is built from listPixelFonts rather than written into the
         markup, so this also pins that a font added to the renderer shows up
         without anybody remembering to add an <option>. */
      const r = await page.evaluate(() => ({
        open: !document.getElementById('txscrim').hidden,
        expanded: document.getElementById('txbtn').getAttribute('aria-expanded'),
        options: [...document.getElementById('txfont').options].map(o => o.value),
        fonts: listPixelFonts().map(f => f.id),
      }));
      expect(r.open, 'the panel is up').toBe(true);
      expect(r.expanded).toBe('true');
      expect(r.options, 'every font the renderer has').toEqual(r.fonts);
      expect(r.options.length, 'and there are five of them').toBe(5);
    });

  test('TYPING MAKES A SPRITE AND CHANGES NOTHING IN THE ARTWORK',
    async ({ page }) => {
      const before = await pixels(page);
      await type(page, 'MRKT');
      const s = await sprite(page);
      expect(s, 'there is a sprite').not.toBeNull();
      expect(s.w, 'four 5-wide letters at 2px with a gap').toBeGreaterThan(20);
      expect(await pixels(page), 'and not one artwork pixel moved').toEqual(before);
      expect(await page.evaluate(() => undoStack.length),
        'nor did anything land in the history').toBe(0);
    });

  test('and it starts in the middle, once', async ({ page }) => {
    /* Centred on the first build so it is somewhere sensible, and never
       again - re-centring on each keystroke takes the position back from
       whoever just placed it. */
    await type(page, 'AB');
    const first = await sprite(page);
    expect(first.x, 'centred across').toBe(Math.round((80 - first.w) / 2));

    await page.evaluate(() => { textX = 3; textY = 4; textDraw(); });
    await type(page, 'ABC');
    const after = await sprite(page);
    expect({ x: after.x, y: after.y }, 'the place it was put is kept')
      .toEqual({ x: 3, y: 4 });
  });

  test('ADD PUTS IT IN, IN THE PAINTING COLOUR, AND UNDO TAKES IT OUT',
    async ({ page }) => {
      const before = await pixels(page);
      await page.evaluate(() => setColor('#ff2288'));
      await type(page, 'H');
      await page.evaluate(() => { textX = 10; textY = 10; textDraw(); });
      await page.click('#txadd');
      await page.waitForTimeout(250);

      const after = await pixels(page);
      expect(after, 'the artwork changed').not.toEqual(before);
      const ink = await page.evaluate(() => {
        const d = ctx.getImageData(0, 0, art.width, art.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] === 255 && d[i + 1] === 34 && d[i + 2] === 136) n++;
        return n;
      });
      expect(ink, 'and it is the colour that was being painted with').toBeGreaterThan(0);

      await page.click('#undo');
      await page.waitForTimeout(250);
      expect(await pixels(page), 'and one undo puts every byte back').toEqual(before);
    });

  test('AND ONLY THE LETTERS LAND', async ({ page }) => {
    /* The compositor's promise, asserted where it matters rather than in the
       renderer's own units: every pixel the sprite did not cover has to come
       out of Add with the bytes it went in with. A stamp that cleared its
       bounding box would pass "the artwork changed" and fail this. */
    await page.evaluate(() => setColor('#00ff88'));
    await type(page, 'O');
    const s = await sprite(page);
    const before = await pixels(page);
    await page.click('#txadd');
    await page.waitForTimeout(250);
    const after = await pixels(page);

    const changed = [];
    for (let i = 0; i < before.length; i += 4) {
      if (before[i] === after[i] && before[i + 1] === after[i + 1]
        && before[i + 2] === after[i + 2] && before[i + 3] === after[i + 3]) continue;
      const p = i / 4;
      changed.push({ x: p % 80, y: Math.floor(p / 80) });
    }
    expect(changed.length, 'something landed').toBeGreaterThan(0);
    const outside = changed.filter(c =>
      c.x < s.x || c.y < s.y || c.x >= s.x + s.w || c.y >= s.y + s.h);
    expect(outside, 'and nothing outside the sprite was touched').toEqual([]);
  });

  test('DRAGGING ON THE CANVAS MOVES IT, and still does not draw',
    async ({ page }) => {
      /* The press is caught before any tool sees it, so this holds with the
         pencil selected - which is the state anyone typing text is in. */
      await type(page, 'W');
      await page.evaluate(() => { selectTool('pencil'); textX = 5; textY = 5; textDraw(); });
      const before = await pixels(page);

      const moved = await page.evaluate(async () => {
        const r = art.getBoundingClientRect();
        const at = (cx, cy) => ({ clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
          pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true });
        beginStroke(at(7, 7));
        const started = !!textDrag;
        stage.dispatchEvent(new PointerEvent('pointermove', at(19, 25)));
        await new Promise(x => setTimeout(x, 60));
        return { started, x: textX, y: textY };
      });
      expect(moved.started, 'a press inside the sprite starts a drag').toBe(true);
      expect({ x: moved.x, y: moved.y }, 'and it followed the pointer')
        .toEqual({ x: 17, y: 23 });
      expect(await pixels(page), 'with the artwork untouched throughout').toEqual(before);
    });

  test('Centre it puts it back in the middle', async ({ page }) => {
    await type(page, 'GM');
    await page.evaluate(() => { textX = 0; textY = 0; textDraw(); });
    await page.click('#txcentre');
    await page.waitForTimeout(120);
    const s = await sprite(page);
    expect(s.x).toBe(Math.round((80 - s.w) / 2));
    expect(s.y).toBe(Math.round((80 - s.h) / 2));
  });

  test('the two pixel axes come apart when Square is off', async ({ page }) => {
    await type(page, 'I');
    const square = await sprite(page);
    await page.click('#txlock');
    await setNum(page, 'txph', 6);
    const tall = await sprite(page);
    expect(tall.w, 'the width is unchanged').toBe(square.w);
    expect(tall.h, 'and the height is not').toBeGreaterThan(square.h);
  });

  test('an outline grows the sprite and arrives in its own colour',
    async ({ page }) => {
      await page.evaluate(() => setColor('#ffffff'));
      await type(page, 'X');
      const plain = await sprite(page);
      await page.evaluate(() => {
        document.getElementById('txolc').value = '#ff0000';
        document.getElementById('txolc').dispatchEvent(new Event('input', { bubbles: true }));
      });
      await setNum(page, 'txol', 2);
      const ringed = await sprite(page);
      expect(ringed.w, 'two pixels of ring on each side').toBe(plain.w + 4);
      expect(ringed.h).toBe(plain.h + 4);

      const red = await page.evaluate(() => {
        const d = textSprite.data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0 && d[i + 3] === 255) n++;
        return n;
      });
      expect(red, 'and the ring is the outline colour, not the ink').toBeGreaterThan(0);
    });

  test('a refusal from the renderer is shown, not swallowed', async ({ page }) => {
    /* renderPixelText throws with a plain sentence for anything it will not
       draw. Those sentences are better than anything this panel would
       invent, so the panel repeats them - and drops the sprite, so the
       preview cannot go on showing the last thing that worked. */
    await type(page, 'OK');
    expect(await sprite(page), 'there is something to lose').not.toBeNull();
    await setNum(page, 'txbold', 2.5);
    const r = await page.evaluate(() => ({
      sprite: textSprite, note: document.getElementById('txnote').textContent,
      shown: document.getElementById('txpv').style.display,
    }));
    expect(r.sprite, 'the sprite is gone').toBeNull();
    expect(r.note, "and the renderer's own words are on screen").toMatch(/whole pixel/i);
    expect(r.shown, 'and the preview is down').toBe('none');
  });

  test('Clear takes the pending text away and leaves the artwork alone',
    async ({ page }) => {
      const before = await pixels(page);
      await type(page, 'BYE');
      await page.click('#txclear');
      await page.waitForTimeout(120);
      expect(await sprite(page)).toBeNull();
      expect(await page.evaluate(() => document.getElementById('txtext').value)).toBe('');
      expect(await pixels(page)).toEqual(before);
    });
});

test.describe('lettering without a mouse', () => {
  test('PB.text places it, and only applies when asked', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: FLAT });
    const before = await pixels(page);

    const placed = await page.evaluate(() =>
      PB.text({ text: 'GM', size: 3, colour: '#22ddff', x: 6, y: 9 }));
    expect(placed.ok).toBe(true);
    expect({ x: placed.x, y: placed.y }, 'where it was asked for').toEqual({ x: 6, y: 9 });
    expect(placed.applied, 'and not committed').toBe(false);
    expect(await pixels(page), 'so the artwork is untouched').toEqual(before);

    const done = await page.evaluate(() => PB.text({ apply: true }));
    expect(done.applied).toBe(true);
    expect(await pixels(page), 'now it has landed').not.toEqual(before);
  });

  test('and it says why when there is nothing to draw', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: FLAT });
    const r = await page.evaluate(() => PB.text({ text: '   ' }));
    expect(r.ok).toBe(false);
    expect(typeof r.why).toBe('string');
  });

  test('and it drives the panel rather than going round it', async ({ page }) => {
    /* An agent that placed text by a private path would leave the panel
       showing something else, and the next person to touch a control would
       undo the agent's work without meaning to. */
    await openTrait(page, { w: 80, h: 80, draw: FLAT });
    await page.evaluate(() => PB.text({ text: 'HI', size: 4, font: 'compact' }));
    const r = await page.evaluate(() => ({
      open: !document.getElementById('txscrim').hidden,
      words: document.getElementById('txtext').value,
      font: document.getElementById('txfont').value,
      size: document.getElementById('txpw').value,
    }));
    expect(r, 'the panel says exactly what the sprite is')
      .toEqual({ open: true, words: 'HI', font: 'compact', size: '4' });
  });
});

test.describe('the artwork it will be added to', () => {
  test('THE SPRITE IS ON ITS OWN LAYER, above everything else on the stage',
    async ({ page }) => {
      /* Text is placed against whatever else is on screen - the base
         character, the grid, an outline preview. If any of those sat on top
         of it, it would be positioned against something it is not. */
      await openTrait(page, { w: 80, h: 80, draw: FLAT });
      await openPanel(page, 'tx');
      await type(page, 'Z');
      const z = await page.evaluate(() => ['art', 'olpv', 'qapv', 'cmppv', 'txpv']
        .map(id => +getComputedStyle(document.getElementById(id)).zIndex || 0));
      expect(Math.max(...z), 'the text layer is the top one').toBe(z[4]);
      expect(await page.evaluate(() =>
        getComputedStyle(document.getElementById('txpv')).pointerEvents),
      'and it never eats a click').toBe('none');
    });
});
