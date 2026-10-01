/* A SMALL DRAWING KEEPS ITS DRAWN BLACK (round 7, outline7).

   Since round 6 the outline pass runs on every picture. On mouths, eyes and pendants its peel and whisker cut
   removed black that is the drawing: the Smoking Pipe's rim spike and the dark row under its rim, the Pill on
   Tongue lip edge drawn 2 cells wide, chain-link black, the eyes' 2-cell lines at size 4. The owner: "i dont want
   specific rules for certain traits". What tells those apart, measured on the 311 (outline7/notes.txt), is the size
   of the drawing, not its pixels: fixOutlineOnce's [D1] - a selected part covering less than MIN_THIN_PX = 32,000
   source px gets its ring repaired (gaps closed, dark rim made black) but is not peeled and has no whisker cut.

   The pictures below are drawn ON the 8 px grid (every block lands on one cell at Pixel size 8, on 2 x 2 cells at
   size 4), so the cells the fixer hands the pass are the drawing exactly. Each test first reads the cells with the
   switch off (PRECONDITION). The sprite: a grey box with a one-block black outline, one outline block left grey (a
   gap), a second black row under the top side (a drawn dark row), the right side drawn 2 blocks wide for 4 blocks
   (a lip edge), and a one-block spike on the flat top (the pipe's rim spike).

     TEST 1 SMALL, size 8 (16,128 px): the dark row, the 2-block edge and the spike stay black, and the gap is
            closed and the picture changed, so the pass did run.
     TEST 2 SMALL, size 4: the top and left sides stay 2 cells wide (32 cells read). The gap's outer column (2
            cells, grey with the switch off) is black, and the picture differs from the switch-off run. Those two
            checks show the pass ran at size 4. A page that skipped the pass at 4 would also keep the line 2 cells
            wide, and before these checks were added such a page (N4 below) passed this test.
     TEST 3 BIG control, size 8 (36,608 px): the dark row and the 2-block edge are peeled, the spike is cut, the
            gap is closed and the readout says "outline made one cell thick".

   HOW EACH WAS SHOWN TO FAIL (specs-work, 2026-10-01):
   - F7.html (the page that ships): 3 passed.
   - N4, F7.html with one line changed (mkmut.cjs) so fixOutlineOnce returns its input untouched when the source
     cell size is 4: test 2 fails on "the pass ran at size 4: the ring is repaired, the gap is closed", Expected
     "BB", Received "cc" (and its hash equals the switch-off run's). Tests 1 and 3 pass there.
   - base7.html (the page before this change): test 1 fails on "the dark row under the top is drawing: kept"
     (Received "cccccc"; its log also shows the edge peeled and the spike cut). Test 2 fails on "kept 2 cells wide"
     (Received "BcBcBcBcBcBcBcBcBBccBBccBBccBBcc"). Test 3, the BIG control, passes there and on F7.
   - I, F7.html with MIN_THIN_PX = 32000 changed to 1e12 (every part counts as small): test 3 fails on "peeled",
     Expected "cccccc", Received "BBBBBB". So the control can fail.
   - The spec as it stood before test 2 gained its gap and picture checks: 3 passed on N4. */
import { test, expect } from '@playwright/test';

/* The sprite, w x h blocks of 8 px with its top-left block at (bx, by). Returns PNG base64 and the block
   coordinates the tests look at. */
const drawSprite = (page, o) => page.evaluate(async ({ bx, by, w, h }) => {
  const B = 8, c = document.createElement('canvas'); c.width = c.height = 1280;
  const g = c.getContext('2d'), put = (x, y, col) => { g.fillStyle = col; g.fillRect((bx + x) * B, (by + y) * B, B, B); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#000000' : '#8b93af');
  const row = [], edge = [];
  for (let x = 3; x <= 8; x++) { put(x, 1, '#000000'); row.push([bx + x, by + 1]); }          // the drawn dark row under the top
  for (let y = 4; y <= 7; y++) { put(w - 2, y, '#000000'); edge.push([bx + w - 2, by + y]); }  // the right side drawn 2 blocks wide
  const sx = bx + 12; g.fillStyle = '#000000'; g.fillRect(sx * B, (by - 1) * B, B, B);           // the spike on the flat top
  const gap = [bx, by + 8]; put(0, 8, '#8b93af');                                                  // a gap in the left side
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), row, edge, spike: [sx, by - 1], gap, area: w * h * B * B };
}, o);

/* Fix it through the page's own single run at a Pixel size, palette on, outline switch as given; read the cells at
   the given CELL coordinates (each block is (cell size / 8) cells wide at other sizes - the tests at 8 read one cell
   per block) and hash the grid. */
const fixCells = (page, o) => page.evaluate(async ({ b64, rel, line, size, pts }) => {
  try { authed = true; } catch (_) {}
  gateShow(false); showPage('fixer', false);
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
    if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
  set('fixforce', String(size)); set('fixgrid', true); set('fixpal', true); set('fixline', line);
  if (!await fixLoad(fileWithPath(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), rel))) return { error: document.getElementById('fixout').textContent };
  const r = await fixRun();
  const W = r.width, d = r.data;
  const black = ([x, y]) => { const i = (y * W + x) * 4; return d[i + 3] >= 128 && !d[i] && !d[i + 1] && !d[i + 2]; };
  const op = ([x, y]) => d[(y * W + x) * 4 + 3] >= 128;
  let hash = 2166136261; for (let i = 0; i < d.length; i++) hash = Math.imul(hash ^ d[i], 16777619) >>> 0;
  const out = {}; for (const k of Object.keys(pts)) out[k] = pts[k].map(p => op(p) ? (black(p) ? 'B' : 'c') : '.').join('');
  return { cells: W + 'x' + r.height, hash, ...out, said: document.getElementById('fixout').textContent };
}, { b64: o.b64, rel: o.rel, line: o.line, size: o.size, pts: o.pts });

