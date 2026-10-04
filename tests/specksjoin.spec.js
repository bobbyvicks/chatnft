/* STRAY SPECKS JOIN THEIR AREA, WHERE THE DRAWING AGREES (patch627).

   The owner, asked about Colours to palette on the backgrounds: "flat patches but try ur best w all our
   colours" - fewer stray specks and fewer hard steps the drawing did not have. snapToPalette maps COLOURS: two
   colours an artist drew 2.7 dE apart in one flat area can sit either side of a split between palette colours
   and come out 14 dE apart, so a cell of the second colour comes out as a speck the drawing never had. The
   pass (p627 rounds 2 and 3) gives such a cell the colour its area came out as, unless the cells or the
   picture say the cell is drawn apart from that area.

   The colours below are fixed, and every property a test relies on is first checked in the page, by the
   page's own palettePick and CIEDE2000 - a palette change fails a precondition loudly instead of passing
   quietly. Fixtures are made in the page; no collection art is in the repo. Each claim has a control one
   thing away, so a pass that moved every speck, or none, cannot pass. RUN AGAINST THE PAGE BEFORE patch627
   (fe59939) every test here is red.

   The last four came from review of patch627's first version (bb68e68). Three are red on it: the picture's box
   for a cell was one pixel off the engine's cell wherever the picture is not a whole number of cells across, and
   a picture that IS the cells' own buffer (a folder run in Scale only hands one over) was read after the palette
   had written into it. The fourth, the faint pixel's weight, pins a rule bb68e68 already had and no test held. */
import { test, expect } from '@playwright/test';

/* The flat area and the speck the palette makes in it. */
const AREA = '#44505c';      /* comes out AREA_OUT */
const SPECK = '#44535c';     /* 2.7 dE from AREA - one flat area to the eye - but comes out SPECK_OUT */
const AREA_OUT = '#2c3a44';
const SPECK_OUT = '#5b5b5c'; /* 13.9 dE from AREA_OUT: a speck the drawing did not have */
const SHADE = '#47565c';     /* 4.5 dE from AREA: drawn apart from it (more than 3), and also comes out SPECK_OUT */
const GLINT = '#1c2a3e';     /* 13 dE from AREA: a glint the drawing has, lone in the input */
const EDGE = '#20465a';      /* comes out AREA_OUT too, but is drawn 7.9 dE from SPECK: an edge the cells draw */
const SUITS = '#4d565c';     /* a source colour 3.8 dE from AREA that SPECK_OUT suits far better than AREA_OUT */
const BG = '#ffffff';        /* a palette colour exactly, far from all of the above */
/* A second area, where the palette's colour for the area leaves the speck's colour family. */
const FAM_AREA = '#062410';  /* dark green; comes out FAM_AREA_OUT, a dark teal */
const FAM_SPECK = '#02280e'; /* 2.7 dE from FAM_AREA, a green that comes out green: FAM_OWN */
const FAM_AREA_OUT = '#264943';
const FAM_OWN = '#1a4c07';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function' && typeof palettePick === 'function' && typeof fixRun === 'function');
};

/* In the page: snap a grid of cells (rows of hex), optionally with a picture under it - k px per cell, or `size`
   px square. Each picture pixel belongs to the cell the ENGINE puts it in, floor(x*cols/W) (two_stage_pack), worked
   out here and not by the code under test; box(cx, cy, ox, oy, x, y) may override one pixel (ox, oy: its place in
   that cell; x, y: in the picture) with a hex, or with {h, a} for a pixel of alpha a. Returns the cells after and
   the report. */
const HELP = `
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const pal = paletteRGB(), palLab = pal.map(p => labOf(p.r, p.g, p.b));
  const lab = h => labOf(...hx(h));
  const de = (a, b) => { const A = lab(a), B = lab(b); return deltaE2000(A[0], A[1], A[2], B[0], B[1], B[2]); };
  const deL = (A, b) => { const B = lab(b); return deltaE2000(A[0], A[1], A[2], B[0], B[1], B[2]); };
  const out = h => palettePick(lab(h), pal, palLab).best.h;
  const hue = h => { const L = lab(h), o = labToOklab(L[0], L[1], L[2]); return Math.atan2(o[2], o[1]) * 180 / Math.PI; };
  const hueGap = (a, b) => { let x = Math.abs(hue(a) - hue(b)); return x > 180 ? 360 - x : x; };
  const onPal = h => pal.some(p => p.h === h);
  const snap = (grid, srcSpec, opts) => {
    const H = grid.length, W = grid[0].length, d = new Uint8ClampedArray(W * H * 4);
    grid.forEach((row, y) => row.forEach((h, x) => d.set([...hx(h), 255], (y * W + x) * 4)));
    let o = opts ? Object.assign({}, opts) : undefined;
    if (srcSpec) {
      const SW = srcSpec.size || W * srcSpec.k, SH = srcSpec.size || H * srcSpec.k, s = new Uint8ClampedArray(SW * SH * 4);
      const x0 = [], y0 = [];
      for (let x = 0; x < SW; x++) { const cx = Math.floor(x * W / SW); if (x0[cx] === undefined) x0[cx] = x; }
      for (let y = 0; y < SH; y++) { const cy = Math.floor(y * H / SH); if (y0[cy] === undefined) y0[cy] = y; }
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const cx = Math.floor(x * W / SW), cy = Math.floor(y * H / SH);
        const v = (srcSpec.box && srcSpec.box(cx, cy, x - x0[cx], y - y0[cy], x, y)) || grid[cy][cx];
        const [h, a] = typeof v === 'string' ? [v, 255] : [v.h, v.a];
        s.set([...hx(h), a], (y * SW + x) * 4);
      }
      o = Object.assign(o || {}, { src: { data: s, width: SW, height: SH } });
    }
    const r = snapToPalette(d, W * H, W, o);
    const cells = grid.map((row, y) => row.map((_, x) => { const i = (y * W + x) * 4; return hex(d[i], d[i + 1], d[i + 2]); }));
    return { r, cells };
  };
  const N = 7, C = 3;
  const flat = mid => Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (x === C && y === C) ? mid : AREA));
  return { hx, hex, lab, de, deL, out, onPal, snap, flat, N, C, hueGap };
`;
const COLOURS = { AREA, SPECK, AREA_OUT, SPECK_OUT, SHADE, GLINT, EDGE, SUITS, BG, FAM_AREA, FAM_SPECK, FAM_AREA_OUT, FAM_OWN };
/* The colours reach the page's code as local names, never as window properties: a page global of the same
   name would win over a window property. */
