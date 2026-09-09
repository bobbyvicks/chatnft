/* SEEING A BATCH.

   "theres no preview when i import more than one image so i cant actually see
   how it went make that like when im working on it in project"

   One image gave you before and after. Several gave you a sentence and a zip
   button, so the only way to check the fixer got the grid right was to unpack
   the zip. The tiles fix that - and the reason they are THUMBNAILS is the
   thing worth pinning: a result is 1280x1280, which is 6.5 MB decoded, and
   five hundred tiles pointed at the full bytes is 3.2 GB. That is the shelf
   crash, already had once, recorded above SHELF_THUMB. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

const run = (page, n, opts = {}) => page.evaluate(async ({ n, names }) => {
  const files = [];
  for (let i = 0; i < n; i++) {
    const S = 16, c = document.createElement('canvas');
    c.width = S * 3; c.height = S * 3;
    const g = c.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      g.fillStyle = ((x + y + i) % 2) ? '#2e222f' : '#8b5fbf';
      g.fillRect(x * 3, y * 3, 3, 3);
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    files.push(new File([b], (names ? names[i] : 'shot' + i) + '.png', { type: 'image/png' }));
  }
  await fixBatch(files);
  return fixBatchFiles.length;
}, { n, names: opts.names });

const grid = (page) => page.evaluate(() => {
  const g = document.getElementById('fixresults');
  const tiles = [...g.querySelectorAll('.fixtile')];
  return {
    shown: !g.hidden,
    n: tiles.length,
    names: tiles.map(t => t.querySelector('b').textContent),
    sizes: [...new Set(tiles.map(t => t.querySelector('span').textContent))],
    /* What the tile's image actually points at, and how big it is. */
    srcs: tiles.map(t => t.querySelector('img').getAttribute('src')),
    natural: [...new Set(tiles.map(t => t.querySelector('img').width + 'x'
      + t.querySelector('img').height))],
  };
});

test('a batch shows every result, not just a sentence', async ({ page }) => {
  await ready(page);
  expect(await run(page, 4)).toBe(4);
  const g = await grid(page);
  expect(g.shown).toBe(true);
  expect(g.n, 'one tile per result').toBe(4);
  expect(g.names).toEqual(['shot0-fixed.png', 'shot1-fixed.png', 'shot2-fixed.png', 'shot3-fixed.png']);
  /* The tile says the size that was actually written. */
  expect(g.sizes).toEqual(['1280×1280']);
});

test('THE TILE IS A THUMBNAIL, WHICH IS WHAT STOPS THIS BEING THE SHELF CRASH', async ({ page }) => {
  await ready(page);
  await run(page, 3);
  const g = await grid(page);
  /* 1280 at the shelf cap comes down by a whole divisor: 1280/8 = 160. Five
     hundred of these is about 51 MB; five hundred of the full result would be
     3.2 GB, which is the crash this project already had once. */
  expect(g.natural).toEqual(['160x160']);
  /* And each tile has its OWN small image, not a pointer at the 1280 bytes. */
  for (const s of g.srcs) expect(s).toMatch(/^blob:/);
  const holds = await page.evaluate(() => {
    const t = document.querySelector('.fixtile');
    const src = t.querySelector('img').getAttribute('src');
    return { pointsAtResult: fixBatchFiles.some(f => f.thumb === src),
      thumbIsSmaller: fixBatchFiles.every(f => f.tw < f.w && f.th < f.h) };
  });
  expect(holds.pointsAtResult).toBe(true);
  expect(holds.thumbIsSmaller, 'the thumbnail is smaller than the result').toBe(true);
});