const pts8 = s => ({ row: s.row, edge: s.edge, spike: [s.spike], gap: [s.gap] });

test.describe('a small drawing keeps its drawn black', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixRun === 'function' && typeof fileWithPath === 'function');
  });

  test('A SMALL DRAWING AT SIZE 8: the dark row, the 2-block edge and the spike stay; the gap is closed', async ({ page }) => {
    const s = await drawSprite(page, { bx: 60, by: 60, w: 18, h: 14 });   // 252 cells, 16,128 px: over the gate's 200 cells, under 32,000 px
    const off = await fixCells(page, { b64: s.b64, rel: 'mouth/wip/sprite.png', line: false, size: 8, pts: pts8(s) });
    const on = await fixCells(page, { b64: s.b64, rel: 'mouth/wip/sprite.png', line: true, size: 8, pts: pts8(s) });
    console.log('small @8 off: ' + JSON.stringify({ ...off, said: undefined }) + ' | on: ' + JSON.stringify({ ...on, said: undefined }) + ' | ' + on.said);
    expect(s.area).toBeLessThan(32000);
    expect(off.cells).toBe('160x160');
    /* PRECONDITION: the fixer hands the pass the drawing exactly - the black is there, and the gap is not black */
    expect(off.row + off.edge + off.spike, 'PRECONDITION: the drawn black reaches the pass').toBe('BBBBBB' + 'BBBB' + 'B');
    expect(off.gap, 'PRECONDITION: the gap is a gap').toBe('c');
    expect(on.row, 'the dark row under the top is drawing: kept').toBe('BBBBBB');
    expect(on.edge, 'the edge drawn 2 blocks wide: kept').toBe('BBBB');
    expect(on.spike, 'the spike on the flat top: kept').toBe('B');
    expect(on.gap, 'the ring is still repaired: the gap is closed').toBe('B');
    expect(on.hash, 'and the pass did change the picture').not.toBe(off.hash);
  });

  test('THE SAME DRAWING AT SIZE 4: its one-block line stays 2 cells wide where the pass used to thin it', async ({ page }) => {
    const s = await drawSprite(page, { bx: 60, by: 60, w: 18, h: 14 });
    /* the top side's 2 cells at size 4 over blocks 13..16 (block b covers cells 2b, 2b+1), away from the dark row and the spike */
    const top = []; for (let b = 13; b <= 16; b++) for (const dx of [0, 1]) for (const dy of [0, 1]) top.push([2 * (60 + b) + dx, 2 * 60 + dy]);
    const left = []; for (let b = 3; b <= 6; b++) for (const dx of [0, 1]) for (const dy of [0, 1]) left.push([2 * 60 + dx, 2 * (60 + b) + dy]);
    /* the gap block's outer column at size 4: its 2 cells on the left side's outer edge */
    const gap = [[2 * s.gap[0], 2 * s.gap[1]], [2 * s.gap[0], 2 * s.gap[1] + 1]];
    const off = await fixCells(page, { b64: s.b64, rel: 'eyes/wip/sprite.png', line: false, size: 4, pts: { top, left, gap } });
    const on = await fixCells(page, { b64: s.b64, rel: 'eyes/wip/sprite.png', line: true, size: 4, pts: { top, left, gap } });
    console.log('small @4 off: ' + JSON.stringify({ ...off, said: undefined }) + ' | on: ' + JSON.stringify({ ...on, said: undefined }));
    expect(off.cells).toBe('320x320');
    expect(off.top + off.left, 'PRECONDITION: the line reaches the pass 2 cells wide').toBe('B'.repeat(32));
    expect(off.gap, 'PRECONDITION: the gap is a gap').toBe('cc');
    expect(on.top + on.left, 'kept 2 cells wide').toBe('B'.repeat(32));
    /* the pass did run at size 4: a pass that never ran would also keep the line, so show it acted */
    expect(on.gap, 'the pass ran at size 4: the ring is repaired, the gap is closed').toBe('BB');
    expect(on.hash, 'and the pass did change the picture').not.toBe(off.hash);
  });

  test('the control: the same drawing made big enough (36,608 px) is thinned as before - the dark row and the 2-block edge are peeled, the spike is cut', async ({ page }) => {
    const s = await drawSprite(page, { bx: 50, by: 50, w: 26, h: 22 });   // 572 cells, 36,608 px
    const off = await fixCells(page, { b64: s.b64, rel: 'mouth/wip/big.png', line: false, size: 8, pts: pts8(s) });
    const on = await fixCells(page, { b64: s.b64, rel: 'mouth/wip/big.png', line: true, size: 8, pts: pts8(s) });
    console.log('big @8 off: ' + JSON.stringify({ ...off, said: undefined }) + ' | on: ' + JSON.stringify({ ...on, said: undefined }) + ' | ' + on.said);
    expect(s.area).toBeGreaterThan(32000);
    expect(off.row + off.edge + off.spike, 'PRECONDITION: the drawn black reaches the pass').toBe('BBBBBB' + 'BBBB' + 'B');
    expect(on.row, 'peeled').toBe('cccccc');
    expect(on.edge, 'thinned to the one-cell outline').toBe('cccc');
    expect(on.spike, 'cut').toBe('.');
    expect(on.gap, 'gap closed').toBe('B');
    expect(on.said).toContain('outline made one cell thick');
  });
});
