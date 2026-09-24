/* FIX PIXELS MAKES THE BLACK OUTLINE ONE CELL THICK.

   Asked for about a spiky hair trait: "i want them always to onnly be 1
   black square thick and its missing a bunch/ bhnched up a bunch to llook
   like a blob". Their picture is not in this repo - the repo is public and
   so is every file the site serves - so the hair here is drawn the way
   theirs is made: 1280 px in 10 px blocks (which the fixer's 8 px grid cuts
   across, so a one-block line comes out one cell thick in places and two in
   others), a flat grey fill, a one-block black outline, spike tips that
   are solid black clumps, a stretch of line two blocks thick, a whisker,
   and dark teal and near-black blocks sitting in the line - the colours
   theirs has there. (Their own picture was run through the same checks
   before this was drawn: 359 edge cells, none not black, none doubled, two
   colours.) RUN AGAINST THE PAGE BEFORE THE FIX: the first two and the
   folder test went red - 9 edge cells not black, 104 doubled, the two teals
   left in - and the last, which needs a switch to turn off. The controls:
   with the switch off the outline is as the fixer left it, and a chain -
   drawn without an outline by design - is left alone. Mutants: the chain
   left off the skip list failed only the chain control; a switch that is
   ignored failed only the switch-off control; the folder's own call taken
   out failed only the two folder tests. */
import { test, expect } from '@playwright/test';

/* The spiky hair, as PNG bytes in base64. Blocks on a 128 grid: seven
   spikes along the top, tips at x 35, 45, ... 95. */
const drawHair = (page) => page.evaluate(async () => {
  const B = 10, N = 128;
  const top = x => 24 + Math.round(Math.abs(((x - 30) % 10) - 5) * 3.4);
  const inside = (x, y) => x >= 30 && x <= 100 && y >= top(x) && y <= 60;
  const col = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    col.set(x + ',' + y, edge ? '#000000' : '#303030');
  }
  const set = (x, y, c) => col.set(x + ',' + y, c);
  /* Spike tips bunched into black clumps. */
  for (let t = 35; t <= 95; t += 10) for (let x = t - 1; x <= t + 1; x++)
    for (let y = top(t); y <= top(t) + 3; y++) if (inside(x, y)) set(x, y, '#000000');
  /* A stretch of line two blocks thick, along the bottom and up the left. */
  for (let x = 75; x <= 90; x++) set(x, 59, '#000000');
  for (let y = 45; y <= 55; y++) set(31, y, '#000000');
  /* Debris in the line: the dark teals and the near-black. */
  for (const [x, y] of [[40, 60], [41, 60], [55, 60], [70, 60], [71, 60]]) set(x, y, '#00272f');
  for (const [x, y] of [[100, 48], [100, 49], [100, 52]]) set(x, y, '#002827');
  for (const [x, y] of [[30, 50], [30, 51], [62, 60]]) set(x, y, '#0d0d0d');
  /* A whisker: one black block standing off the right side. */
  set(101, 55, '#000000');
  const c = document.createElement('canvas'); c.width = c.height = B * N;
  const g = c.getContext('2d');
  for (const [k, v] of col) { const [x, y] = k.split(',').map(Number); g.fillStyle = v; g.fillRect(x * B, y * B, B, B); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
});

/* Fix one picture through the page's own single run, at pixel size 8 with
   Save at 1280 and the palette on - the user's settings - and measure the
   result's cell grid: every cell touching empty space, how many are not
   black, how many black cells sit right behind a black edge cell, and every
   colour left. */
const fixAndMeasure = (page, o) => page.evaluate(async ({ b64, rel, line }) => {
  try { authed = true; } catch (_) {}
  gateShow(false); showPage('fixer', false);
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
    if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
  set('fixforce', '8'); set('fixgrid', true); set('fixpal', true); set('fixline', line);
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (!await fixLoad(fileWithPath(bytes, rel))) return { error: document.getElementById('fixout').textContent };
  const r = await fixRun();
  const W = r.width, H = r.height, d = r.data;
  const op = i => d[i * 4 + 3] >= 128, blk = i => op(i) && !d[i * 4] && !d[i * 4 + 1] && !d[i * 4 + 2];
  const ring = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!op(i)) continue; const x = i % W, y = (i / W) | 0;
    if ((x > 0 && !op(i - 1)) || (x < W - 1 && !op(i + 1)) || (y > 0 && !op(i - W)) || (y < H - 1 && !op(i + W))) ring[i] = 1;
  }
  let edge = 0, notBlack = 0, doubled = 0; const cols = new Set();
  for (let i = 0; i < W * H; i++) {
    if (!op(i)) continue; cols.add(d[i * 4] + ',' + d[i * 4 + 1] + ',' + d[i * 4 + 2]);
    if (ring[i]) { edge++; if (!blk(i)) notBlack++; continue; }
    const x = i % W, y = (i / W) | 0;
    if (blk(i) && [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && ring[b * W + a] && blk(b * W + a))) doubled++;
  }
  return { cells: W + 'x' + H, edge, notBlack, doubled, colours: [...cols].sort(), said: document.getElementById('fixout').textContent };
}, { b64: o.b64, rel: o.rel, line: o.line });

