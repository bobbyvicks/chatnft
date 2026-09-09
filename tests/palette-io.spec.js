/* Palette files in and out - Pixelorama's Palettes.gd in the Colours panel.

   Every number here is DERIVED from the algorithm as Pixelorama wrote it,
   not read off a run: the 9-character line rule, the empty-slot tag, the
   "one row is exactly as wide as it is long" width rule, the count-then-lines
   shape of a JASC file where a blank line inside the count eats a slot, the
   two scan orders - row-major for an image file, column-major for the open
   sprite - and the 8x8 grid a from-sprite palette starts on.

   THE LOAD-BEARING TESTS PAINT. An imported swatch that is listed but does
   not paint is a picture of a palette; so a swatch is clicked, a pencil
   stroke is made, and the pixels are read back against the brush geometry
   dab() uses. Then the trait is recoloured INTO the imported palette through
   the panel's own Replace, and the count of changed cells is the canvas
   minus the stroke.

   And the collection palette is checked untouched at the end of it all,
   because "a working set, not the collection's palette" is the rule this
   feature must not bend. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openTrait, openPanel } from './helpers.js';

/* A flat 40x40 field, #282830. */
const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
};

/* A .gpl exercising every branch of _import_gpl: the old #Palette Name:
   header, a Columns: line, a #Colors: comment, tabs and spaces, an empty-slot
   row, and a 5-character line that the 9-character rule drops. */
const GPL = [
  'GIMP Palette',
  '#Palette Name: Probe Ramp',
  '#Description: four steps',
  'Columns: 3',
  '#Colors: 6',
  '255\t0\t0\tRed',
  '0 255 0\tGreen',
  '0\t0\t255\tBlue',
  '0\t0\t0\tPixeloramaEmptySlot',
  '9 9 9',
  '128\t64\t32\tDark Orange',
].join('\n') + '\n';
/* Derived: five colour rows (the 5-character one is not a row), index 3
   tagged empty; Columns 3 and ceil(5/3)=2 rows, so six slots. */
const GPL_SLOTS = ['#ff0000', '#00ff00', '#0000ff', null, '#804020', null];
const GPL_HEXES = ['#ff0000', '#00ff00', '#0000ff', '#804020'];
/* export_gpl on that palette. #Colors: is the SLOT count; the description is
   every # line of the import minus its #, joined with spaces (Pixelorama's
   comment keeps them all); each of the six slots is a row, tagged where
   there is nothing. */
const GPL_OUT = [
  'GIMP Palette',
  '#Palette Name: Probe Ramp',
  '#Description: Palette Name: Probe Ramp Description: four steps Colors: 6 ',
  '#Colors: 6',
  'Columns: 3',
  '255\t0\t0\tff0000',
  '0\t255\t0\t00ff00',
  '0\t0\t255\t0000ff',
  '0\t0\t0\tPixeloramaEmptySlot',
  '128\t64\t32\t804020',
  '0\t0\t0\tPixeloramaEmptySlot',
].join('\n') + '\n';
const PAL_OUT = 'JASC-PAL\n0100\n4\n255 0 0\n0 255 0\n0 0 255\n128 64 32\n';
const HEX_OUT = 'ff0000\n00ff00\n0000ff\n804020\n';

/* A JASC file with Windows line ends, a count of 4, a blank line INSIDE the
   count (which _import_pal_palette skips without giving the slot back), one
   row past the count that must be ignored, and channels that go out of range:
   300 clamps to 255, -5 to 0, 12.7 rounds to 13 - Godot's Color.r8. */
const PAL = 'JASC-PAL\r\n0100\r\n4\r\n255 128 0\r\n\r\n12 34 56\r\n300 -5 12.7\r\n1 1 1\r\n';
const PAL_HEXES = ['#ff8000', '#0c2238', '#ff000d'];

/* Lospec's .hex, plus what Color(String) also takes: a # prefix, whitespace,
   rgb shorthand, rrggbbaa with the alpha dropped. Anything else is skipped. */
const HEX = '# a comment line\n#FF0000\n00ff00\n   0000FF   \nabc\n12345678\nzzzzzz\n\n';
const HEX_HEXES = ['#ff0000', '#00ff00', '#0000ff', '#aabbcc', '#123456'];

const swatches = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#piopal .sw')].map(s => s.classList.contains('pioempty') ? null : s.dataset.hex));

