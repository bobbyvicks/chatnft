/* A BIGGER COLOUR BOX, AND A WHITE BACKDROP TO JUDGE AN OUTLINE AGAINST.

   "the way that the colours stayed out is now gone again when u bring it back
   make it bigger, also i want the ability to see a white background in the
   base button so i can see the outline better"

   The box was never gone - it was capped at 96px and showing about two rows
   of a 76-colour trait, which reads the same. The cap was defending the zoom
   and the zoom was never at risk from it; measured at five window shapes and
   five caps, the zoom does not move at any of them.

   The backdrop is a class on the frame, which is what keeps it out of every
   save: it is not a canvas, the same reason the base image never reaches one
   either. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

/* Enough colours that a small box cannot show them. */
const many = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    set(x, y, [(x * 5) % 256, (y * 7) % 256, ((x + y) * 11) % 256]);
};

const boxState = (page) => page.evaluate(() => {
  const box = document.getElementById('colbox');
  const r = box.getBoundingClientRect();
  const all = [...box.querySelectorAll('.sw')];
  const seen = all.filter(s => {
    const b = s.getBoundingClientRect();
    return b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5;
  }).length;
  return { h: Math.round(r.height), seen, of: all.length,
    scrolls: box.scrollHeight > box.clientHeight + 1,
    overflow: getComputedStyle(box).overflowY };
});

test('THE COLOURS ARE ACTUALLY VISIBLE, not just present', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTrait(page, { w: 96, h: 96, draw: many });
  const b = await boxState(page);
  expect(b.of, 'a trait with plenty of colours').toBeGreaterThan(40);
  /* At the old 96px cap this was about twelve. The number that matters is
     what a person can see without scrolling. */
  expect(b.h).toBeGreaterThan(150);
  expect(b.seen, 'shows more than two rows').toBeGreaterThan(24);
  /* Still capped, and able to scroll - but NOT asserted to be scrolling. At
     the old 96px a 64-colour trait had to scroll and most of it was hidden;
     at this height the same trait fits, which is the whole point. Demanding a
     scrollbar here would have been demanding the defect back. */
  expect(b.overflow).toBe('auto');
  expect(b.seen, 'and what fits, fits - nothing hidden for its own sake').toBe(b.of);
});

