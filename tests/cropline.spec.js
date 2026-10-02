/* A THIN DARK LINE HUGGING A CANVAS EDGE IS A CROP, NOT OUTLINE (patch628).

   The owner, on the clothing batch at pixel size 16: "the ones with the black line at the bottom are no bueno".
   The line is IN THE SOURCES: 23 of 32 clothing library files end in a pure-black run along the bottom canvas
   edge where the garment was cut off (measured 2026-10-02, RR/wip/edges.cjs and rows.cjs: CHUD Shirt rows
   1270-1279 are #000000 for all 980 opaque pixels of the row - 10 px; Dogecoin Polo 5 px; Wall Street Power Suit
   1 px; Mario Overalls 1 px). At 16 the engine voted CHUD's whole bottom cell row black (976 of 976 opaque
   bottom-row pixels of the 1280 output near-black; the bottom 16 rows 100% near-black), with the outline switch
   on or off - the cell decision, not fixOutlineApply. Replacing the run with the colour just inside it before the
   engine saw the picture (RR/wip/cleanedge.cjs, batch 4b) gave the output the owner approved; the page's rule
   (fixCropLine) reproduces that output cell for cell on all four files.

   THE RULE: before the engine sees the pixels, a near-black run (alpha > 0, r g b < 40) that starts at a canvas
   edge, is THINNER THAN THE STEP the run uses (the size box; 16 as the ceiling when the box is 0 and the engine
   picks the step), and has not-transparent, not-dark art immediately inside it, is replaced column by column (row
   by row at the left and right edges) with the pixel just inside it - when more than 50 columns of that edge carry
   one (a line runs along the edge; a speck does not). A run as thick as the step or thicker, a run with
   transparency inside it, a dark line anywhere not at the canvas edge, a picture that is black at the bottom with
   nothing inside, and a dark speck at the edge all stay as drawn. Both paths that hand pixels to the worker apply
   it (fixBatchRun, fixRun) and each says so.

   RUN AGAINST THE PAGE BEFORE THE PATCH (PB_PAGE=/before-628.html): the 6 px run comes out as a black bottom
   cell row (the defect), and every test that asks fixCropLine for its answer fails because the function is not
   there; the controls - the 24 px band, the line in the middle, the shape with no run, the 10 px run at size 8 -
   pass on both pages, which is what makes them controls.

   ROUND 2 (2026-10-02): the module owner reviewed the edge-band sheets of every output round 1 changed. The garments
   are right (Beige MM Hoodie, Coinbase Blue Jacket, Hawaiian Shirt, Lakers 24 Jersey lose only the black run at the
   canvas edge; the drawn hem strokes stay). The full-bleed pictures are wrong: Black and White Waves' stripe ends at
   every edge are art, not a crop line, and round 1 rewrote them; White Couch Group's thin black frame along all four
   edges is drawn too. DECISION: the rule applies only to a CUT-OUT - a picture with at least one transparent pixel
   (alpha === 0 anywhere) - never to a full-bleed picture; decided from the picture, not the folder. Of the 311 library
   sources exactly the 47 backgrounds are full-bleed (measure628/round2/alpha0-311.txt). Tests 6 and 7 below pin it:
   a full-bleed picture with the 6 px run keeps its black bottom row, byte-identical to the page with the pre-pass
   off; the same picture with ONE transparent pixel anywhere is a cut-out and the run is cleared. Tests 1-5 are
   round 1's and keep their assertions (their pictures have transparency round the square, so they are cut-outs). */
import { test, expect } from '@playwright/test';

const PAGE = process.env.PB_PAGE || '/index.html';
const FILL = [200, 80, 60];
const BG = [60, 120, 200];

/* THE PICTURE: a 1280 canvas, one flat colour in a square x 160..1119, y 400..1279 - it touches the bottom edge
   and no other. o.run: a black run that many px thick along the bottom of the square (the crop line); o.mid: a
   6 px black line across the square at y 800; o.narrow: the square only reaches x 639, while the run spans
   x 160..1119, so the run's right half has transparency above it. o.full (round 2): the whole canvas is first
   filled with BG, so every pixel is opaque - a full-bleed picture; o.hole: [x, y] of one pixel cleared to alpha 0
   afterwards - the one transparent pixel that makes it a cut-out. PNG bytes, base64. */