const inPage = (page, body, arg) => page.evaluate(({ HELP, COLOURS, body, arg }) => {
  const names = 'const { ' + Object.keys(COLOURS).join(', ') + ' } = COLOURS_;\n';
  // eslint-disable-next-line no-new-func
  const H = new Function('COLOURS_', names + HELP)(COLOURS);
  // eslint-disable-next-line no-new-func
  return new Function('H', 'arg', 'COLOURS_', names + body)(H, arg, COLOURS);
}, { HELP, COLOURS, body, arg });

/* 1280 pictures drawn in 8px blocks, an AREA with SPECK blocks at fixed cells. line: a 2px black column down
   the left of each speck block - a quarter of the block, so the engine's cell is still SPECK, while the
   picture under it plainly is not. */
const BLOCKS = `
  const S = 1280, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = arg.area; g.fillRect(0, 0, S, S);
  for (const [cx, cy] of arg.at) {
    g.fillStyle = arg.speck; g.fillRect(cx * 8, cy * 8, 8, 8);
    if (arg.line) { g.fillStyle = '#000000'; g.fillRect(cx * 8, cy * 8, 2, 8); }
  }
  return c;
`;
const SPECKS3 = [[40, 40], [100, 60], [20, 130]];
const pictureBytes = (page, arg) => page.evaluate(async ({ BLOCKS, arg }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function('arg', BLOCKS)(arg);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}, { BLOCKS, arg });

/* The fixer tab set for these runs: Fast, size 8, Colours to palette on, Save at 1280 on, the outline switch
   off (it runs after the palette and is not what is measured here). */
const SETTINGS = `
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = true;
  document.getElementById('fixline').checked = false;
  document.getElementById('fixgrid').checked = true;
  document.getElementById('fixsnap').checked = true;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
  f.dispatchEvent(new Event('input', { bubbles: true }));
`;
/* One picture through the single run. how: 'worker' (the page as it is), 'main' (the worker is sent no palette,
   so fixPalApply's main-thread step does it, with the picture fixRun hands it), 'withheld' (the same, with
   fixPalApply's picture taken away - the control). */
const single = (page, bytes, how) => page.evaluate(async ({ SETTINGS, bytes, how }) => {
  // eslint-disable-next-line no-new-func
  new Function(SETTINGS)();
  const realToast = window.toast; window.toast = () => {};
  const realWorker = window.fixWorker, realApply = window.fixPalApply;
  if (how !== 'worker') window.fixWorker = function () {
    const w = realWorker.apply(this, arguments), post = w.postMessage.bind(w);
    w.postMessage = (m, t) => post(Object.assign({}, m, { palette: null }), t);
    return w;
  };
  if (how === 'withheld') window.fixPalApply = function (out, rel) { return realApply.call(this, out, rel); };
  try {
    await fixLoad(new File([new Uint8Array(bytes)], 'blocks.png', { type: 'image/png' }));
    const r = await fixRun();
    return { cells: Array.from(r.data), width: r.width, said: document.getElementById('fixout').textContent };
  } finally { window.fixWorker = realWorker; window.fixPalApply = realApply; window.toast = realToast; }
}, { SETTINGS, bytes, how });
const folder = (page, list, how) => page.evaluate(async ({ SETTINGS, list, how }) => {
  // eslint-disable-next-line no-new-func
  new Function(SETTINGS)();
  const realToast = window.toast; window.toast = () => {};
  const realWorker = window.fixWorker, realApply = window.fixPalApply;
  if (how !== 'worker') window.fixWorker = function () {
    const w = realWorker.apply(this, arguments), post = w.postMessage.bind(w);
    w.postMessage = (m, t) => post(Object.assign({}, m, { palette: null }), t);
    return w;
  };
  if (how === 'withheld') window.fixPalApply = function (out, rel) { return realApply.call(this, out, rel); };
  try {
    await fixBatch(list.map(([rel, bytes]) => fileWithPath(new Uint8Array(bytes), rel)));
    const said = document.getElementById('fixbatchout').textContent;
    const m = said.match(/\d+ put on the palette[^\u00b7]*/);
    return { said, palette: m ? m[0] : null };
  } finally { window.fixWorker = realWorker; window.fixPalApply = realApply; window.toast = realToast; }
}, { SETTINGS, list, how });

/* A SIZE x SIZE picture of one colour with one pixel of another at (at, at): a finished piece, one pixel a cell. */
const onePixelPicture = (page, arg) => page.evaluate(async (arg) => {
  const c = document.createElement('canvas'); c.width = arg.size; c.height = arg.size;
  const g = c.getContext('2d'); g.fillStyle = arg.area; g.fillRect(0, 0, arg.size, arg.size);
  g.fillStyle = arg.pixel; g.fillRect(arg.at, arg.at, 1, 1);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}, arg);
