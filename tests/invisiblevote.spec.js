/* ONLY VISIBLE PIXELS DECIDE A CELL, AND A CELL NEVER TAKES A COLOUR NOBODY DREW.

   Two defects in the engine's reconstruction, found on the real traits on
   2026-09-18 and verified through the real page by three reviewers with
   different instruments.

   The engine let every pixel vote for a cell's label and averaged every
   winning pixel into its colour, transparent ones included, while the
   cell's alpha was decided separately by a count. A browser canvas hands
   the engine (0,0,0) under every alpha-0 pixel, so a cell that was 55%
   opaque could be opaque AND black: chains/Cross Chain came out with 8 of
   its 106 opaque cells black where no dark pixel exists in the source,
   extras/Moon Fisher with 11 of 286.

   And the mean invented colours: a cell whose winning label spanned two
   exact colours got a third, on 141 of 311 traits (94,926 colours in
   total; Club Penguin Iceberg went in with 115 colours and came out with
   952). The palette snap then mapped the blend.

   EACH TEST CARRIES ITS OWN POSITIVE CONTROL. The engine text sits in
   #pfcore, so a test can load a second copy with one line changed back to
   the reference rule and show that copy gives the other answer on the
   same fixture. Without that, a fixture the rule cannot distinguish would
   pass for ever. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* The page's engine text, loaded in a private realm so window.PF stays
   untouched; `mutate` is a [needle, replacement] applied once, or null. */
const engineIn = (page, mutate) => page.evaluate((mutate) => {
  let text = document.getElementById('pfcore').textContent;
  if (mutate) {
    const n = text.split(mutate[0]).length - 1;
    if (n !== 1) throw new Error('needle found ' + n + ' times: ' + mutate[0]);
    text = text.replace(mutate[0], mutate[1]);
  }
  // eslint-disable-next-line no-new-func
  window.__PF = new Function('globalThis', text + '\nreturn globalThis.PF;')({});
  if (window.PF) throw new Error('the engine leaked onto the page');
  return typeof window.__PF.process;
}, mutate);

/* Five columns red, three columns transparent, in every 8px cell. */
const FIVE = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const cx = x % 8, i = (y * W + x) * 4;
    if (cx < 3 || cx > 5) { im.data[i] = 255; im.data[i + 3] = 255; }
  }
  g.putImageData(im, 0, 0);
`;
/* A gradient blob with a texture and mild noise: no grid, hundreds of
   thousands of colours, soft region boundaries - what an AI render is
   like. Integer arithmetic only, so it is the same picture everywhere. */
const BLOB = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  let s = 11 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push({ x: 300 + (rnd() % 680), y: 300 + (rnd() % 680), r: 120 + (rnd() % 260), t: rnd() & 3 });
  const noise = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) noise[i] = rnd() & 31;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let inside = false, tint = 0;
    for (const b of blobs) { const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy <= b.r * b.r) { inside = true; tint ^= (b.t + 1); } }
    if (!inside) continue;
    const i = (y * W + x) * 4, n = noise[y * W + x];
    const band = ((x + y) / 40 | 0) & 1 ? 20 : 0;
    d[i] = Math.min(255, 40 + ((x * 160 / W) | 0) + n + band + tint * 30);
    d[i + 1] = Math.min(255, 30 + ((y * 170 / W) | 0) + (n >> 1) + (tint & 1) * 50);
    d[i + 2] = Math.min(255, 90 + (((x + y) * 120 / (2 * W)) | 0) + (n >> 2) + (tint & 2) * 40);
    d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;
/* 8px blocks in 200 distinct colours, with a transparent quadrant: art
   that is already on the grid and must come back byte for byte. */
const FLAT = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let cy = 0; cy < 160; cy++) for (let cx = 0; cx < 160; cx++) {
    if (cx < 60 && cy < 60) continue;
    const k = (cx * 7 + cy * 13) % 200;
    const col = [(k * 37 + 11) & 255, (k * 53 + 7) & 255, (k * 71 + 3) & 255];
    for (let y = cy * 8; y < cy * 8 + 8; y++) for (let x = cx * 8; x < cx * 8 + 8; x++) {
      const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
`;

/* Through the real tab: typed 8, Save at 1280 OFF so FIX.out is the
   engine's own cells, palette off so the colour rule is what is measured. */
const runTab = (page, src) => page.evaluate(async (s) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(s + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = false;
  document.getElementById('fixpal').checked = false;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'fixture.png', { type: 'image/png' }));
  const r = await fixRun();
  window.toast = realToast;
  const src = FIX.src.data;
  const have = new Set();
  for (let i = 0; i < src.length; i += 4) if (src[i + 3]) have.add((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]);
  let opaque = 0, black = 0, invented = 0, red = 0;
  const seen = new Set();
  for (let i = 0; i < r.data.length; i += 4) {
    if (!r.data[i + 3]) continue;
    opaque++;
    const k = (r.data[i] << 16) | (r.data[i + 1] << 8) | r.data[i + 2];
    if (k === 0) black++;
    if (k === 0xff0000) red++;
    if (!seen.has(k)) { seen.add(k); if (!have.has(k)) invented++; }
  }
  return { cols: r.width, rows: r.height, opaque, black, red, invented, coloursOut: seen.size, coloursIn: have.size };
}, src);