test('and it still costs no zoom, at four shapes', async ({ page }) => {
  /* THE CONDITION THE OLD CAP WAS DEFENDING. Measured against the same page
     with the box removed, so this cannot drift into comparing with a number
     written down once. */
  const lost = [];
  for (const [w, h] of [[1280, 900], [1600, 1000], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await openTrait(page, { w: 96, h: 96, draw: many });
    const r = await page.evaluate(() => {
      fitZoom();
      const withBox = zoom;
      const box = document.getElementById('colbox');
      const home = box.nextSibling, parent = box.parentNode;
      box.remove();
      fitZoom();
      const without = zoom;
      parent.insertBefore(box, home);
      fitZoom();
      return { withBox, without };
    });
    if (r.withBox !== r.without) lost.push(w + 'x' + h + ': ' + r.without + ' -> ' + r.withBox);
  }
  expect(lost).toEqual([]);
});

test('the tools are still all reachable', async ({ page }) => {
  const spilled = [];
  for (const [w, h] of [[1280, 900], [1600, 1000], [1280, 720], [1024, 768], [900, 1200]]) {
    await page.setViewportSize({ width: w, height: h });
    await openTrait(page, { w: 96, h: 96, draw: many });
    const out = await page.evaluate(() => {
      const rail = document.querySelector('.tools');
      const rr = rail.getBoundingClientRect();
      return [...rail.children].filter(k => {
        const b = k.getBoundingClientRect();
        return b.right > rr.right + 1 || b.bottom > rr.bottom + 1;
      }).map(k => k.id || k.className);
    });
    if (out.length) spilled.push(w + 'x' + h + ': ' + out.join(', '));
  }
  expect(spilled).toEqual([]);
});

test('THE WHITE BACKDROP GOES BEHIND THE TRAIT AND NOWHERE ELSE', async ({ page }) => {
  await openTrait(page, { w: 60, h: 60, draw: many });
  await openPanel(page, 'bl');
  const before = await page.evaluate(() => ({
    frame: getComputedStyle(document.getElementById('frame')).backgroundColor,
    pressed: document.getElementById('basewhite').getAttribute('aria-pressed'),
    label: document.getElementById('basewhite').textContent,
  }));
  expect(before.pressed).toBe('false');

  await page.click('#basewhite');
  const on = await page.evaluate(() => ({
    frame: getComputedStyle(document.getElementById('frame')).backgroundColor,
    stage: getComputedStyle(document.querySelector('.stage')).backgroundImage,
    pressed: document.getElementById('basewhite').getAttribute('aria-pressed'),
    label: document.getElementById('basewhite').textContent,
  }));
  expect(on.pressed).toBe('true');
  expect(on.frame, 'white lands on the frame').toBe('rgb(255, 255, 255)');
  /* WAS "Chequerboard", because this used to be white or chequer and nothing
     else. There are three backdrops now - a pale trait on white is the same
     complaint as a black dot on near-black - and the label still names what
     the NEXT press gives, which is what it always meant. */
  expect(on.label, 'and the button says what comes next').toContain('Black');
  /* NOT THE STAGE. The chequer around the trait is what makes the white read
     as a backdrop rather than the page turning white. */
  expect(on.stage, 'the stage keeps its chequer').toContain('gradient');
  expect(before.frame).not.toBe(on.frame);

  await page.click('#basewhite');
  const black = await page.evaluate(() => ({
    frame: getComputedStyle(document.getElementById('frame')).backgroundColor,
    label: document.getElementById('basewhite').textContent,
    pressed: document.getElementById('basewhite').getAttribute('aria-pressed'),
  }));
  expect(black.frame, 'then black, for judging a pale trait').toBe('rgb(11, 9, 16)');
  expect(black.label).toContain('Chequerboard');
  expect(black.pressed, 'still not the default backdrop').toBe('true');

  await page.click('#basewhite');
  const off = await page.evaluate(() => ({
    colour: getComputedStyle(document.getElementById('frame')).backgroundColor,
    image: getComputedStyle(document.getElementById('frame')).backgroundImage,
    pressed: document.getElementById('basewhite').getAttribute('aria-pressed'),
  }));
  /* ONE AT A TIME, and all the way round. Two backdrop classes left on at
     once would be a rule fight settled by source order rather than by the
     button. */
  expect(off.colour, 'and round to the chequer again').toBe(before.frame);
  expect(off.image, 'which is a chequer, not a flat colour').toContain('gradient');
  expect(off.pressed).toBe('false');
});

test('AND A BLACK DOT ON NOTHING IS ACTUALLY VISIBLE', async ({ page }) => {
  await openTrait(page, { w: 40, h: 40, draw: (set) => { set(20, 20, [0, 0, 0]); } });
  await openPanel(page, 'bl');
  const r = await page.evaluate(() => {
    /* The two squares of the chequer that sits behind the artwork. */
    const img = getComputedStyle(document.getElementById('frame')).backgroundImage;
    const hits = img.match(/rgb\(\s*\d+,\s*\d+,\s*\d+\s*\)/g) || [];
    const rgb = (s) => s.match(/\d+/g).map(Number);
    const lum = (c) => {
      const v = c.map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92
        : Math.pow((x + 0.055) / 1.055, 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (c, d) => {
      const a = lum(c), b = lum(d), hi = Math.max(a, b), lo = Math.min(a, b);
      return (hi + 0.05) / (lo + 0.05);
    };
    const squares = [...new Set(hits)].map(rgb);
    return {
      squares,
      vsBlack: Math.min(...squares.map(s => ratio(s, [0, 0, 0]))),
      vsWhite: Math.min(...squares.map(s => ratio(s, [255, 255, 255]))),
      chequer: squares.length > 1 ? ratio(squares[0], squares[1]) : 1,
    };
  });
  /* "theres like black spots where its supposed to be nothing but the user
     thinks they see nothing but theres actually a black dot"

     The old backdrop was var(--panel) against a 55% mix of --ground: measured
     1.14 against a black pixel, where 1.00 is two identical colours. It was
     not hard to see, it was not visible. */
  expect(r.squares.length, 'it is a chequer, so there are two').toBe(2);
  expect(r.vsBlack, 'a black pixel reads against the empty canvas')
    .toBeGreaterThan(4);
  /* AND THE OTHER END TOO, which is what stops this being the white button
     with extra steps: 3:1 is the threshold for telling two non-text things
     apart, and a pale trait has to clear it as well. */
  expect(r.vsWhite, 'and so does a white one').toBeGreaterThan(3);
  /* AND IT READS AS A CHEQUER - the one thing that says "this part is empty".
     The old pair differed by 1.04, so it did not. */
  expect(r.chequer, 'the two squares are visibly different').toBeGreaterThan(1.3);
});

test('it cannot reach the artwork, the save, or the export', async ({ page }) => {
  await openTrait(page, { w: 40, h: 40, draw: (set) => {
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) set(x, y, [46, 34, 47]);
  } });
  await openPanel(page, 'bl');
  const before = await page.evaluate(() => {
    const d = ctx.getImageData(0, 0, art.width, art.height).data;
    let clear = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) clear++;
    return clear;
  });
  await page.click('#basewhite');
  const after = await page.evaluate(() => {
    const d = ctx.getImageData(0, 0, art.width, art.height).data;
    let clear = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) clear++;
    /* And what a save would write, through the canvas saveTrait uses. */
    const c = traitCanvas({});
    const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let clearSaved = 0;
    for (let i = 0; i < p.length; i += 4) if (p[i + 3] === 0) clearSaved++;
    return { clear, clearSaved };
  });
  /* The transparent pixels are still transparent - in the artwork and in what
     a save writes. A backdrop that filled them would be the tool eating the
     trait, which is exactly why this is a div and not a canvas. */
  expect(after.clear, 'the artwork is untouched').toBe(before);
  expect(after.clearSaved, 'and so is what a save writes').toBe(before);
});

test('and it survives removing the base, because it is not part of it', async ({ page }) => {
  await openTrait(page, { w: 40, h: 40, draw: many });
  await openPanel(page, 'bl');
  await page.click('#basewhite');
  await page.click('#basedrop');
  const still = await page.evaluate(() => ({
    frame: getComputedStyle(document.getElementById('frame')).backgroundColor,
    pressed: document.getElementById('basewhite').getAttribute('aria-pressed'),
  }));
  /* A way of LOOKING, not a setting on the work: somebody checking 320
     outlines should not have to switch it back on each time. */
  expect(still.frame).toBe('rgb(255, 255, 255)');
  expect(still.pressed).toBe('true');
});
