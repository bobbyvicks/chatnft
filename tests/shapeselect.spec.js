/* SELECTING THE SHAPE OF ANOTHER TRAIT.

   "it would be useful to have a option be the siluette of the skins so that you
   can literally remove everything but the skin without 'cropping'"
   ... "do the same for all the other layers (eyes glasses shirt etc)"

   Every number below is DERIVED from what the fixture paints and from
   paintTrait's own rule, not read off the screen:

   - the canvas is 40x40 = 1600 cells.
   - body is a 40x40 trait with a 20x30 block at (10,5): 600 cells, and the
     canvas is the same size, so paintTrait's whole-number fit is 1 and the
     block lands exactly where it was drawn.
   - specs is a 40x40 trait with a 12x6 block at (14,12): 72 cells, entirely
     inside body's block, so body minus specs is 528.
   - small is a TWENTY-pixel trait with a 10x10 block at (5,5). On a 40x40
     canvas paintTrait's k is min(floor(40/20),floor(40/20)) = 2 and the fit is
     2, so use is 2, dw and dh are 40, the offset is (40-40)/2 = 0, and the
     block lands as 20x20 at (10,10) = 400 cells. That is the whole point of
     going through paintTrait: a mask built by stretching the bitmap some other
     way would line up with nothing.
   - blank is 40x40 and entirely transparent: 0 cells, which is the case that
     must be refused rather than selected, because an empty mask becomes null
     and null means every pixel is allowed.
*/
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

/* The trait being edited: filled corner to corner, so "what is left after
   clearing outside a shape" is exactly the shape. */
const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 40]);
};