const count = (page, rgb) => page.evaluate(c => {
  const d = ctx.getImageData(0, 0, art.width, art.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3] > 0 && d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) n++;
  return n;
}, rgb);

/* A press and a release through the listeners a mouse reaches - the press on
   #art, which is what reaches beginStroke; see extensions.spec.js. */
const stroke = (page, from, to) => page.evaluate(async ({ from, to }) => {
  const r = art.getBoundingClientRect();
  const at = (cx, cy) => ({ clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true });
  art.dispatchEvent(new PointerEvent('pointerdown', at(from[0], from[1])));
  stage.dispatchEvent(new PointerEvent('pointermove', at(to[0], to[1])));
  stage.dispatchEvent(new PointerEvent('pointerup', at(to[0], to[1])));
  await new Promise(x => setTimeout(x, 80));
}, { from, to });

test.describe('reading palette files', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
  });

  test('A .GPL: EVERY BRANCH OF THE READER, AND THE GRID IT MAKES', async ({ page }) => {
    const r = await page.evaluate(g => PB.importPalette({ text: g, format: 'gpl', name: 'ramp' }), GPL);
    expect(r.ok, r.why).toBe(true);
    expect(r.name, 'the #Palette Name: header beats the file name').toBe('Probe Ramp');
    expect(r.width).toBe(3);
    expect(r.height, 'ceil(5/3)').toBe(2);
    expect(r.slots, 'four colours, the tagged slot empty, the sixth slot empty').toEqual(GPL_SLOTS);
    expect(r.hexes).toEqual(GPL_HEXES);
    expect(r.comment, "every # line, minus its #, as Pixelorama's comment").toBe(
      'Palette Name: Probe Ramp\nDescription: four steps\nColors: 6\n');
    const g = await page.evaluate(() => ({
      open: !document.getElementById('clscrim').hidden,
      shown: !document.getElementById('piopal').hidden,
      display: getComputedStyle(document.getElementById('piopal')).display,
      cols: document.getElementById('piopal').style.gridTemplateColumns,
      note: document.getElementById('pionote').textContent,
      dropShown: !document.getElementById('piodrop').hidden,
      src: document.getElementById('piosrc').value,
    }));
    expect(g.open, 'the panel it landed in is open').toBe(true);
    expect(g.shown).toBe(true);
    expect(g.display, 'and it lays out as a grid, though it is not classed .swatches').toBe('grid');
    expect(g.cols, "the grid is as wide as the file's Columns:").toBe('repeat(3, minmax(22px, 1fr))');
    expect(await swatches(page), 'one cell a slot, empties as empties').toEqual(GPL_SLOTS);
    expect(g.note).toContain('Probe Ramp');
    expect(g.note).toContain('4 colours');
    expect(g.note).toContain('3×2');
    expect(g.dropShown).toBe(true);
    expect(g.src, 'a fresh import is what Export offers').toBe('imported');
  });

  test('a .pal: the count is believed, a blank line inside it costs a slot, channels clamp', async ({ page }) => {
    const r = await page.evaluate(p => PB.importPalette({ text: p, format: 'pal', name: 'jasc' }), PAL);
    expect(r.ok, r.why).toBe(true);
    expect(r.hexes).toEqual(PAL_HEXES);
    expect(r.name, 'a .pal carries no name, so the file name is it').toBe('jasc');
    /* Three colours fit one row, and one row is exactly as wide as it is long. */
    expect(r.width).toBe(3);
    expect(r.height).toBe(1);
    expect(r.slots).toEqual(PAL_HEXES);
  });

  test('a .pal that declares more colours than it has stops where the file does', async ({ page }) => {
    const r = await page.evaluate(() => PB.importPalette({ text: 'JASC-PAL\n0100\n10\n1 2 3\n', format: 'pal', name: 'short' }));
    expect(r.ok).toBe(true);
    expect(r.hexes).toEqual(['#010203']);
    expect(r.width).toBe(1);
  });

  test('a .hex: one colour a line, read the way Color(String) reads one', async ({ page }) => {
    const r = await page.evaluate(h => PB.importPalette({ text: h, format: 'hex', name: 'lospec' }), HEX);
    expect(r.ok, r.why).toBe(true);
    expect(r.hexes).toEqual(HEX_HEXES);
    expect(r.width, 'five on one row').toBe(5);
    expect(r.height).toBe(1);
  });

  test('a Windows-written .gpl keeps its empty slot empty - the one place this reader is stricter than Pixelorama', async ({ page }) => {
    /* Pixelorama splits on \n alone, so on a CRLF file its tag compare sees
       "PixeloramaEmptySlot\r" and keeps a black colour in the slot. This
       reader splits on \r?\n, so the slot the file marked empty IS empty.
       Said here so the difference is a decision and not a surprise. */
    const r = await page.evaluate(g => PB.importPalette({ text: g.replace(/\n/g, '\r\n'), format: 'gpl', name: 'crlf' }), GPL);
    expect(r.ok, r.why).toBe(true);
    expect(r.slots).toEqual(GPL_SLOTS);
    expect(r.name).toBe('Probe Ramp');
    expect(r.width).toBe(3);
  });

  test('and what is not a palette is refused, with nothing shown - and then a real one IS shown', async ({ page }) => {
    const s = await page.evaluate(() => {
      const out = {
        noHeader: PB.importPalette({ text: '255 0 0 Red\n', format: 'gpl', name: 'x' }),
        wrongMagic: PB.importPalette({ text: 'RIFF\n0100\n1\n1 2 3\n', format: 'pal', name: 'x' }),
        noColours: PB.importPalette({ text: 'GIMP Palette\nName: empty\n', format: 'gpl', name: 'x' }),
        noFormat: PB.importPalette({ text: 'GIMP Palette\n', name: 'x' }),
        badHex: PB.importPalette({ hexes: ['#ff0000', 'not a colour'] }),
        nothing: PB.importPalette({}),
      };
      out.shown = !document.getElementById('piopal').hidden;
      out.working = PB.workingPalette();
      /* THE CONTROL: the same instrument, one field changed, must say yes.
         Without this, "nothing shown" would also be true of a grid that
         never shows anything. */
      out.control = PB.importPalette({ text: 'GIMP Palette\nName: one\n255 0 0 red\n', format: 'gpl', name: 'x' });
      out.shownAfter = !document.getElementById('piopal').hidden;
      return out;
    });
    for (const k of ['noHeader', 'wrongMagic', 'noColours', 'noFormat', 'badHex', 'nothing'])
      expect(s[k].ok, k + ': ' + JSON.stringify(s[k])).toBe(false);
    expect(s.noHeader.why).toContain('not a valid');
    expect(s.noColours.why, 'a valid header with no colours is refused, not shown as an empty grid').toContain('no colours');
    expect(s.shown, 'and nothing was shown').toBe(false);
    expect(s.working).toBeNull();
    expect(s.control.ok, 'the control import').toBe(true);
    expect(s.control.hexes).toEqual(['#ff0000']);
    expect(s.shownAfter, 'the same grid does show when there is something to show').toBe(true);
  });

  test('THE REAL FILE INPUT REACHES THE READER', async ({ page }) => {
    /* Everything above goes through PB. This is the button: the hidden
       input, its change event, the extension dispatch. */
    await page.setInputFiles('#piofile', { name: 'ramp.gpl', mimeType: 'text/plain', buffer: Buffer.from(GPL) });
    await page.waitForFunction(() => PB.workingPalette() && PB.workingPalette().name === 'Probe Ramp');
    expect(await swatches(page)).toEqual(GPL_SLOTS);
    /* And again with the same file: the input is cleared after a read, so the
       same choice fires again rather than being swallowed as "no change". */
    await page.evaluate(() => PB.dropPalette());
    await page.setInputFiles('#piofile', { name: 'ramp.gpl', mimeType: 'text/plain', buffer: Buffer.from(GPL) });
    await page.waitForFunction(() => !!PB.workingPalette());
    expect((await page.evaluate(() => PB.workingPalette())).name).toBe('Probe Ramp');
  });
});

