/* "The base is never part of the artwork."

   The editor can show a base character behind the trait being drawn, as a
   guide for placement. The note under that control makes a flat promise, and
   it is the kind that is expensive to be wrong about: a base baked into the
   saved pixels would put a whole character's linework inside every trait, and
   nothing on the shelf would look wrong until a collection was generated and
   every layer carried a ghost of the same body.

   Structurally the base is drawn to its own canvas and traitCanvas() reads
   only `art`, so the promise holds by construction - which is exactly the kind
   of claim that stops holding the day somebody composites the two for a
   preview and reuses the helper. Nothing tested it, so this does, through the
   real save and out the other side.

   THE FIXTURE IS BUILT SO THE BASE CANNOT HIDE. The trait is one flat colour
   the base does not contain, the base is another, and the base is bigger than
   the trait - so a base baked in at any offset, any opacity above zero, or any
   scale leaves at least one pixel that is neither the trait's colour nor
   transparent.
*/
import { test, expect } from '@playwright/test';

const TRAIT = { r: 200, g: 40, b: 40 };     /* the only colour that may survive */
const BASE = { r: 20, g: 90, b: 200 };      /* must appear nowhere */

const saveWithBase = (page, opts) => page.evaluate(async (o) => {
  const { outline, opacity } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  projectGrid = 160;
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));

  const mk = (w, h, c) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
    g.fillRect(0, 0, w, h);
    /* A dark line through it, so "Show base outline" - which keeps only the
       dark pixels - still has something to keep. */
    g.fillStyle = 'rgb(5,5,15)';
    g.fillRect(0, Math.floor(h / 2), w, Math.max(1, Math.floor(h / 8)));
    return cv;
  };

  const w = 16, h = 16;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = o.trait.r; d[i * 4 + 1] = o.trait.g; d[i * 4 + 2] = o.trait.b; d[i * 4 + 3] = 255;
  }
  fileName = 'probe';
  startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));
  document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));

  /* A base BIGGER than the trait, so it cannot be mistaken for the art even
     if it landed exactly on top. */
  baseBitmap = await createImageBitmap(mk(64, 64, o.base));
  baseOutline = !!outline;
  document.getElementById('baseop').value = String(opacity);
  drawBase();
  await new Promise(r => setTimeout(r, 300));
  /* Asserted, not assumed: if the base never rendered, every check below
     passes against a control that showed nothing. */
  const bc = document.getElementById('base');
  if (bc.style.display === 'none') throw new Error('the base never rendered, so nothing below means anything');

  document.getElementById('tname').value = 'withbase';
  document.getElementById('tlayer').value = 'skins';
  const realToast = window.toast;
  window.toast = () => {};
  let ok;
  try { ok = await saveTrait(); } finally { window.toast = realToast; }
  if (!ok) throw new Error('the save was refused, so there is nothing to read');

  const rec = (await dbAll()).find(x => x.kind === 'trait' && x.name === 'withbase');
  if (!rec) throw new Error('nothing was saved');
  const bm = await createImageBitmap(rec.blob);
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(bm, 0, 0);
  const p = g.getImageData(0, 0, cv.width, cv.height).data;

  /* Every distinct colour in the saved file. */
  const seen = new Map();
  for (let i = 0; i < p.length; i += 4) {
    const k = p[i + 3] === 0 ? 'transparent' : p[i] + ',' + p[i + 1] + ',' + p[i + 2];
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  /* Anything close to the base colour, however faint - a 10% overlay would
     still shift the pixel a long way from the trait's own red. */
  let nearBase = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const db = Math.abs(p[i] - o.base.r) + Math.abs(p[i + 1] - o.base.g) + Math.abs(p[i + 2] - o.base.b);
    const dt = Math.abs(p[i] - o.trait.r) + Math.abs(p[i + 1] - o.trait.g) + Math.abs(p[i + 2] - o.trait.b);
    if (db < dt) nearBase++;
  }
  return { size: bm.width + 'x' + bm.height, colours: [...seen.keys()].sort(),
    nearBase, baseWasShowing: bc.style.display !== 'none' };
}, Object.assign({ trait: TRAIT, base: BASE }, opts));

test.describe('the base character never reaches the saved trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof drawBase === 'function');
  });

  test('a trait saved with a base showing carries none of it', async ({ page }) => {
    const r = await saveWithBase(page, { opacity: 100 });
    expect(r.baseWasShowing, 'the base really was on screen').toBe(true);
    expect(r.size, 'the trait is saved at its own size, not the base\'s').toBe('16x16');
    expect(r.colours, 'one colour, the trait\'s own').toEqual(['200,40,40']);
    expect(r.nearBase, 'and not one pixel closer to the base than to the trait').toBe(0);
  });

  test('and none of it at a low opacity either', async ({ page }) => {
    /* A faint overlay is the version that would survive a careless eye - the
       colours would be almost right rather than obviously wrong. */
    const r = await saveWithBase(page, { opacity: 10 });
    expect(r.colours).toEqual(['200,40,40']);
    expect(r.nearBase).toBe(0);
  });

  test('nor with the outline view turned on', async ({ page }) => {
    /* Show base outline rewrites the base canvas in place, keeping only the
       dark pixels - a second path over the same bitmap, and the one most
       likely to be reached for if the two were ever composited. */
    const r = await saveWithBase(page, { opacity: 100, outline: true });
    expect(r.baseWasShowing).toBe(true);
    expect(r.colours).toEqual(['200,40,40']);
    expect(r.nearBase).toBe(0);
  });
});