/* The same picture straight through an engine copy in the page. */
const runEngine = (page, src, opts) => page.evaluate(({ s, opts }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(s + '\nreturn c;')();
  const g = c.getContext('2d', { willReadFrequently: true });
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const have = new Set();
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) have.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  const r = window.__PF.process(px, c.width, c.height, Object.assign({ forceStep: 8 }, opts || {}));
  c.width = 1; c.height = 1;
  let opaque = 0, black = 0, invented = 0;
  const seen = new Set();
  for (let i = 0; i < r.data.length; i += 4) {
    if (!r.data[i + 3]) continue;
    opaque++;
    const k = (r.data[i] << 16) | (r.data[i + 1] << 8) | r.data[i + 2];
    if (k === 0) black++;
    if (!seen.has(k)) { seen.add(k); if (!have.has(k)) invented++; }
  }
  return { opaque, black, invented };
}, { s: src, opts });

test.describe('only visible pixels decide a cell', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('A HALF-COVERED CELL TAKES THE COLOUR THAT IS THERE, not the transparent black around it', async ({ page }) => {
    const r = await runTab(page, FIVE);
    expect(r.cols, 'typed 8 on 1280').toBe(160);
    expect(r.opaque, 'five of eight columns is a majority, so every cell is opaque').toBe(25600);
    expect(r.red, 'and every one of them is the red that was painted').toBe(25600);
    expect(r.black).toBe(0);
  });

  test('and the reference rule on the same picture paints them black - the control', async ({ page }) => {
    /* The engine copy with the visible-only switch forced off is the
       reference's rule exactly. Same fixture, other answer. */
    expect(await engineIn(page, ['var visibleOnly = !opts.reference;', 'var visibleOnly = false;'])).toBe('function');
    const r = await runEngine(page, FIVE);
    expect(r.opaque).toBe(25600);
    expect(r.black, 'the transparent columns outweigh the red at the cell centre').toBe(25600);
    /* And the shipped text, asked for the reference rule by its flag,
       agrees with the mutant: the flag really is the old rule. */
    expect(await engineIn(page, null)).toBe('function');
    const flagged = await runEngine(page, FIVE, { reference: true });
    expect(flagged.black).toBe(25600);
  });

  test('A CELL NEVER TAKES A COLOUR NOBODY DREW', async ({ page }) => {
    const r = await runTab(page, BLOB);
    expect(r.coloursIn, 'the fixture has no grid and a great many colours').toBeGreaterThan(100000);
    expect(r.opaque).toBeGreaterThan(5000);
    expect(r.invented, 'every output colour occurs in the source').toBe(0);
  });

  test('and the mean it replaced invented hundreds on the same picture - the control', async ({ page }) => {
    /* The mode block skipped, the visible-only vote kept: the mean alone.
       Measured 961 invented colours on this fixture; the bar is well under
       that and far above zero, which is all a control has to be. */
    expect(await engineIn(page, ['var modeKey = null;\n    if (visibleOnly) {', 'var modeKey = null;\n    if (false) {'])).toBe('function');
    const r = await runEngine(page, BLOB);
    expect(r.invented, 'the mean of a cell spanning two colours is a third colour').toBeGreaterThan(100);
  });

  test('ART ALREADY ON THE GRID COMES BACK BYTE FOR BYTE, transparent quadrant and all', async ({ page }) => {
    const r = await page.evaluate(async (s) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(s + '\nreturn c;')();
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      c.width = 1; c.height = 1;
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixgrid').checked = false;
      document.getElementById('fixpal').checked = false;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
      const realToast = window.toast; window.toast = () => {};
      await fixLoad(new File([blob], 'flat.png', { type: 'image/png' }));
      const r = await fixRun();
      window.toast = realToast;
      let bad = 0, colours = new Set();
      for (let cy = 0; cy < 160; cy++) for (let cx = 0; cx < 160; cx++) {
        const o = (cy * 160 + cx) * 4;
        const want = (cx < 60 && cy < 60) ? [0, 0, 0, 0] : (() => { const k = (cx * 7 + cy * 13) % 200; return [(k * 37 + 11) & 255, (k * 53 + 7) & 255, (k * 71 + 3) & 255, 255]; })();
        if (want[3] === 0) { if (r.data[o + 3] !== 0) bad++; continue; }
        colours.add(want.join(','));
        for (let k = 0; k < 4; k++) if (r.data[o + k] !== want[k]) { bad++; break; }
      }
      return { cols: r.width, bad, colours: colours.size };
    }, FLAT);
    expect(r.cols).toBe(160);
    expect(r.colours, 'more distinct colours than the quantiser keeps, so labels merge').toBe(200);
    expect(r.bad, 'and not one cell moved').toBe(0);
  });
});