test.describe('a palette from pixels', () => {
  /* Six by four. A transparent cell at (0,0), three marks and a half-alpha
     cell on a flat field. The two scan orders meet these in different orders,
     which is the point of having both. */
  const MARKS = (set, W, H) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
    set(0, 0, [0, 0, 0, 0]);
    set(1, 0, [200, 10, 10]);
    set(0, 1, [10, 200, 10]);
    set(2, 2, [10, 10, 200]);
    set(5, 3, [100, 100, 100, 128]);
  };

  test('FROM THE OPEN TRAIT: COLUMN-MAJOR, TRANSPARENT DROPPED, ALPHA FOLDED, ON AN 8x8 GRID', async ({ page }) => {
    await openTrait(page, { w: 6, h: 4, draw: MARKS });
    /* The half-alpha cell's RGB after the canvas has stored it is the
       algorithm's INPUT, so the expectation is derived from what is there. */
    const p53 = await page.evaluate(() => {
      const d = ctx.getImageData(5, 3, 1, 1).data;
      return { hex: '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''), a: d[3] };
    });
    expect(p53.a, 'the fixture kept its half alpha').toBeGreaterThan(0);
    expect(p53.a).toBeLessThan(255);
    const r = await page.evaluate(() => PB.importPalette({ fromTrait: true }));
    expect(r.ok, r.why).toBe(true);
    /* x outside, y inside: column 0 gives green at (0,1) then the field;
       column 1 gives red at (1,0); column 2 gives blue at (2,2); column 5
       gives the folded grey at (5,3). The transparent cell contributes nothing. */
    expect(r.hexes).toEqual(['#0ac80a', '#282830', '#c80a0a', '#0a0ac8', p53.hex]);
    expect(r.width, "the create dialog's default").toBe(8);
    expect(r.height, 'and its default height, which five colours do not outgrow').toBe(8);
    expect(r.slots.length).toBe(64);
    expect(r.slots.slice(0, 5)).toEqual(r.hexes);
    expect(r.slots.slice(5).every(s => s === null)).toBe(true);
    expect(r.name, 'named after the trait').toBe('test');
  });

  test('a from-trait palette past 64 colours grows a row at a time', async ({ page }) => {
    /* 70 distinct colours: ceil(70/8) = 9 rows. */
    await openTrait(page, { w: 70, h: 1, draw: (set, W) => { for (let x = 0; x < W; x++) set(x, 0, [x, 0, 0]); } });
    const r = await page.evaluate(() => PB.importPalette({ fromTrait: true }));
    expect(r.hexes.length).toBe(70);
    expect(r.width).toBe(8);
    expect(r.height).toBe(9);
  });

  test('FROM RAW PIXELS: ROW-MAJOR, and the same drops and folds', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    const r = await page.evaluate(() => {
      const W = 3, H = 2, d = new Uint8ClampedArray(W * H * 4);
      const put = (x, y, c) => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; };
      put(0, 0, [200, 10, 10, 255]); put(1, 0, [0, 0, 0, 0]); put(2, 0, [10, 200, 10, 255]);
      put(0, 1, [10, 200, 10, 255]); put(1, 1, [100, 100, 100, 128]); put(2, 1, [200, 10, 10, 255]);
      return PB.importPalette({ pixels: d, width: W, height: H, name: 'bytes' });
    });
    expect(r.ok, r.why).toBe(true);
    /* y outside, x inside: red, (skip), green; green again, grey folded, red again. */
    expect(r.hexes).toEqual(['#c80a0a', '#0ac80a', '#646464']);
    expect(r.width).toBe(3);
    expect(r.height).toBe(1);
  });

  test('FROM AN IMAGE FILE, THROUGH THE REAL INPUT', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    /* A 4x2 PNG made here: opaque and fully transparent cells only, so the
       PNG round trip cannot move a channel. Row-major first appearance:
       red, field, (skip), green; blue, red again, field again, olive. */
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 2;
      const g = c.getContext('2d'), im = g.createImageData(4, 2);
      const px = [[200, 10, 10, 255], [40, 40, 48, 255], [0, 0, 0, 0], [10, 200, 10, 255],
        [10, 10, 200, 255], [200, 10, 10, 255], [40, 40, 48, 255], [77, 88, 99, 255]];
      px.forEach((p, i) => im.data.set(p, i * 4));
      g.putImageData(im, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('#piofile', { name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await page.waitForFunction(() => !!PB.workingPalette());
    const r = await page.evaluate(() => PB.workingPalette());
    expect(r.name).toBe('shot');
    expect(r.hexes).toEqual(['#c80a0a', '#282830', '#0ac80a', '#0a0ac8', '#4d5863']);
    expect(r.width, 'five colours, one row').toBe(5);
  });
});