/* A folder run in Scale only, with Colours to palette ticked. fixPalApply is watched, not changed: each call is
   passed on with the arguments it was given, and what it was handed and what it left are recorded - whether the
   picture it was handed IS its output buffer, the pixel at (at, at) after it, and the whole output beside the
   editor's arithmetic on the same input (snapToPalette on a copy, handed a second copy as the picture). */
const scaleFolder = (page, list, at) => page.evaluate(async ({ list, at }) => {
  const mode = document.getElementById('fixmode');
  mode.value = 'scale'; mode.dispatchEvent(new Event('change', { bubbles: true }));
  const pal = document.getElementById('fixpal'); pal.checked = true;
  const hexAt = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
  const realToast = window.toast; window.toast = () => {};
  const realApply = window.fixPalApply, seen = [];
  window.fixPalApply = function (out, rel, img) {
    const aliased = !!(img && img.data === out.data);
    const input = new Uint8ClampedArray(out.data);
    const r = realApply.call(this, out, rel, img);
    const ed = new Uint8ClampedArray(input);
    snapToPalette(ed, out.width * out.height, out.width, { src: { data: new Uint8ClampedArray(input), width: out.width, height: out.height } });
    seen.push({ aliased, width: out.width, specks: r ? r.specks : null, at: hexAt(out.data, (at * out.width + at) * 4),
      sameAsEditor: out.data.length === ed.length && out.data.every((v, i) => v === ed[i]) });
    return r;
  };
  try {
    await fixBatch(list.map(([rel, bytes]) => fileWithPath(new Uint8Array(bytes), rel)));
  } finally { window.fixPalApply = realApply; window.toast = realToast; }
  const said = document.getElementById('fixbatchout').textContent;
  const m = said.match(/\d+ put on the palette[^\u00b7]*/);
  return { mode: fixMode(), palChecked: pal.checked, said, palette: m ? m[0] : null, seen };
}, { list, at });

/* THE FIXTURE COLOURS ARE WHAT THE TESTS SAY THEY ARE, by the page's own arithmetic. Checked before every
   test: a precondition, not a test of patch627 (it holds on the page before it too). */
const fixtureHolds = async (page) => {
    const f = await inPage(page, `
      const lineMean = H.hx(SPECK).map(v => v * 0.75);   /* a quarter of the box black */
      const LM = labOf(lineMean[0], lineMean[1], lineMean[2]);
      return {
        areaOut: H.out(AREA), speckOut: H.out(SPECK), shadeOut: H.out(SHADE), glintOut: H.out(GLINT), edgeOut: H.out(EDGE),
        areaSpeck: H.de(AREA, SPECK), outs: H.de(AREA_OUT, SPECK_OUT), areaShade: H.de(AREA, SHADE), areaGlint: H.de(AREA, GLINT),
        speckEdge: H.de(SPECK, EDGE), areaEdge: H.de(AREA, EDGE), bgOnPal: H.onPal(BG), bgSpeckOut: H.de(BG, SPECK_OUT),
        suitsArea: H.de(SUITS, AREA), suitsToArea: H.de(SUITS, AREA_OUT), suitsToSpeck: H.de(SUITS, SPECK_OUT),
        lineArea: H.deL(LM, AREA), lineToArea: H.deL(LM, AREA_OUT), lineToSpeck: H.deL(LM, SPECK_OUT),
        onPal: [AREA, SPECK, SHADE, GLINT, EDGE, FAM_AREA, FAM_SPECK].some(H.onPal),
        famAreaOut: H.out(FAM_AREA), famOwn: H.out(FAM_SPECK), famDe: H.de(FAM_AREA, FAM_SPECK), famOuts: H.de(FAM_AREA_OUT, FAM_OWN),
        famGapArea: H.hueGap(FAM_SPECK, FAM_AREA_OUT), famGapOwn: H.hueGap(FAM_SPECK, FAM_OWN),
      };`);
    expect(f.areaOut).toBe(AREA_OUT);
    expect(f.speckOut).toBe(SPECK_OUT);
    expect(f.onPal, 'none of the drawn colours is a palette colour').toBe(false);
    expect(f.areaSpeck, 'SPECK is more than the grouping distance (2.3) from AREA').toBeGreaterThan(2.3);
    expect(f.areaSpeck, 'and within 3 dE of it: one area to the eye').toBeLessThanOrEqual(3);
    expect(f.outs, 'but the palette puts them 10 or more apart').toBeGreaterThanOrEqual(10);
    expect(f.shadeOut).toBe(SPECK_OUT);
    expect(f.areaShade).toBeGreaterThan(3);
    expect(f.areaShade).toBeLessThan(5);
    expect(f.areaGlint, 'the glint is lone in the input').toBeGreaterThanOrEqual(10);
    expect(f.glintOut).not.toBe(AREA_OUT);
    expect(f.edgeOut).toBe(AREA_OUT);
    expect(f.speckEdge).toBeGreaterThanOrEqual(5);
    expect(f.areaEdge, 'EDGE is its own group').toBeGreaterThan(2.3);
    expect(f.bgOnPal).toBe(true);
    expect(f.bgSpeckOut).toBeGreaterThanOrEqual(10);
    expect(f.suitsArea, 'SUITS is not across an edge from AREA').toBeLessThan(5);
    expect(f.suitsToArea, 'but AREA_OUT is more than 3 further from it than SPECK_OUT').toBeGreaterThan(f.suitsToSpeck + 3);
    expect(f.lineArea, 'the speck box with its line is across an edge from AREA').toBeGreaterThanOrEqual(5);
    expect(f.lineToArea, 'and AREA_OUT still suits it').toBeLessThanOrEqual(f.lineToSpeck + 3);
    expect(f.famAreaOut).toBe(FAM_AREA_OUT);
    expect(f.famOwn).toBe(FAM_OWN);
    expect(f.famDe, 'FAM_SPECK is its own group, within 3 dE of FAM_AREA').toBeGreaterThan(2.3);
    expect(f.famDe).toBeLessThanOrEqual(3);
    expect(f.famOuts, 'a speck: the two come out 10 or more apart').toBeGreaterThanOrEqual(10);
    expect(f.famGapArea, "the area's colour is far round the hue circle from the speck's drawn green (Oklab)").toBeGreaterThanOrEqual(25);
    expect(f.famGapOwn, 'its own colour is within 12 degrees of it (10.7 on this palette)').toBeLessThanOrEqual(12);
};