test('and the tile is square on the page, not stretched', async ({ page }) => {
  await ready(page);
  await run(page, 6);
  /* MEASURED ON THE RENDERED BOX, not on the stylesheet. The tile carries
     width= and height= attributes so the grid does not jump as each image
     loads, and those map to real CSS declarations that beat aspect-ratio -
     the first version rendered 105 wide and 160 tall. A rule that says
     aspect-ratio:1 while the element is not square is exactly the kind of
     thing a stylesheet assertion would have called correct. */
  const box = await page.evaluate(() =>
    [...document.querySelectorAll('.fixtile img')].map(i => {
      const b = i.getBoundingClientRect();
      return Math.round(b.width) + 'x' + Math.round(b.height);
    }));
  expect(box.length).toBe(6);
  for (const b of box) {
    const [w, h] = b.split('x').map(Number);
    expect(Math.abs(w - h), 'the tile is square, got ' + b).toBeLessThanOrEqual(1);
  }
  /* And the grid does not push the buttons off the page. */
  const reach = await page.evaluate(() => {
    const g = document.getElementById('fixresults').getBoundingClientRect();
    const dl = document.getElementById('fixbatchdl');
    const sv = document.getElementById('fixbatchsave');
    dl.scrollIntoView({ block: 'center' });
    const d = dl.getBoundingClientRect();
    return { belowGrid: d.top >= g.bottom - 1,
      onScreen: d.top >= 0 && d.bottom <= innerHeight,
      bothLive: !dl.disabled && !sv.disabled,
      sideways: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  expect(reach.belowGrid).toBe(true);
  expect(reach.onScreen, 'the zip button is reachable').toBe(true);
  expect(reach.bothLive, 'and both ways out are live once there are results').toBe(true);
  expect(reach.sideways).toBe(false);
});

test('the tiles appear as the run goes, not after it', async ({ page }) => {
  await ready(page);
  /* A run of 320 that shows nothing until the end is the thing being
     complained about. Counted from inside, at the moment each result lands. */
  const seen = await page.evaluate(async () => {
    const counts = [];
    const realTile = window.fixTile;
    window.fixTile = function (f) {
      const r = realTile.apply(this, arguments);
      counts.push({ done: fixBatchFiles.length,
        tiles: document.querySelectorAll('.fixtile').length });
      return r;
    };
    const files = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas'); c.width = 48; c.height = 48;
      const g = c.getContext('2d');
      g.fillStyle = '#2e222f'; g.fillRect(0, 0, 48, 48);
      g.fillStyle = '#8b5fbf'; g.fillRect(i * 3, 0, 3, 48);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      files.push(new File([b], 'p' + i + '.png', { type: 'image/png' }));
    }
    await fixBatch(files);
    window.fixTile = realTile;
    return counts;
  });
  expect(seen.length).toBe(3);
  /* Tile n exists while only n results are done - so the grid was filling
     during the run rather than being built at the end. */
  expect(seen.map(s => s.done)).toEqual([1, 2, 3]);
  expect(seen.map(s => s.tiles)).toEqual([1, 2, 3]);
});

test('a second run releases the first one, and does not stack up', async ({ page }) => {
  await ready(page);
  await run(page, 3, { names: ['a', 'b', 'c'] });
  const first = await page.evaluate(() => fixBatchFiles.map(f => f.thumb));
  await run(page, 2, { names: ['d', 'e'] });
  const g = await grid(page);
  expect(g.n, 'the old tiles are gone, not appended to').toBe(2);
  expect(g.names).toEqual(['d-fixed.png', 'e-fixed.png']);
  /* An object URL is not collected on its own, so five hundred of them would
     survive every later run. Revoked ones no longer load. */
  const dead = await page.evaluate(async (urls) => {
    const out = [];
    for (const u of urls) {
      out.push(await new Promise(res => {
        const i = new Image();
        i.onload = () => res('still loads');
        i.onerror = () => res('revoked');
        i.src = u;
      }));
    }
    return out;
  }, first);
  expect(dead, 'the blobs from the first run were released')
    .toEqual(['revoked', 'revoked', 'revoked']);
});

test('clicking a tile opens that one, and it is the only full decode', async ({ page }) => {
  await ready(page);
  await run(page, 3, { names: ['first', 'second', 'third'] });
  const r = await page.evaluate(async () => {
    let decodes = 0;
    const real = window.createImageBitmap;
    window.createImageBitmap = function (...a) { decodes++; return real.apply(this, a); };
    document.querySelectorAll('.fixtile')[1].click();
    await new Promise(r => setTimeout(r, 600));
    window.createImageBitmap = real;
    return { decodes, name: fileName, w: art.width, h: art.height,
      appUp: !document.getElementById('app').hidden };
  });
  expect(r.appUp, 'it opens in the editor').toBe(true);
  expect(r.name).toBe('second-fixed.png');
  expect(r.w + 'x' + r.h).toBe('1280x1280');
  /* ONE. The grid showing three tiles decoded none of them at full size. */
  expect(r.decodes, 'exactly one result is decoded, the one clicked').toBe(1);
});

test('a single image still gets its before and after, unchanged', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const S = 16, c = document.createElement('canvas');
    c.width = S * 3; c.height = S * 3;
    const g = c.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      g.fillStyle = ((x + y) % 2) ? '#2e222f' : '#8b5fbf'; g.fillRect(x * 3, y * 3, 3, 3);
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    await fixLoad(new File([b], 'one.png', { type: 'image/png' }));
    await fixRun();
  });
  const r = await page.evaluate(() => ({
    pair: !document.getElementById('fixpair').hidden,
    after: document.getElementById('fixafter').width,
    gridShown: !document.getElementById('fixresults').hidden,
  }));
  expect(r.pair, 'the pair is still how one image is shown').toBe(true);
  expect(r.after).toBeGreaterThan(0);
  expect(r.gridShown, 'and the batch grid stays out of the way').toBe(false);
});