test.describe('painting with it', () => {
  test('A CLICK ON AN IMPORTED SWATCH PAINTS WITH IT - MEASURED ON THE ARTWORK', async ({ page }) => {
    const errors = await openTrait(page, { w: 40, h: 40, draw: FLAT });
    await page.evaluate(() => PB.importPalette({ hexes: ['#ff8000', '#0c2238'], name: 'two' }));
    const picked = await page.evaluate(() => {
      document.querySelector('#piopal .sw[data-hex="#0c2238"]').click();
      return {
        colour: color,
        pressed: [...document.querySelectorAll('#piopal .sw')].map(s => s.getAttribute('aria-pressed')),
        pickerWell: document.getElementById('picker').value,
        marked: [...document.querySelectorAll('#pal .sw[data-rc="1"]')].length,
      };
    });
    expect(picked.colour, 'it is the painting colour').toBe('#0c2238');
    expect(picked.pressed, 'and the swatch shows it, as #pal would').toEqual(['false', 'true']);
    expect(picked.pickerWell).toBe('#0c2238');
    expect(picked.marked, 'nothing in the trait was marked for replacing by it').toBe(0);
    /* A 3 brush at (10,10): dab starts at 10 - floor((3-1)/2) = 9 and covers
       9..11 both ways, so exactly nine cells become the colour on a field
       that has none of it. */
    await page.evaluate(() => { selectTool('pencil'); setBrush(3); });
    await stroke(page, [10, 10], [10, 10]);
    expect(await count(page, [12, 34, 56]), 'nine cells, the brush geometry').toBe(9);
    const corners = await page.evaluate(() => {
      const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
      return { in1: at(9, 9), in2: at(11, 11), out1: at(8, 8), out2: at(12, 12) };
    });
    expect(corners.in1).toBe('12,34,56');
    expect(corners.in2).toBe('12,34,56');
    expect(corners.out1).toBe('40,40,48');
    expect(corners.out2).toBe('40,40,48');
    /* The stroke rebuilt #pal from the canvas; the imported grid is not the
       canvas and must still be there. */
    expect(await swatches(page)).toEqual(['#ff8000', '#0c2238']);
    /* Thrown errors only. The page's boot-time fetch('/api/identify') is a
       404 under the static test server for every spec, patched or not, and
       arrives here as a console error; a swatch handler that throws would
       arrive as a pageerror and still fail this. */
    expect(errors.filter(e => !/Failed to load resource/.test(e)), 'no page errors on the way').toEqual([]);
  });

  test('RIGHT-CLICK MAKES IT THE TARGET, AND REPLACE RECOLOURS THE TRAIT INTO IT', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    await page.evaluate(() => PB.importPalette({ hexes: ['#ff8000', '#0c2238'], name: 'two' }));
    await page.evaluate(() => { document.querySelector('#piopal .sw[data-hex="#0c2238"]').click(); selectTool('pencil'); setBrush(3); });
    await stroke(page, [10, 10], [10, 10]);
    const marks = await page.evaluate(() => {
      /* The stroke put #0c2238 into the trait, so #pal has it now. Marking it
         there marks the TRAIT's colour; the imported swatch of the same hex
         shows the target mark and never the replace mark, because a click on
         it cannot take a replace mark off. Toggled back so the count below
         stays the field alone. */
      const s = document.querySelector('#pal .sw[data-hex="#0c2238"]');
      s.click();
      const r = { palRc: s.dataset.rc || null, importedRc: document.querySelector('#piopal .sw[data-hex="#0c2238"]').dataset.rc || null, picked: rcPick.size };
      s.click();
      r.pickedAfter = rcPick.size;
      return r;
    });
    expect(marks.palRc, "the trait's own swatch takes the mark").toBe('1');
    expect(marks.picked).toBe(1);
    expect(marks.importedRc, 'the imported swatch does not').toBeNull();
    expect(marks.pickedAfter, 'and the toggle took it back off').toBe(0);
    const m = await page.evaluate(() => {
      /* The field, marked in #pal - the trait's own grid - as the colour to
         change; the imported orange, right-clicked, as what it becomes. */
      document.querySelector('#pal .sw[data-hex="#282830"]').click();
      const t = document.querySelector('#piopal .sw[data-hex="#ff8000"]');
      t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return {
        target: rcTo,
        markedOnImported: t.dataset.to,
        line: document.getElementById('rcfrom').textContent,
        goDisabled: document.getElementById('rcgo').disabled,
      };
    });
    expect(m.target).toBe('#ff8000');
    expect(m.markedOnImported, 'the mark is drawn on the imported swatch').toBe('1');
    expect(m.line).toContain('#ff8000');
    expect(m.goDisabled).toBe(false);
    /* Moving the target to a #pal swatch takes the mark off the imported one:
       one sweep covers both grids. */
    const moved = await page.evaluate(() => {
      const s = document.querySelector('#pal .sw[data-hex="#0c2238"]');
      s.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const r = { target: rcTo, importedStillMarked: document.querySelector('#piopal .sw[data-hex="#ff8000"]').dataset.to || null };
      /* and back, for the replace below */
      document.querySelector('#piopal .sw[data-hex="#ff8000"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return r;
    });
    expect(moved.target).toBe('#0c2238');
    expect(moved.importedStillMarked).toBeNull();
    /* The stroke's press on the canvas is a click away from the panel, which
       closes it - so it is opened again, as a person would, before Replace
       is pressed through the real button. */
    await openPanel(page, 'cl');
    await page.click('#rcgo');
    await page.waitForTimeout(300);
    /* 40x40 minus the nine stroke cells: every field cell went orange, the
       stroke stayed. */
    expect(await count(page, [255, 128, 0]), '1600 - 9').toBe(1591);
    expect(await count(page, [12, 34, 56])).toBe(9);
    expect(await count(page, [40, 40, 48])).toBe(0);
  });

  test('an empty slot takes the current colour, and Ctrl+click takes a colour out', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    await page.evaluate(g => PB.importPalette({ text: g, format: 'gpl', name: 'ramp' }), GPL);
    const r = await page.evaluate(() => {
      setColor('#123456');
      document.querySelectorAll('#piopal .sw')[3].click();
      const afterAdd = PB.workingPalette().slots.slice();
      document.querySelectorAll('#piopal .sw')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      return { afterAdd, afterRemove: PB.workingPalette().slots.slice(), colour: color };
    });
    expect(r.afterAdd).toEqual(['#ff0000', '#00ff00', '#0000ff', '#123456', '#804020', null]);
    expect(r.afterRemove).toEqual([null, '#00ff00', '#0000ff', '#123456', '#804020', null]);
    expect(r.colour, 'removing did not change what is being painted with').toBe('#123456');
    expect(await swatches(page)).toEqual([null, '#00ff00', '#0000ff', '#123456', '#804020', null]);
  });
});