test.describe('stray specks join their area', () => {
  test.beforeEach(async ({ page }) => { await ready(page); await fixtureHolds(page); });

  test('A STRAY SPECK THE PALETTE MADE IN A FLAT AREA JOINS IT, and it takes two neighbours drawn like it', async ({ page }) => {
    const r = await inPage(page, `
      const flat = H.snap(H.flat(SPECK));
      const others = flat.cells.flat().filter((h, i) => i !== H.C * H.N + H.C);
      /* a one-cell line of AREA on BG, the speck in its middle (two neighbours drawn like it) or at its end (one) */
      const line = pos => Array.from({ length: H.N }, (_, y) => Array.from({ length: H.N }, (_, x) =>
        y !== H.C ? BG : (x === pos ? SPECK : (x <= H.N - 2 ? AREA : BG))));
      const mid = H.snap(line(2)), end = H.snap(line(H.N - 2));
      return { flatMid: flat.cells[H.C][H.C], flatSpecks: flat.r.specks, others: [...new Set(others)],
        lineMid: mid.cells[H.C][2], lineMidSpecks: mid.r.specks, lineEnd: end.cells[H.C][H.N - 2], lineEndSpecks: end.r.specks };`);
    expect(r.flatMid, 'the speck takes the colour its area came out as').toBe(AREA_OUT);
    expect(r.flatSpecks).toBe(1);
    expect(r.others, 'and nothing else moves').toEqual([AREA_OUT]);
    expect(r.lineMid, 'in a one-cell line, between two cells drawn like it, it joins the line').toBe(AREA_OUT);
    expect(r.lineMidSpecks).toBe(1);
    /* CONTROL, ONE THING AWAY: the same speck at the line's end has one such neighbour - not an area. */
    expect(r.lineEnd).toBe(SPECK_OUT);
    expect(r.lineEndSpecks).toBe(0);
  });

  test('A GLINT THE DRAWING HAS IS KEPT, and so is a cell drawn plainly apart from its area, or one its area\'s colour would take out of its family', async ({ page }) => {
    const r = await inPage(page, `
      const at = mid => { const s = H.snap(H.flat(mid)); return { mid: s.cells[H.C][H.C], specks: s.r.specks }; };
      const fam = H.snap(Array.from({ length: H.N }, (_, y) => Array.from({ length: H.N }, (_, x) => (x === H.C && y === H.C) ? FAM_SPECK : FAM_AREA)));
      return { glint: at(GLINT), glintAlone: H.out(GLINT), shade: at(SHADE), speck: at(SPECK), fam: { mid: fam.cells[H.C][H.C], specks: fam.r.specks } };`);
    expect(r.glint.mid, 'a glint lone in the input stays the colour it was given').toBe(r.glintAlone);
    expect(r.glint.specks).toBe(0);
    expect(r.shade.mid, 'a cell drawn 4.5 dE from its area is drawn apart from it').toBe(SPECK_OUT);
    expect(r.shade.specks).toBe(0);
    /* The owner, 2026-10-02: grass stays green. A green speck drawn 2.7 dE from a dark green area that the palette
       paints dark teal keeps its green rather than join the teal. (No picture one thing away joins here: no colour
       within 3 dE of this speck comes out in its family on this palette. The family rule's own control is the
       mutation run in the commit: with it switched off, this speck joins the teal.) */
    expect(r.fam).toEqual({ mid: FAM_OWN, specks: 0 });
    /* CONTROL, ONE THING AWAY: the same cell drawn 2.7 dE from its area, coming out the same colour, joins. */
    expect(r.speck.mid).toBe(AREA_OUT);
    expect(r.speck.specks).toBe(1);
  });

  test('A JOIN THAT WOULD LEAVE A NEIGHBOUR AS A NEW SPECK IS TAKEN BACK', async ({ page }) => {
    const r = await inPage(page, `
      const pair = beside => { const g = H.flat(SPECK); g[H.C][H.C + 1] = beside; const s = H.snap(g);
        return { speck: s.cells[H.C][H.C], beside: s.cells[H.C][H.C + 1], specks: s.r.specks }; };
      return { mark: pair(SHADE), plain: pair(AREA) };`);
    /* A two-cell mark: SPECK beside SHADE, which is drawn 4.5 dE from the area and comes out the speck's colour.
       Moving SPECK would leave SHADE a lone speck it was not, so the move is taken back and the mark stays whole. */
    expect(r.mark).toEqual({ speck: SPECK_OUT, beside: SPECK_OUT, specks: 0 });
    /* CONTROL, ONE THING AWAY: beside a cell drawn in the area's own colour, the speck joins. */
    expect(r.plain).toEqual({ speck: AREA_OUT, beside: AREA_OUT, specks: 1 });
  });

  test('A MOVE ACROSS AN EDGE THE DRAWING HAS IS REFUSED, where the cells draw it and where only the picture does', async ({ page }) => {
    const r = await inPage(page, `
      const mid = s => ({ mid: s.cells[H.C][H.C], specks: s.r.specks });
      const line = (cx, cy, x) => (cx === H.C && cy === H.C && x === 0) ? '#000000' : null;
      const edged = H.flat(SPECK); edged[H.C][H.C + 1] = EDGE;
      return {
        agrees: mid(H.snap(H.flat(SPECK), { k: 4 })),
        lineInPicture: mid(H.snap(H.flat(SPECK), { k: 4, box: line })),
        noPicture: mid(H.snap(H.flat(SPECK))),
        edgeInCells: mid(H.snap(edged)),
      };`);
    /* CONTROL: the picture under the cells agrees with them, and the speck joins. */
    expect(r.agrees).toEqual({ mid: AREA_OUT, specks: 1 });
    /* A thin dark line down a quarter of the speck's box: the engine's cell lost it, the picture did not. */
    expect(r.lineInPicture).toEqual({ mid: SPECK_OUT, specks: 0 });
    /* CONTROL, ONE THING AWAY: the same cells with no picture handed over - the cells alone cannot see the line. */
    expect(r.noPicture).toEqual({ mid: AREA_OUT, specks: 1 });
    /* An edge the cells themselves draw: a neighbour that came out AREA_OUT is drawn 7.9 dE from the speck. */
    expect(r.edgeInCells).toEqual({ mid: SPECK_OUT, specks: 0 });
  });

  test('A MOVE THAT TAKES THE CELL MORE THAN 3 dE FURTHER FROM ITS COLOUR IN THE PICTURE IS REFUSED', async ({ page }) => {
    const r = await inPage(page, `
      const mid = s => ({ mid: s.cells[H.C][H.C], specks: s.r.specks });
      const box = c => (cx, cy) => (cx === H.C && cy === H.C) ? c : null;
      return { suits: mid(H.snap(H.flat(SPECK), { k: 4, box: box(SUITS) })), drawn: mid(H.snap(H.flat(SPECK), { k: 4, box: box(SPECK) })) };`);
    /* The picture under the speck is SUITS: no edge from its area (3.8 dE), but its own colour is plainly nearer
       the colour the speck has than the one it would join. */
    expect(r.suits).toEqual({ mid: SPECK_OUT, specks: 0 });
    /* CONTROL, ONE THING AWAY: the picture under it is the speck's own drawn colour. */
    expect(r.drawn).toEqual({ mid: AREA_OUT, specks: 1 });
  });

  test('THE WORKER AND THE MAIN-THREAD STEP GIVE THE SAME CELLS WHEN EACH IS HANDED THE PICTURE', async ({ page }) => {
    test.setTimeout(240000);
    const lined = await pictureBytes(page, { area: AREA, speck: SPECK, at: SPECKS3, line: true });
    const plain = await pictureBytes(page, { area: AREA, speck: SPECK, at: SPECKS3, line: false });
    const lw = await single(page, lined, 'worker');
    const lm = await single(page, lined, 'main');
    const lx = await single(page, lined, 'withheld');
    const pw = await single(page, plain, 'worker');
    const pm = await single(page, plain, 'main');
    expect(lw.width).toBe(160);
    /* In the worker the picture refuses all three (the lines), and with no lines all three join: the picture
       is in play on this fixture. */
    expect(lw.said).toContain('moved to the palette');
    expect(lw.said).not.toContain('stray speck');
    expect(pw.said).toContain(', 3 stray specks joined their area');
    /* THE CLAIM: the main-thread step, handed the picture fixRun gives the outline pass, makes the same cells. */
    expect(lm.cells.length).toBe(lw.cells.length);
    expect(lm.cells.findIndex((v, i) => v !== lw.cells[i]), 'main-thread cells equal the worker\'s, lined').toBe(-1);
    expect(lm.said).not.toContain('stray speck');
    expect(pm.cells.findIndex((v, i) => v !== pw.cells[i]), 'and plain').toBe(-1);
    expect(pm.said).toContain(', 3 stray specks joined their area');
    /* CONTROL, ONE THING AWAY: the same main-thread step without the picture joins the three, so the
       comparison above can fail. */
    expect(lx.said).toContain(', 3 stray specks joined their area');
    expect(lx.cells.filter((v, i) => v !== lw.cells[i]).length, 'three cells, four bytes each, three of them colour').toBeGreaterThan(0);
    /* AND THE FOLDER: fixBatchRun hands its picture to the main-thread step too. */
    const fw = await folder(page, [['backgrounds/lined.png', lined]], 'worker');
    const fm = await folder(page, [['backgrounds/lined.png', lined]], 'main');
    const fx = await folder(page, [['backgrounds/lined.png', lined]], 'withheld');
    expect(fw.palette, 'the folder put it on the palette: ' + fw.said).not.toBeNull();
    expect(fm.palette).toBe(fw.palette);
    expect(fw.palette).not.toContain('stray speck');
    expect(fx.palette).toContain(', 3 stray specks joined their area');
  });

  test('THE EDITOR\'S COLOURS TO PALETTE HANDS THE PASS ITS PICTURE AS IT WAS, and a stray speck there joins its area', async ({ page }) => {
    const r = await page.evaluate(async ({ AREA, SPECK }) => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      const S = 16, C = 8, d = new Uint8ClampedArray(S * S * 4);
      for (let i = 0; i < S * S; i++) d.set([...hx(i === C * S + C ? SPECK : AREA), 255], i * 4);
      const open = async () => { fileName = 'speck.png'; startEditor(new Uint8ClampedArray(d), S, S, S, S, palette(d, S * S, 24, 64), false); await new Promise(r2 => setTimeout(r2, 250)); };
      const hexAt = (x, y) => { const p = ctx.getImageData(x, y, 1, 1).data; return '#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join(''); };
      const real = window.snapToPalette, realToast = window.toast;
      window.toast = () => {};
      const press = async (edit) => {
        await open();
        const before = ctx.getImageData(0, 0, S, S).data.slice();
        let seen = null;
        window.snapToPalette = function (dd, n, w, opts) {
          seen = { opts: !!opts, src: !!(opts && opts.src), same: !!(opts && opts.src && opts.src.data === dd),
            w: opts && opts.src ? opts.src.width : 0, h: opts && opts.src ? opts.src.height : 0,
            equal: !!(opts && opts.src && opts.src.data.length === before.length && opts.src.data.every((v, i) => v === before[i])) };
          let o = opts;
          if (edit && opts && opts.src) { const s = new Uint8ClampedArray(opts.src.data); edit(s); o = Object.assign({}, opts, { src: { data: s, width: opts.src.width, height: opts.src.height } }); }
          return real.call(this, dd, n, w, o);
        };
        try { document.getElementById('palsnap').click(); } finally { window.snapToPalette = real; }
        const after = ctx.getImageData(0, 0, S, S).data.slice();
        /* the same step with NO picture, on a copy of what the button started from */
        const bare = new Uint8ClampedArray(before); real(bare, S * S, S);
        return { seen, speck: hexAt(C, C), area: hexAt(0, 0), sameAsBare: after.every((v, i) => v === bare[i]) };
      };
      try {
        const asIs = await press(null);
        /* the picture handed over says the speck's pixel is drawn black - an edge the drawing has */
        const edged = await press(s => { s.set([0, 0, 0, 255], (C * S + C) * 4); });
        return { asIs, edged };
      } finally { window.toast = realToast; }
    }, { AREA, SPECK });
    expect(r.asIs.speck, 'the speck joins its area on the canvas').toBe(AREA_OUT);
    expect(r.asIs.area).toBe(AREA_OUT);
    expect(r.asIs.seen.src, 'the button hands the step a picture').toBe(true);
    expect(r.asIs.seen.equal, 'the canvas as it was before the click').toBe(true);
    expect(r.asIs.seen.same, 'as a copy, not the pixels the step writes into').toBe(false);
    expect([r.asIs.seen.w, r.asIs.seen.h]).toEqual([16, 16]);
    /* Here every cell is one pixel of that picture, so the picture refuses nothing the cells did not: the
       button's pixels are the step's pixels with no picture at all. */
    expect(r.asIs.sameAsBare).toBe(true);
    /* CONTROL, ONE THING AWAY: when the picture the button hands over draws the speck's pixel black, the
       button's step refuses the move - the picture is read on this path. */
    expect(r.edged.speck).toBe(SPECK_OUT);
  });

  test('A RUN SAYS HOW MANY STRAY SPECKS JOINED THEIR AREA, and says nothing about them when none did', async ({ page }) => {
    test.setTimeout(180000);
    const three = await single(page, await pictureBytes(page, { area: AREA, speck: SPECK, at: SPECKS3 }), 'worker');
    const one = await single(page, await pictureBytes(page, { area: AREA, speck: SPECK, at: SPECKS3.slice(0, 1) }), 'worker');
    const none = await single(page, await pictureBytes(page, { area: AREA, speck: AREA, at: SPECKS3 }), 'worker');
    expect(three.said).toContain(' - the furthest by ');
    expect(three.said).toContain(', 3 stray specks joined their area');
    /* counted independently from the cells: the three speck cells came out the area's colour */
    const at = (r, [cx, cy]) => { const i = (cy * r.width + cx) * 4; return '#' + r.cells.slice(i, i + 3).map(v => v.toString(16).padStart(2, '0')).join(''); };
    expect(SPECKS3.map(c => at(three, c))).toEqual([AREA_OUT, AREA_OUT, AREA_OUT]);
    expect(one.said).toContain(', 1 stray speck joined its area');
    /* CONTROL, ONE THING AWAY: the same picture with the three blocks drawn in the area's colour. */
    expect(none.said, 'it was put on the palette').toContain('moved to the palette');
    expect(none.said).not.toContain('stray speck');
  });

  test('A FOLDER ADDS THE STRAY SPECKS UP, and says nothing about them when none joined', async ({ page }) => {
    test.setTimeout(180000);
    const three = await pictureBytes(page, { area: AREA, speck: SPECK, at: SPECKS3 });
    const one = await pictureBytes(page, { area: AREA, speck: SPECK, at: SPECKS3.slice(0, 1) });
    const none = await pictureBytes(page, { area: AREA, speck: AREA, at: SPECKS3 });
    const both = await folder(page, [['backgrounds/three.png', three], ['backgrounds/one.png', one]], 'worker');
    expect(both.palette, both.said).toContain('2 put on the palette');
    expect(both.palette).toContain(', 4 stray specks joined their area');
    /* CONTROL, ONE THING AWAY: the same folder with the specks drawn in the area's colour. */
    const flat = await folder(page, [['backgrounds/three.png', none], ['backgrounds/one.png', none]], 'worker');
    expect(flat.palette, flat.said).toContain('2 put on the palette');
    expect(flat.palette).not.toContain('stray speck');
  });

  test('THE CLEAR-CHANGE COUNT, ITS SHARE AND THE FURTHEST MOVE STILL ADD UP AFTER A SPECK JOINS', async ({ page }) => {
    const r = await inPage(page, `
      /* recount from the pixels in and out, with the page's CIEDE2000, and the step with the pass off
         (shades:false - on these pictures no shade is split, checked by apart) */
      const check = (area, speck) => {
        const grid = Array.from({ length: H.N }, (_, y) => Array.from({ length: H.N }, (_, x) => (x === H.C && y === H.C) ? speck : area));
        const s = H.snap(grid), off = H.snap(grid, null, { shades: false });
        let clear = 0, worst = 0, opaque = 0, moved = 0;
        grid.forEach((row, y) => row.forEach((h, x) => {
          opaque++; const e = H.de(h, s.cells[y][x]); if (e >= 10) clear++; if (e > worst) worst = e;
          if (s.cells[y][x] !== off.cells[y][x]) moved++;
        }));
        return { specks: s.r.specks, moved, apart: s.r.apart, clear: s.r.clear, clearShare: s.r.clearShare, worst: s.r.worst,
          reClear: clear, reShare: clear / opaque, reWorst: worst, offClear: off.r.clear, offWorst: off.r.worst };
      };
      return { across: check('#184a68', '#184668'), within: check(AREA, SPECK) };`);
    for (const k of ['across', 'within']) {
      const x = r[k];
      expect(x.specks, k).toBe(1);
      expect(x.moved, k + ': the one cell the pass moved').toBe(1);
      expect(x.apart, k).toBe(0);
      expect(x.clear, k + ': pixels moved 10 or more, recounted').toBe(x.reClear);
      expect(x.clearShare, k).toBeCloseTo(x.reShare, 12);
      expect(x.worst, k + ': the furthest move, recounted').toBeCloseTo(x.reWorst, 9);
    }
    /* the join moved this one across the 10 line: the count after the pass is not the count before it */
    expect(r.across.offClear).toBe(0);
    expect(r.across.clear).toBe(1);
    expect(r.across.worst).toBeGreaterThan(r.across.offWorst);
    /* CONTROL, ONE THING AWAY: a join that stays under 10 leaves the count where it was. */
    expect(r.within.clear).toBe(r.within.offClear);
  });

  test('THE PICTURE UNDER A CELL IS READ WHERE THE ENGINE PUT THE CELL, also when the picture is not a whole number of cells across', async ({ page }) => {
    const r = await inPage(page, `
      /* 7 cells over a 30px picture, 4 or 5 px a cell. The speck has its area on three sides and a white cell (BG)
         on the fourth: to its right for a line down the picture, below it for a line across. A white line 1px wide
         on the speck's own cell is a fifth of it: an edge the engine's cell lost and the picture did not. */
      const S = 30, mid = s => ({ mid: s.cells[H.C][H.C], specks: s.r.specks });
      const cells = []; for (let p = 0; p < S; p++) if (Math.floor(p * H.N / S) === H.C) cells.push(p);
      const grid = side => Array.from({ length: H.N }, (_, y) => Array.from({ length: H.N }, (_, x) => (x === H.C && y === H.C) ? SPECK
        : (side === 'right' ? (y === H.C && x > H.C) : (x === H.C && y > H.C)) ? BG : AREA));
      const down = X => (cx, cy, ox, oy, x) => (cx === H.C && cy === H.C && x === X) ? BG : null;
      const across = Y => (cx, cy, ox, oy, x, y) => (cx === H.C && cy === H.C && y === Y) ? BG : null;
      const first = cells[0], last = cells[cells.length - 1];
      return { cells,
        down: { none: mid(H.snap(grid('right'), { size: S })), last: mid(H.snap(grid('right'), { size: S, box: down(last) })), first: mid(H.snap(grid('right'), { size: S, box: down(first) })) },
        across: { none: mid(H.snap(grid('below'), { size: S })), last: mid(H.snap(grid('below'), { size: S, box: across(last) })), first: mid(H.snap(grid('below'), { size: S, box: across(first) })) } };`);
    /* The engine puts pixels 13 to 17 in cell 3 (floor(p*7/30) === 3). */
    expect(r.cells).toEqual([13, 14, 15, 16, 17]);
    /* CONTROL: with no line the picture agrees with the cells, and the speck joins its area. */
    expect(r.down.none).toEqual({ mid: AREA_OUT, specks: 1 });
    expect(r.across.none).toEqual({ mid: AREA_OUT, specks: 1 });
    /* A line on the LAST column of the engine's cell (17), and on its last row: refused. (A box taken from
       floor(3*30/7) = 12 to floor(4*30/7) = 17, before 17, missed both, and the join went ahead.) */
    expect(r.down.last, 'a line down the last column of the engine\'s cell').toEqual({ mid: SPECK_OUT, specks: 0 });
    expect(r.across.last, 'a line along its last row').toEqual({ mid: SPECK_OUT, specks: 0 });
    /* CONTROL, ONE THING AWAY: the same line on the cell's first column and row is refused as well. */
    expect(r.down.first).toEqual({ mid: SPECK_OUT, specks: 0 });
    expect(r.across.first).toEqual({ mid: SPECK_OUT, specks: 0 });
  });

  test('EACH PIXEL OF THE PICTURE COUNTS AS MUCH AS IT SHOWS: a faint one barely, a clear one not at all', async ({ page }) => {
    const r = await inPage(page, `
      /* 4px a cell. A quarter of the speck's picture - its first column - is white, at alpha 10 (faint), 0 (clear)
         or 255 (solid); the rest is the speck's own drawn colour. */
      const mid = s => ({ mid: s.cells[H.C][H.C], specks: s.r.specks });
      const col = a => (cx, cy, ox) => (cx === H.C && cy === H.C && ox === 0) ? { h: BG, a } : null;
      const allClear = (cx, cy) => (cx === H.C && cy === H.C) ? { h: BG, a: 0 } : null;
      return { faint: mid(H.snap(H.flat(SPECK), { k: 4, box: col(10) })), clear: mid(H.snap(H.flat(SPECK), { k: 4, box: col(0) })),
        solid: mid(H.snap(H.flat(SPECK), { k: 4, box: col(255) })), none: mid(H.snap(H.flat(SPECK), { k: 4, box: allClear })) };`);
    /* A faint white column barely moves the speck's colour in the picture, and it joins its area. */
    expect(r.faint, 'faint').toEqual({ mid: AREA_OUT, specks: 1 });
    /* A clear one does not move it at all. */
    expect(r.clear, 'clear').toEqual({ mid: AREA_OUT, specks: 1 });
    /* A cell with no alpha anywhere in its picture has no colour there, and the engine's cells alone decide. */
    expect(r.none, 'a box with no alpha').toEqual({ mid: AREA_OUT, specks: 1 });
    /* CONTROL, ONE THING AWAY: the same white column, solid, is an edge the picture draws, and the move is refused. */
    expect(r.solid, 'solid').toEqual({ mid: SPECK_OUT, specks: 0 });
  });

  test('A FOLDER IN SCALE ONLY WITH THE PALETTE TICKED JOINS A STRAY SPECK, though the step is handed its own output as the picture', async ({ page }) => {
    test.setTimeout(120000);
    const S = 32, AT = 10;
    const speck = await onePixelPicture(page, { size: S, area: AREA, pixel: SPECK, at: AT });
    const shade = await onePixelPicture(page, { size: S, area: AREA, pixel: SHADE, at: AT });
    const r = await scaleFolder(page, [['backgrounds/speck.png', speck]], AT);
    /* THE PATH THIS IS ABOUT. In Scale only the folder's answer is the bytes that came in, and it hands those same
       bytes to the palette step as the picture. (That the palette runs here at all, with the switch greyed and its
       title saying Scale only does not recolour, is a defect older than patch627; while it runs, it must read the
       picture as it was.) */
    expect(r.mode).toBe('scale');
    expect(r.seen.length, 'the palette step ran once: ' + r.said).toBe(1);
    expect(r.seen[0].aliased, 'the picture it was handed is its own output buffer').toBe(true);
    expect(r.seen[0].width).toBe(S);
    /* THE CLAIM: the speck joins its area, the folder says so, and the cells are what the editor's button makes
       of the same pixels. */
    expect(r.seen[0].at).toBe(AREA_OUT);
    expect(r.seen[0].specks).toBe(1);
    expect(r.palette, r.said).toContain(', 1 stray speck joined its area');
    expect(r.seen[0].sameAsEditor, 'the same cells as the editor\'s button on these pixels').toBe(true);
    /* CONTROL, ONE THING AWAY: the same folder with the pixel drawn 4.5 dE from its area keeps it, and says nothing. */
    const c = await scaleFolder(page, [['backgrounds/shade.png', shade]], AT);
    expect(c.seen.length).toBe(1);
    expect(c.seen[0].aliased).toBe(true);
    expect(c.seen[0].at).toBe(SPECK_OUT);
    expect(c.seen[0].specks).toBe(0);
    expect(c.palette, c.said).not.toBeNull();
    expect(c.palette).not.toContain('stray speck');
  });

  test('A PICTURE THAT SHARES THE CELLS\' OWN BYTES IS READ AS IT WAS BEFORE THE STEP, not as the step writes it', async ({ page }) => {
    const r = await inPage(page, `
      /* One pixel a cell; the picture handed over is the cells' own buffer, a second view of its bytes, or a copy. */
      const N = H.N, i = (H.C * N + H.C) * 4;
      const run = pick => {
        const d = new Uint8ClampedArray(N * N * 4);
        H.flat(SPECK).forEach((row, y) => row.forEach((h, x) => d.set([...H.hx(h), 255], (y * N + x) * 4)));
        const r = snapToPalette(d, N * N, N, { src: { data: pick(d), width: N, height: N } });
        return { mid: H.hex(d[i], d[i + 1], d[i + 2]), specks: r.specks, cells: Array.from(d).join() };
      };
      const own = run(d => d), view = run(d => new Uint8Array(d.buffer)), copy = run(d => new Uint8ClampedArray(d));
      const black = run(d => { const s = new Uint8ClampedArray(d); s.set([0, 0, 0, 255], i); return s; });
      const at = x => ({ mid: x.mid, specks: x.specks });
      return { own: at(own), view: at(view), copy: at(copy), black: at(black), ownIsCopy: own.cells === copy.cells, viewIsCopy: view.cells === copy.cells };`);
    /* The cells' own buffer, and a Uint8Array over the same bytes: read as they were, so the speck joins. */
    expect(r.own, 'the cells\' own buffer').toEqual({ mid: AREA_OUT, specks: 1 });
    expect(r.view, 'a second view of its bytes').toEqual({ mid: AREA_OUT, specks: 1 });
    expect(r.ownIsCopy).toBe(true);
    expect(r.viewIsCopy).toBe(true);
    /* A copy, as the editor hands over. */
    expect(r.copy).toEqual({ mid: AREA_OUT, specks: 1 });
    /* CONTROL, ONE THING AWAY: a copy that draws the speck's pixel black refuses the move - the picture is read
       here, so the joins above are not the picture being ignored. */
    expect(r.black).toEqual({ mid: SPECK_OUT, specks: 0 });
  });
});