test.describe('the outline Fix pixels leaves', () => {
  let hair;
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixRun === 'function' && typeof fileWithPath === 'function');
    hair = await drawHair(page);
  });

  test('ON SPIKY HAIR every edge cell is black and nothing is doubled', async ({ page }) => {
    const r = await fixAndMeasure(page, { b64: hair, rel: 'hair/wip/spiky.png', line: true });
    console.log('hair: ' + JSON.stringify({ ...r, said: undefined }) + ' | ' + r.said);
    expect(r.cells).toBe('160x160');
    expect(r.notBlack, 'no gap in the outline').toBe(0);
    expect(r.doubled, 'one cell thick').toBe(0);
    expect(r.said).toContain('outline made one cell thick');
  });

  test('AND THE DARK TEAL DEBRIS IN THE LINE IS GONE: black and the fill, nothing else', async ({ page }) => {
    const r = await fixAndMeasure(page, { b64: hair, rel: 'hair/wip/spiky.png', line: true });
    expect(r.colours.length, JSON.stringify(r.colours)).toBe(2);
    expect(r.colours).toContain('0,0,0');
  });

  test('the control: with the switch off, the outline is as the fixer left it', async ({ page }) => {
    const r = await fixAndMeasure(page, { b64: hair, rel: 'hair/wip/spiky.png', line: false });
    console.log('off: ' + JSON.stringify({ ...r, said: undefined }));
    expect(r.doubled).toBeGreaterThan(50);
    expect(r.said).not.toContain('outline made one cell thick');
  });

  test('the control: a chain, drawn without an outline by design, is left alone', async ({ page }) => {
    const on = await fixAndMeasure(page, { b64: hair, rel: 'chains/wip/spiky.png', line: true });
    const off = await fixAndMeasure(page, { b64: hair, rel: 'chains/wip/spiky.png', line: false });
    expect(on.doubled).toBe(off.doubled);
    expect(on.colours).toEqual(off.colours);
  });

  /* A FOLDER takes the same step in its own place (fixBatchRun's finish),
     so it is measured on its own: the picture a folder run writes is, pixel
     for pixel, the one the single run writes, and the run's note counts it. */
  const single = (page, b64, line) => page.evaluate(async ({ b64, line }) => {
    try { authed = true; } catch (_) {}
    gateShow(false); showPage('fixer', false);
    const set = (id, v) => { const e = document.getElementById(id); if (!e) return;
      if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
    set('fixforce', '8'); set('fixgrid', true); set('fixpal', true); set('fixline', line);
    const sig = async (u8) => { const p = await pngDecode(u8);
      return p.width + 'x' + p.height + '#' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', p.data))).slice(0, 8).join('.'); };
    const file = () => fileWithPath(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), 'hair/wip/spiky.png');
    if (!await fixLoad(file())) return { error: document.getElementById('fixout').textContent };
    const one = await sig(await fixResultBytes(await fixRun()));
    await fixBatch([file()]);
    const f = fixBatchFiles[0];
    return { one, folder: f ? await sig(f.data) : null, note: document.getElementById('fixbatchout').textContent };
  }, { b64, line });

  test('A FOLDER RUN GIVES THE SAME ONE-CELL OUTLINE, and says so', async ({ page }) => {
    const r = await single(page, hair, true);
    console.log('folder: ' + JSON.stringify(r));
    expect(r.folder).toBe(r.one);
    expect(r.note).toContain('1 outline made one cell thick');
  });

  test('the control: with the switch off a folder run is not outlined, and says nothing of it', async ({ page }) => {
    const on = await single(page, hair, true);
    const off = await single(page, hair, false);
    expect(off.folder).toBe(off.one);
    expect(off.folder).not.toBe(on.folder);
    expect(off.note).not.toContain('outline');
  });
});