test.describe('writing palette files', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    await page.evaluate(g => PB.importPalette({ text: g, format: 'gpl', name: 'ramp' }), GPL);
  });

  test('.GPL IS export_gpl, BYTE FOR BYTE, AND ROUND-TRIPS', async ({ page }) => {
    const r = await page.evaluate(() => PB.exportPalette('gpl', 'imported'));
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Probe Ramp.gpl');
    expect(r.text).toBe(GPL_OUT);
    const back = await page.evaluate(t => PB.importPalette({ text: t, format: 'gpl', name: 'again' }), r.text);
    expect(back.slots, 'the empties come back where they were').toEqual(GPL_SLOTS);
    expect(back.width).toBe(3);
    expect(back.height).toBe(2);
    expect(back.name).toBe('Probe Ramp');
    /* And the description grows by one header, which is what Pixelorama's
       own round trip does - kept, and said out loud here. */
    expect(back.comment).toBe('Palette Name: Probe Ramp\nDescription: Palette Name: Probe Ramp Description: four steps Colors: 6 \nColors: 6\n');
  });

  test('.pal and .hex carry the colours only, in slot order', async ({ page }) => {
    const r = await page.evaluate(() => ({ pal: PB.exportPalette('pal', 'imported'), hex: PB.exportPalette('hex', 'imported') }));
    expect(r.pal.text).toBe(PAL_OUT);
    expect(r.hex.text).toBe(HEX_OUT);
    const back = await page.evaluate(t => PB.importPalette({ text: t, format: 'pal', name: 'pal' }), r.pal.text);
    expect(back.hexes).toEqual(GPL_HEXES);
  });

  test('the PNG strip is one pixel a slot, cropped to the used slots', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const e = PB.exportPalette('png', 'imported');
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = e.dataUrl; });
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      return { ok: e.ok, w: im.width, h: im.height, px: [...g.getImageData(0, 0, im.width, 1).data] };
    });
    expect(r.ok).toBe(true);
    /* Slots 0..5 with 5 empty: the used rect runs 0..4, so five pixels wide,
       the fourth transparent. */
    expect(r.w).toBe(5);
    expect(r.h).toBe(1);
    expect(r.px.slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(r.px.slice(12, 16)).toEqual([0, 0, 0, 0]);
    expect(r.px.slice(16, 20)).toEqual([128, 64, 32, 255]);
  });

  test('THE WIDTH RULE: one row is as wide as it is long, more is wrapped at 8, 255 loses Columns:', async ({ page }) => {
    const r = await page.evaluate(() => {
      const mk = n => Array.from({ length: n }, (_, i) => '#' + (i + 1).toString(16).padStart(6, '0'));
      PB.importPalette({ hexes: mk(20), name: 'twenty' });
      const twenty = PB.exportPalette('gpl', 'imported');
      PB.importPalette({ hexes: mk(5), name: 'five' });
      const five = PB.exportPalette('gpl', 'imported');
      PB.importPalette({ hexes: mk(300), name: 'wide', width: 300 });
      const wide = { p: PB.workingPalette(), gpl: PB.exportPalette('gpl', 'imported').text };
      PB.importPalette({ hexes: mk(3), name: 'huge', width: 1 << 20 });
      const huge = PB.workingPalette();
      return { twenty: twenty.text, five: five.text, wide, huge };
    });
    /* Twenty at the default width of 8: ceil(20/8) = 3 rows, 24 slots, four
       of them tagged empty. */
    expect(r.twenty).toContain('\n#Colors: 24\n');
    expect(r.twenty).toContain('\nColumns: 8\n');
    expect(r.twenty.split('PixeloramaEmptySlot').length - 1).toBe(4);
    /* Five: one row, so five wide, and nothing empty. */
    expect(r.five).toContain('\nColumns: 5\n');
    expect(r.five).toContain('\n#Colors: 5\n');
    expect(r.five).not.toContain('PixeloramaEmptySlot');
    /* Three hundred wide: kept, and past the 255 bound GIMP's loader refuses,
       so no Columns: line at all. */
    expect(r.wide.p.width).toBe(300);
    expect(r.wide.gpl).not.toContain('Columns:');
    /* A width past 1<<14 is clamped to it; three colours then fit one row,
       and the one-row rule makes it three wide. */
    expect(r.huge.width).toBe(3);
  });

  test('the project palette goes out and is never touched', async ({ page }) => {
    const r = await page.evaluate(() => {
      const before = PB.palette().hexes.slice();
      const gpl = PB.exportPalette('gpl', 'project');
      const hex = PB.exportPalette('hex', 'project');
      PB.importPalette({ hexes: ['#010203'], name: 'one' });
      PB.dropPalette();
      return { before, gpl: gpl.text, hex: hex.text, after: PB.palette().hexes.slice(), src: PB.palette().source.name };
    });
    expect(r.before.length).toBe(256);
    expect(r.after, 'PALETTE_HEX is not a working set').toEqual(r.before);
    expect(r.hex, 'the .hex is the 256, in order').toBe(r.before.map(h => h.slice(1)).join('\n') + '\n');
    /* 256 at width 8 is 32 rows exactly: no empties, Columns 8. */
    const lines = r.gpl.split('\n');
    expect(lines[0]).toBe('GIMP Palette');
    expect(lines[1]).toBe('#Palette Name: ' + r.src);
    expect(lines[3]).toBe('#Colors: 256');
    expect(lines[4]).toBe('Columns: 8');
    expect(lines.filter(l => l.indexOf('PixeloramaEmptySlot') >= 0).length).toBe(0);
    expect(lines.length, '5 header lines, 256 rows, the empty string after the last newline').toBe(262);
    expect(lines[5]).toBe([r.before[0].slice(1, 3), r.before[0].slice(3, 5), r.before[0].slice(5, 7)]
      .map(h => String(parseInt(h, 16))).join('\t') + '\t' + r.before[0].slice(1));
  });

  test("this trait's colours go out as the from-sprite palette", async ({ page }) => {
    /* Only the field is on the canvas: one colour on an 8x8 grid, 63 empties. */
    const r = await page.evaluate(() => PB.exportPalette('gpl', 'trait'));
    expect(r.ok).toBe(true);
    expect(r.name).toBe('test.gpl');
    expect(r.text).toContain('\n#Colors: 64\n');
    expect(r.text).toContain('\n40\t40\t48\t282830\n');
    expect(r.text.split('PixeloramaEmptySlot').length - 1).toBe(63);
  });

  test('THE EXPORT BUTTON DOWNLOADS THE SAME BYTES', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('piosrc').value = 'imported';
      document.getElementById('piofmt').value = 'pal';
    });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pioexport')]);
    expect(dl.suggestedFilename()).toBe('Probe Ramp.pal');
    expect(readFileSync(await dl.path(), 'utf8')).toBe(PAL_OUT);
  });
});