const draw = (page, o) => page.evaluate(async (o) => {
  const W = 1280, c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d');
  if (o.full) { g.fillStyle = 'rgb(60,120,200)'; g.fillRect(0, 0, W, W); }
  g.fillStyle = 'rgb(200,80,60)'; g.fillRect(160, 400, o.narrow ? 480 : 960, 880);
  g.fillStyle = '#000000';
  if (o.run) g.fillRect(160, W - o.run, 960, o.run);
  if (o.mid) g.fillRect(160, 800, 960, 6);
  /* a speck: 6 px thick, 48 columns (3 cells) on the bottom edge, x 640..687 */
  if (o.speck) g.fillRect(640, W - 6, 48, 6);
  if (o.hole) g.clearRect(o.hole[0], o.hole[1], 1, 1);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}, o);

/* One single run through the page's own path at a pixel size (Save at 1280 on, palette off so the fill colour
   stays exact, outline on - the owner's switch). Returns the bottom cell row across the square (black cells, cells
   of the fill colour), a hash of the result cells, the sha of the bytes a save writes, the readout, and whether
   the loaded source (the before-preview) still has its bottom row black. */
const fixOne = (page, o) => page.evaluate(async ({ b64, size, rel }) => {
  try { authed = true; } catch (_) {}
  gateShow(false); showPage('fixer', false);
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
    if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
  set('fixforce', String(size)); set('fixgrid', true); set('fixpal', false); set('fixline', true);
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (!await fixLoad(fileWithPath(bytes, rel || 'clothing/wip/probe.png'))) return { error: document.getElementById('fixout').textContent };
  const r = await fixRun();
  const W = r.width, H = r.height, d = r.data;
  const blk = (x, y) => { const i = (y * W + x) * 4; return d[i + 3] >= 128 && d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40; };
  const fill = (x, y) => { const i = (y * W + x) * 4; return d[i + 3] >= 128 && d[i] === 200 && d[i + 1] === 80 && d[i + 2] === 60; };
  const x0 = Math.round(160 / (1280 / W)), x1 = Math.round(1120 / (1280 / W));
  let black = 0, fillN = 0;
  for (let x = x0; x < x1; x++) { if (blk(x, H - 1)) black++; if (fill(x, H - 1)) fillN++; }
  let hash = 2166136261; for (let i = 0; i < d.length; i++) hash = Math.imul(hash ^ d[i], 16777619) >>> 0;
  const saved = await fixResultBytes(r);
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', saved))).slice(0, 12).join('.');
  /* the source as loaded: its bottom row at the square's middle */
  const s = FIX.src, si = ((s.height - 1) * s.width + 640) * 4;
  const srcBottomBlack = s.data[si + 3] > 0 && s.data[si] < 40 && s.data[si + 1] < 40 && s.data[si + 2] < 40;
  return { cells: W + 'x' + H, span: x1 - x0, black, fill: fillN, hash, sha, srcBottomBlack, said: document.getElementById('fixout').textContent };
}, o);

/* fixCropLine asked directly, on a picture painted in-page as RGBA (no PNG in the way). p: {W, H, rects:[[x,y,w,h,[r,g,b,a]]]}.
   Returns what it replaced and the pixel at a few probes after. */
const direct = (page, p, step, probes) => page.evaluate(({ p, step, probes }) => {
  const d = new Uint8ClampedArray(p.W * p.H * 4);
  for (const [x0, y0, w, h, c] of p.rects) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * p.W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255;
  }
  const before = new Uint8ClampedArray(d);
  const res = fixCropLine(d, p.W, p.H, step);
  let changed = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== before[i] || d[i + 1] !== before[i + 1] || d[i + 2] !== before[i + 2] || d[i + 3] !== before[i + 3]) changed++;
  const at = (probes || []).map(([x, y]) => { const i = (y * p.W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]].join(','); });
  return { pixels: res.pixels, edges: res.edges, holes: res.holes, changed, at };
}, { p, step, probes });

const BLACK = [0, 0, 0], K = 255;
/* the same square as draw(), as rects */
const square = (extra) => ({ W: 1280, H: 1280, rects: [[160, 400, 960, 880, FILL]].concat(extra || []) });
/* round 2: the same square on a canvas filled with BG first - every pixel opaque, a full-bleed picture */
const fullbleed = (extra) => ({ W: 1280, H: 1280, rects: [[0, 0, 1280, 1280, BG], [160, 400, 960, 880, FILL]].concat(extra || []) });
const HOLE = [0, 0, 0, 0];