const seed = (page) => page.evaluate(async () => {
  cloudTeamId = null; activeWs = null;
  LAYERS = ['skins', 'eyes', 'unsorted'];
  const png = async (side, rect) => {
    const c = document.createElement('canvas'); c.width = side; c.height = side;
    const g = c.getContext('2d');
    if (rect) { g.fillStyle = 'rgb(20,180,90)'; g.fillRect(rect[0], rect[1], rect[2], rect[3]); }
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const rows = [
    ['body',  'skins',    40, [10, 5, 20, 30]],
    ['specs', 'eyes',     40, [14, 12, 12, 6]],
    ['small', 'unsorted', 20, [5, 5, 10, 10]],
    /* FIFTEEN, FILLED CORNER TO CORNER - the size where paintTrait and a
       naive stretch part company, and the doubling above cannot tell them
       apart because 20 into 40 is the same picture either way.

       k is floor(40/15) = 2 and the fit is 40/15 = 2.667, so the fit is
       bigger and the block rule decides: num 40, den 15, gcd 5, q = 3, and
       the fit is taken only if the art's block size divides by 3. Measured,
       pixelBlock of this is 5, so it does not - use stays 2, the art is drawn
       30x30 and the leftover 10 is split as an offset of 5. 900 cells at
       (5,5). Stretched to fill it would be 1600 at (0,0).

       A first version of this used 30 and asserted 100; it came back 196,
       because at a whole number of 1 paintTrait takes the fractional fit
       anyway - and 30 fills the canvas either way, so it could not have told
       the two apart even then. */
    ['odd', 'unsorted', 15, [0, 0, 15, 15]],
    ['blank', 'unsorted', 40, null],
  ];
  let n = 0;
  for (const [name, layer, side, rect] of rows) {
    await dbPut({ id: 't_' + name + '_' + layer + '_approved', kind: 'trait', name,
      layer, status: 'approved', blob: await png(side, rect), w: side, h: side,
      rarity: 1, at: 1, shelfOrder: (++n) * 1024 });
  }
  /* A SOFT EDGE. A 10x10 solid block at (15,15) inside a 12x12 ring drawn at
     alpha 60 - so the shape is 144 cells if any ink counts and 100 if a
     halfway threshold is used. Nothing else in this fixture can tell those
     two rules apart, because everything else is fully opaque. */
  {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,180,90,0.235)'; g.fillRect(14, 14, 12, 12);
    g.clearRect(15, 15, 10, 10);
    g.fillStyle = 'rgb(20,180,90)'; g.fillRect(15, 15, 10, 10);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await dbPut({ id: 't_soft_eyes_approved', kind: 'trait', name: 'soft', layer: 'eyes',
      status: 'approved', blob, w: 40, h: 40, rarity: 1, at: 1, shelfOrder: 5000 });
  }
  /* A base as well: it has no layer of its own and is the silhouette most
     often wanted, so the picker has to offer it. */
  await dbPut({ id: 'ref_hero', kind: 'ref', name: 'hero',
    blob: await png(40, [4, 4, 32, 32]), w: 40, h: 40, at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

/* Drive the control the way a person does: open the panel, pick a layer, pick
   a trait, press Use. */
const useShape = async (page, layer, name) => {
  const said = await page.evaluate(async ({ l, n }) => {
    const realToast = window.toast; const out = [];
    window.toast = (m) => out.push(String(m));
    try {
      const ls = document.getElementById('seshapelayer');
      ls.value = l;
      if (ls.value !== l) throw new Error('no layer called ' + l + ' in the picker');
      ls.dispatchEvent(new Event('change', { bubbles: true }));
      const ts = document.getElementById('seshapetrait');
      const opt = [...ts.options].find(o => o.textContent === n);
      if (!opt) throw new Error('no trait called ' + n + ' under ' + l);
      ts.value = opt.value;
      await seShapeUse();
      await new Promise(r => setTimeout(r, 120));
    } finally { window.toast = realToast; }
    return out;
  }, { l: layer, n: name });
  return said;
};

const sel = (page) => page.evaluate(() => {
  if (!selMask) return { count: 0, box: null };
  const b = selBounds(selMask);
  return { count: selCount(selMask), box: b ? [b.x0, b.y0, b.w, b.h] : null };
});

/* Opaque pixels left on the art. */
const ink = (page) => page.evaluate(() => {
  const d = ctx.getImageData(0, 0, art.width, art.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
});

test.describe('selecting the shape of another trait', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    await seed(page);
    await openPanel(page, 'se');
    await page.waitForTimeout(250);
  });

  test('THE PICKER OFFERS THE BASE AND EVERY LAYER THAT HOLDS A TRAIT',
    async ({ page }) => {
      /* Half the request is "do the same for all the other layers". The base
         goes first because it is not on a layer and it is the shape most often
         wanted; the layers follow in paint order, which is the order the list
         above them is already in. */
      const r = await page.evaluate(() => ({
        layers: [...document.getElementById('seshapelayer').options].map(o => o.value),
        labels: [...document.getElementById('seshapelayer').options].map(o => o.textContent),
        traits: [...document.getElementById('seshapetrait').options].map(o => o.textContent),
      }));
      expect(r.layers).toEqual(['base', 'skins', 'eyes', 'unsorted']);
      expect(r.labels[3], 'and says how many are in each').toBe('unsorted (3)');
      expect(r.labels[2]).toBe('eyes (2)');
      expect(r.traits, 'the trait list starts on the first layer').toEqual(['hero']);
    });

  test('TAKING A SKIN SHAPE SELECTS EXACTLY WHAT IT COVERS', async ({ page }) => {
    const said = await useShape(page, 'skins', 'body');
    const s = await sel(page);
    expect(s.count, 'a 20 by 30 block').toBe(600);
    expect(s.box, 'where it was drawn').toEqual([10, 5, 20, 30]);
    expect(said.join(' '), 'and it says what it took').toContain('shape of body');
  });

  test('A TRAIT OF ANOTHER SIZE LANDS WHERE THE CHARACTER PUTS IT',
    async ({ page }) => {
      /* The reason this goes through paintTrait rather than scaling the bitmap
         itself. A 20-pixel trait on a 40 canvas doubles and centres: the 10x10
         block at (5,5) becomes 20x20 at (10,10). Stretch it any other way and
         the mask lines up with nothing in the finished character. */
      await useShape(page, 'unsorted', 'small');
      const s = await sel(page);
      expect(s.count, '10x10 doubled').toBe(400);
      expect(s.box).toEqual([10, 10, 20, 20]);
    });

  test('AND ONE THAT DOES NOT DIVIDE IS DRAWN AT ITS OWN SIZE, CENTRED',
    async ({ page }) => {
      /* The case that tells paintTrait apart from stretching the bitmap to
         fill - the doubling above cannot, because 20 into 40 is the same
         picture either way. paintTrait gives up size to keep the pixels square
         and centres what is left over; a stretch fills the canvas and the mask
         lines up with nothing in the finished character. */
      await useShape(page, 'unsorted', 'odd');
      const s2 = await sel(page);
      expect(s2.count, 'thirty by thirty - the pixels stay square').toBe(900);
      expect(s2.box, 'centred, with the leftover ten split either side')
        .toEqual([5, 5, 30, 30]);
      expect(s2.count, 'and it did not simply fill the canvas').not.toBe(1600);
    });

  test('AND INVERT THEN DELETE CLEARS EVERYTHING OUTSIDE IT', async ({ page }) => {
    /* The request, end to end: "remove everything but the skin without
       cropping". The canvas is filled corner to corner, so what survives is
       exactly the shape - and the canvas is still 40x40 afterwards, which is
       the difference between this and a crop. */
    expect(await ink(page), 'it starts full').toBe(1600);
    await useShape(page, 'skins', 'body');
    await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      try { selInvert(); selDelete(); } finally { window.toast = realToast; }
      await new Promise(r => setTimeout(r, 150));
    });
    expect(await ink(page), 'only the skin shape is left').toBe(600);
    const size = await page.evaluate(() => art.width + 'x' + art.height);
    expect(size, 'and nothing was cropped').toBe('40x40');
  });

  test('THE COMBINE MODES APPLY TO IT', async ({ page }) => {
    /* It hands seCombine a region like every other shape does, so "the skin
       minus the glasses" works without a line written for it. specs sits
       entirely inside body, so 600 - 72 = 528. */
    await useShape(page, 'skins', 'body');
    await page.evaluate(() => setChip('semode', 'subtract'));
    await useShape(page, 'eyes', 'specs');
    const s = await sel(page);
    expect(s.count, 'the glasses taken out of the skin').toBe(528);
  });

  test('A SOFT EDGE IS PART OF THE SHAPE', async ({ page }) => {
    /* Any ink at all, not a threshold. The obvious alternative is floodFill's
       >=128 rule for "is this pixel on", and it is wrong here: clearing
       everything outside the shape would shave off exactly the soft edge
       somebody is trying to keep. 12x12 counting the faint ring, 10x10
       without it. */
    await useShape(page, 'eyes', 'soft');
    const s2 = await sel(page);
    expect(s2.count, 'the faint ring is in the shape').toBe(144);
    expect(s2.box).toEqual([14, 14, 12, 12]);
  });

  test('a trait with nothing in it is refused - the control', async ({ page }) => {
    /* An empty mask becomes null, and null means NO selection, which every
       tool reads as every pixel allowed. So picking a blank trait would not
       select nothing, it would quietly select everything - and the next
       Delete would clear the canvas. */
    await useShape(page, 'skins', 'body');
    expect((await sel(page)).count, 'there is a selection to lose').toBe(600);
    const said = await useShape(page, 'unsorted', 'blank');
    expect((await sel(page)).count, 'the selection is untouched').toBe(600);
    expect(said.join(' ')).toContain('nothing in it to take a shape from');
  });

  test('and walking the layer list takes no shape - the control', async ({ page }) => {
    /* A select that acted on change would take a shape on the way past every
       layer a keyboard arrows through, and each one of those is a real edit to
       the selection. Only the press does anything. */
    await useShape(page, 'skins', 'body');
    const before = await sel(page);
    const traits = await page.evaluate(async () => {
      const ls = document.getElementById('seshapelayer');
      for (const v of ['eyes', 'unsorted', 'base']) {
        ls.value = v;
        ls.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 60));
      }
      return [...document.getElementById('seshapetrait').options].map(o => o.textContent);
    });
    expect(traits, 'the trait list did follow the layer').toEqual(['hero']);
    expect(await sel(page), 'and the selection did not move').toEqual(before);
  });

  test('and the list is read again each time the panel opens', async ({ page }) => {
    /* Traits are saved, renamed and moved while the editor is open. A list
       gathered once looks right and points at records that are gone. */
    await page.evaluate(async () => {
      await dbPut({ id: 't_late_eyes_approved', kind: 'trait', name: 'late',
        layer: 'eyes', status: 'approved',
        blob: await (async () => {
          const c = document.createElement('canvas'); c.width = 40; c.height = 40;
          const g = c.getContext('2d'); g.fillStyle = 'rgb(9,9,9)'; g.fillRect(0, 0, 8, 8);
          return new Promise(r => c.toBlob(r, 'image/png'));
        })(), w: 40, h: 40, rarity: 1, at: 1, shelfOrder: 9999 });
      railPanel('se', false);
      railPanel('se', true);
      await new Promise(r => setTimeout(r, 300));
    });
    const r = await page.evaluate(() => {
      const ls = document.getElementById('seshapelayer');
      ls.value = 'eyes';
      ls.dispatchEvent(new Event('change', { bubbles: true }));
      return [...document.getElementById('seshapetrait').options].map(o => o.textContent).sort();
    });
    expect(r, 'the one saved since the panel last opened is there')
      .toEqual(['late', 'soft', 'specs']);
  });
});