test.describe('drop, and the panel', () => {
  test('DROP TAKES THE GRID AWAY AND NOTHING ELSE', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    const before = await page.evaluate(() => ({
      pal: [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex),
      pixels: [...ctx.getImageData(0, 0, art.width, art.height).data],
      project: PB.palette().hexes.slice(),
      undo: undoStack.length,
    }));
    await page.evaluate(g => PB.importPalette({ text: g, format: 'gpl', name: 'ramp' }), GPL);
    const mid = await page.evaluate(() => ({ shown: !document.getElementById('piopal').hidden, n: document.querySelectorAll('#piopal .sw').length }));
    expect(mid.shown).toBe(true);
    expect(mid.n).toBe(6);
    await page.click('#piodrop');
    const after = await page.evaluate(() => ({
      shown: !document.getElementById('piopal').hidden,
      cells: document.querySelectorAll('#piopal .sw').length,
      dropShown: !document.getElementById('piodrop').hidden,
      working: PB.workingPalette(),
      src: document.getElementById('piosrc').value,
      importedOffered: !document.querySelector('#piosrc option[value="imported"]').disabled,
      pal: [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex),
      pixels: [...ctx.getImageData(0, 0, art.width, art.height).data],
      project: PB.palette().hexes.slice(),
      undo: undoStack.length,
      again: PB.dropPalette(),
    }));
    expect(after.shown).toBe(false);
    expect(after.cells).toBe(0);
    expect(after.dropShown).toBe(false);
    expect(after.working).toBeNull();
    expect(after.src, 'Export falls back to the trait').toBe('trait');
    expect(after.importedOffered).toBe(false);
    expect(after.pal, "the trait's own colours are untouched").toEqual(before.pal);
    expect(after.pixels, 'and so is the artwork').toEqual(before.pixels);
    expect(after.project).toEqual(before.project);
    expect(after.undo, 'importing and dropping are not edits').toBe(before.undo);
    expect(after.again.dropped, 'dropping nothing says so').toBe(false);
  });

  test('every control exists once, inside the Colours card, with a title', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof pioRender === 'function');
    const r = await page.evaluate(() => {
      const card = document.getElementById('clscrim');
      const ids = ['pioimport', 'piodrop', 'pionote', 'piopal', 'piosrc', 'piofmt', 'pioexport', 'piofile'];
      return {
        each: ids.map(id => ({ id, n: document.querySelectorAll('[id="' + id + '"]').length, inCard: !!card.querySelector('#' + id) })),
        titled: ['pioimport', 'piodrop', 'piosrc', 'piofmt', 'pioexport'].map(id => ({ id, title: (document.getElementById(id).title || '').length > 0 })),
        close: !!card.querySelector('#clclose'),
        secondGrid: [...card.querySelectorAll('#pal, #piopal')].map(e => e.id),
        /* recolour.spec.js pins ONE .swatches in the document - the property
           that #pal's colours are never drawn twice. The imported grid is a
           different set, so it lays out as a grid under its own id and does
           not add to that count. Asserted here so the two specs cannot drift
           into contradicting each other without one of them saying so. */
        swatchesClassed: document.querySelectorAll('.swatches').length,
        accept: document.getElementById('piofile').accept,
      };
    });
    for (const c of r.each) {
      expect(c.n, c.id + ' exists exactly once').toBe(1);
      expect(c.inCard, c.id + ' is in the Colours card').toBe(true);
    }
    for (const t of r.titled) expect(t.title, t.id + ' has a title').toBe(true);
    expect(r.close, 'the panel still has its Close button').toBe(true);
    expect(r.secondGrid, "the imported grid is the second grid, after the trait's").toEqual(['pal', 'piopal']);
    expect(r.swatchesClassed, 'and #pal is still the only .swatches').toBe(1);
    expect(r.accept).toBe('.gpl,.pal,.hex,image/*');
  });
});