test.describe('a thin dark crop line at the canvas edge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof fixRun === 'function' && typeof fileWithPath === 'function');
  });

  test('THE DEFECT: a 6 px black run along the bottom edge at size 16 - the bottom cell row is the fill colour, 0 black cells', async ({ page }) => {
    const r = await fixOne(page, { b64: await draw(page, { run: 6 }), size: 16 });
    console.log('run6 @16: ' + JSON.stringify({ ...r, said: undefined }) + ' | ' + r.said);
    expect(r.cells).toBe('80x80');
    expect(r.span).toBe(60);
    expect(r.black, 'no black cell on the bottom row').toBe(0);
    expect(r.fill, 'every bottom-row cell of the square is the fill').toBe(60);
    expect(r.said, 'the run says what it did').toContain('read as a crop line and cleared before the run');
    expect(r.said).toContain('bottom edge (6 px, 960 columns)');
    expect(r.srcBottomBlack, 'the loaded source - the before-preview - is the file as it came in').toBe(true);
  });

  test('the control: a 24 px black band is thicker than the step and stays black', async ({ page }) => {
    const r = await fixOne(page, { b64: await draw(page, { run: 24 }), size: 16 });
    expect(r.black, 'the bottom row is black right across the square').toBe(60);
    expect(r.said).not.toContain('crop line');
  });

  test('the control: a 6 px black line in the MIDDLE of the picture is not touched by the pre-pass', async ({ page }) => {
    const b64 = await draw(page, { mid: true });
    const live = await fixOne(page, { b64, size: 16 });
    /* the same run with the pre-pass made a no-op: the picture the engine gets is then the file as it came in */
    await page.evaluate(() => { window.__realCrop = window.fixCropLine; window.fixCropLine = () => ({ pixels: 0, edges: [] }); });
    let off; try { off = await fixOne(page, { b64, size: 16 }); }
    finally { await page.evaluate(() => { window.fixCropLine = window.__realCrop; }); }
    expect(live.hash, 'the same cells with the pre-pass live and with it off').toBe(off.hash);
    expect(live.sha, 'and the same saved bytes').toBe(off.sha);
    expect(live.said).not.toContain('crop line');
    const d = await direct(page, square([[160, 800, 960, 6, BLACK]]), 16);
    expect(d.pixels, 'asked directly: nothing replaced').toBe(0);
    expect(d.changed).toBe(0);
  });

  test('the control: a shape ending at the canvas edge with no dark run - byte-identical output to today', async ({ page }) => {
    const b64 = await draw(page, {});
    const live = await fixOne(page, { b64, size: 16 });
    await page.evaluate(() => { window.__realCrop = window.fixCropLine; window.fixCropLine = () => ({ pixels: 0, edges: [] }); });
    let off; try { off = await fixOne(page, { b64, size: 16 }); }
    finally { await page.evaluate(() => { window.fixCropLine = window.__realCrop; }); }
    expect(live.sha, 'the bytes a save writes are the same with the pre-pass live and off').toBe(off.sha);
    expect(live.hash).toBe(off.hash);
    expect(live.fill, 'and the bottom row is the fill, as it always was').toBe(60);
    expect(live.said).not.toContain('crop line');
    const d = await direct(page, square(), 16);
    expect(d.pixels).toBe(0);
  });

  test('the control: at size 8 a 10 px run is thicker than the step and stays - at 16 the same run is cleared', async ({ page }) => {
    const b64 = await draw(page, { run: 10 });
    const at8 = await fixOne(page, { b64, size: 8 });
    console.log('run10 @8: ' + JSON.stringify({ ...at8, said: undefined }));
    expect(at8.cells).toBe('160x160');
    expect(at8.black, 'the bottom row of cells is black right across the square').toBe(120);
    expect(at8.said).not.toContain('crop line');
    /* THE POSITIVE CONTROL for the control: the same picture at 16 IS cleared, so what spared it at 8 was the step */
    const at16 = await fixOne(page, { b64, size: 16 });
    expect(at16.black).toBe(0);
    expect(at16.fill).toBe(60);
    expect(at16.said).toContain('crop line');
    const d8 = await direct(page, square([[160, 1270, 960, 10, BLACK]]), 8), d16 = await direct(page, square([[160, 1270, 960, 10, BLACK]]), 16);
    expect(d8.pixels).toBe(0);
    expect(d16.pixels).toBe(960 * 10);
  });

  test('ROUND 2: a FULL-BLEED picture (every pixel opaque) with a 10 px black run along its bottom is not a cut-out - the bottom cell row stays black, output byte-identical to today', async ({ page }) => {
    /* The owner's review (2026-10-02): Black and White Waves' stripe ends and White Couch Group's thin black frame are
       drawn, and round 1 rewrote them. A picture with no transparent pixel was never cut, so nothing at its edge is a
       crop line. Here the same square and the same 6 px run as test 1, on a canvas filled with BG first. */
    /* The run is 10 px, the one the engine votes black at 16 (test 5): a 6 px run is never voted black with or without
       the pre-pass (measured in review: fill 60 on both pages), so only a 10 px run can show the rule NOT firing. */
    const b64 = await draw(page, { full: true, run: 10 });
    const live = await fixOne(page, { b64, size: 16 });
    console.log('full-bleed run10 @16: ' + JSON.stringify({ ...live, said: undefined }) + ' | ' + live.said);
    expect(live.cells).toBe('80x80');
    expect(live.black, 'the bottom row of the square is black - the engine\'s own vote on the run, as in test 1 before the patch').toBe(60);
    expect(live.fill).toBe(0);
    expect(live.said).not.toContain('crop line');
    /* byte-identical to today: the same run with the pre-pass made a no-op gives the same cells and the same saved bytes */
    await page.evaluate(() => { window.__realCrop = window.fixCropLine; window.fixCropLine = () => ({ pixels: 0, edges: [] }); });
    let off; try { off = await fixOne(page, { b64, size: 16 }); }
    finally { await page.evaluate(() => { window.fixCropLine = window.__realCrop; }); }
    expect(live.sha, 'the bytes a save writes are today\'s').toBe(off.sha);
    expect(live.hash).toBe(off.hash);
    /* asked directly: no transparent pixel, nothing replaced, no edge named */
    const d = await direct(page, fullbleed([[160, 1274, 960, 6, BLACK]]), 16, [[640, 1279]]);
    expect(d).toMatchObject({ pixels: 0, changed: 0, holes: 0, edges: [] });
    expect(d.at).toEqual(['0,0,0,255']);
    /* a full-bleed picture whose run would qualify on every edge (a thin black frame, White Couch Group's shape) stays too */
    expect((await direct(page, { W: 1280, H: 1280, rects: [[0, 0, 1280, 1280, BG], [0, 0, 1280, 6, BLACK], [0, 1274, 1280, 6, BLACK], [0, 0, 6, 1280, BLACK], [1274, 0, 6, 1280, BLACK]] }, 16)).pixels).toBe(0);
  });

  test('ROUND 2: the same picture with ONE transparent pixel anywhere is a cut-out - the rule fires', async ({ page }) => {
    const b64 = await draw(page, { full: true, run: 10, hole: [20, 20] });
    const r = await fixOne(page, { b64, size: 16 });
    console.log('full-bleed+hole run10 @16: ' + JSON.stringify({ ...r, said: undefined }) + ' | ' + r.said);
    expect(r.black, 'no black cell on the bottom row').toBe(0);
    expect(r.fill, 'every bottom-row cell of the square is the fill').toBe(60);
    expect(r.said).toContain('bottom edge (10 px, 960 columns)');
    /* asked directly: one hole is enough, wherever it is */
    const d = await direct(page, fullbleed([[160, 1274, 960, 6, BLACK], [20, 20, 1, 1, HOLE]]), 16, [[640, 1279], [20, 20]]);
    expect(d).toMatchObject({ pixels: 960 * 6, changed: 960 * 6, holes: 1, edges: [{ edge: 'bottom', n: 960, thick: 6 }] });
    expect(d.at, 'the run is the fill now; the hole is still a hole').toEqual(['200,80,60,255', '0,0,0,0']);
    expect((await direct(page, fullbleed([[160, 1274, 960, 6, BLACK], [1279, 0, 1, 1, HOLE]]), 16)).pixels).toBe(960 * 6);
    expect((await direct(page, fullbleed([[160, 1274, 960, 6, BLACK], [0, 1279, 1, 1, HOLE]]), 16)).pixels).toBe(960 * 6);
    /* a partly transparent pixel (alpha 1) is not a hole */
    expect((await direct(page, fullbleed([[160, 1274, 960, 6, BLACK], [20, 20, 1, 1, [0, 0, 0, 1]]]), 16)).pixels).toBe(0);
  });

  test('THE RULE, ASKED DIRECTLY: what it replaces and what it keeps', async ({ page }) => {
    /* the 6 px run: every pixel of it becomes the fill above it */
    const run6 = await direct(page, square([[160, 1274, 960, 6, BLACK]]), 16, [[640, 1279], [640, 1273]]);
    expect(run6).toMatchObject({ pixels: 960 * 6, changed: 960 * 6, edges: [{ edge: 'bottom', n: 960, thick: 6 }] });
    expect(run6.at).toEqual(['200,80,60,255', '200,80,60,255']);
    /* exactly the step is not thinner than the step */
    expect((await direct(page, square([[160, 1264, 960, 16, BLACK]]), 16)).pixels).toBe(0);
    /* 15 px is */
    expect((await direct(page, square([[160, 1265, 960, 15, BLACK]]), 16)).pixels).toBe(960 * 15);
    /* a run with transparency inside it is a shape on the edge, not a crop line: the square reaches x 639 only,
       the run x 160..1119 - the left half is cleared, the right half (nothing above it) stays black */
    const half = await direct(page, { W: 1280, H: 1280, rects: [[160, 400, 480, 880, FILL], [160, 1274, 960, 6, BLACK]] }, 16, [[400, 1279], [900, 1279]]);
    expect(half.pixels).toBe(480 * 6);
    expect(half.at).toEqual(['200,80,60,255', '0,0,0,255']);
    /* a black frame round a transparent middle: nothing inside, nothing replaced */
    const frame = await direct(page, { W: 1280, H: 1280, rects: [[0, 0, 1280, 6, BLACK], [0, 1274, 1280, 6, BLACK], [0, 0, 6, 1280, BLACK], [1274, 0, 6, 1280, BLACK]] }, 16);
    expect(frame.pixels).toBe(0);
    /* more dark behind the run (a 20 px black band, i.e. run 20 at step 16) stays */
    expect((await direct(page, square([[160, 1260, 960, 20, BLACK]]), 16)).pixels).toBe(0);
    /* the left and right edges, row by row: a 4 px run down the left of a square that touches the left edge */
    const left = await direct(page, { W: 1280, H: 1280, rects: [[0, 300, 600, 600, FILL], [0, 300, 4, 600, BLACK]] }, 16, [[0, 500]]);
    expect(left).toMatchObject({ pixels: 600 * 4, edges: [{ edge: 'left', n: 600, thick: 4 }] });
    expect(left.at).toEqual(['200,80,60,255']);
    /* the top edge too */
    expect((await direct(page, { W: 1280, H: 1280, rects: [[300, 0, 600, 600, FILL], [300, 0, 600, 3, BLACK]] }, 16)).edges).toEqual([{ edge: 'top', n: 600, thick: 3 }]);
    /* a run thinner than the step whose inside pixel is dark but not black-run dark (r g b all < 40 is the run;
       40,40,40 is not): the inside pixel decides, and it is art */
    expect((await direct(page, square([[160, 1274, 960, 6, BLACK], [160, 1268, 960, 6, [40, 40, 40]]]), 16)).pixels).toBe(960 * 6);
    /* a near-black run (39,39,39) is a run */
    expect((await direct(page, square([[160, 1274, 960, 6, [39, 39, 39]]]), 16)).pixels).toBe(960 * 6);
  });

  test('A LINE RUNS ALONG THE EDGE: a speck of 50 columns stays, 51 columns are a line', async ({ page }) => {
    /* Measured over the 311 library files: with no length test, 23 outputs at 16 and 10 at 8 changed on edges where
       at most 50 columns qualified (dark pixel blocks at the edge of a background, stretches of 1 to 20 columns), none
       a file edges.cjs reports a crop line on. The threshold is edges.cjs's own count, so the rule's population is the
       measured one; the narrowest clothing line measured spans 147 columns.
       Fix round (measure628/fixround/colcount.cjs, the page's fixCropLine carved with the length test off, all 311 library
       sources, each edge counted on the untouched picture): at step 16 the kept edges have at most 50 qualifying columns
       (Omegle's bottom is exactly 50) and the cleared ones at least 54 (Golf Game's right); clothing lines start at 147. So
       for clothing any cut from 51 to 146 is the same rule; for backgrounds the counts run through the cut without a gap
       and 50 is edges.cjs's cut - the brief's acceptance instrument - which the owner may move. This test pins the value
       as written (50 stays, 51 clears) so a move is a deliberate edit here too. */
    expect((await direct(page, square([[400, 1274, 50, 6, BLACK]]), 16)).pixels).toBe(0);
    const line = await direct(page, square([[400, 1274, 51, 6, BLACK]]), 16);
    expect(line).toMatchObject({ pixels: 51 * 6, edges: [{ edge: 'bottom', n: 51, thick: 6 }] });
    /* the count is per edge, and counts qualifying columns wherever they are along it: 30 here and 30 there is 60 */
    expect((await direct(page, square([[200, 1274, 30, 6, BLACK], [900, 1274, 30, 6, BLACK]]), 16)).pixels).toBe(60 * 6);
    /* columns that do not qualify (a 20 px black band under part of the square) do not count, and are not touched */
    const mixed = await direct(page, square([[160, 1274, 960, 6, BLACK], [600, 1260, 100, 20, BLACK]]), 16, [[650, 1279], [300, 1279]]);
    expect(mixed).toMatchObject({ pixels: (960 - 100) * 6, edges: [{ edge: 'bottom', n: 860, thick: 6 }] });
    expect(mixed.at).toEqual(['0,0,0,255', '200,80,60,255']);
    expect(await page.evaluate(() => FIX_CROP_MIN_COLS)).toBe(50);
    /* through the fixer: the picture with the speck comes out as it does with the pre-pass made a no-op */
    const b64 = await draw(page, { speck: true });
    const live = await fixOne(page, { b64, size: 16 });
    await page.evaluate(() => { window.__realCrop = window.fixCropLine; window.fixCropLine = () => ({ pixels: 0, edges: [] }); });
    let off; try { off = await fixOne(page, { b64, size: 16 }); }
    finally { await page.evaluate(() => { window.fixCropLine = window.__realCrop; }); }
    expect(live.sha, 'the speck is left to the engine').toBe(off.sha);
    expect(live.said).not.toContain('crop line');
    expect((await direct(page, square([[640, 1274, 48, 6, BLACK]]), 16)).pixels).toBe(0);
  });

  test('with the size box at 0 the engine chooses the step, so 16 is the ceiling: 15 px is cleared, 16 px stays', async ({ page }) => {
    expect((await direct(page, square([[160, 1265, 960, 15, BLACK]]), 0)).pixels).toBe(960 * 15);
    expect((await direct(page, square([[160, 1264, 960, 16, BLACK]]), 0)).pixels).toBe(0);
    const ceiling = await page.evaluate(() => FIX_CROP_AUTO_STEP);
    expect(ceiling).toBe(16);
  });

  test('A FOLDER RUN GIVES THE SAME PICTURE AS THE SINGLE RUN, and its note counts the crop line', async ({ page }) => {
    const b64 = await draw(page, { run: 6 });
    const one = await fixOne(page, { b64, size: 16 });
    const r = await page.evaluate(async ({ b64 }) => {
      const sig = async (u8) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).slice(0, 12).join('.');
      const file = fileWithPath(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), 'clothing/wip/probe.png');
      await fixBatch([file]);
      const f = fixBatchFiles[0];
      return { folder: f ? await sig(f.data) : null, note: document.getElementById('fixbatchout').textContent };
    }, { b64 });
    console.log('folder: ' + JSON.stringify(r));
    expect(r.folder, 'the bytes the folder run writes are the single run\'s').toBe(one.sha);
    expect(r.note).toContain('1 had a thin dark crop line at a canvas edge, cleared before the run (5,760 pixels)');
  });

  test('the control: a folder run of a picture with no crop line says nothing of one', async ({ page }) => {
    const b64 = await draw(page, {});
    const r = await page.evaluate(async ({ b64 }) => {
      try { authed = true; } catch (_) {}
      gateShow(false); showPage('fixer', false);
      const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
        if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
      set('fixforce', '16'); set('fixgrid', true); set('fixpal', false); set('fixline', true);
      await fixBatch([fileWithPath(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), 'clothing/wip/probe.png')]);
      return { n: fixBatchFiles.length, note: document.getElementById('fixbatchout').textContent };
    }, { b64 });
    expect(r.n).toBe(1);
    expect(r.note).not.toContain('crop line');
  });
});
