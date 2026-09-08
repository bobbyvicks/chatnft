/* When Save to project does not store what is on the screen.

   MEASURED: a 200x200 trait at the default 160 grid saved an image differing
   from the visible canvas in 796 places - exactly 200*4-4, the one-pixel outer
   ring, set to pure black.

   THAT IS NOT A BUG, and this file exists partly to say so. blackenEdge is a
   deliberate collection rule with its reasoning written beside it:

     "The collection's outer border is black. Always. That is a fact about the
      art, so it is asserted rather than inferred"

   On real art the outermost opaque pixels ARE the outline, and the outline is
   already black, so the rule usually changes nothing. The 796 came from a
   solid opaque rectangle, where every edge pixel touches off-canvas emptiness
   - which is not what a trait looks like.

   WHAT WAS WRONG WAS THE SILENCE. blackenEdge returns how many pixels it
   touched; the extraction path records it, and traitCanvas - the one that
   builds the file being written - threw it away. So a save that repainted part
   of somebody's artwork said exactly as much as one that did not.

   That matters for the final review pass, which treats the visible canvas as
   authoritative and asks that the exported pixels equal it. The toast already
   carries an off-grid note for the same reason.

   THE PAIR IS THE POINT. Reporting the size of the ring would warn on every
   save of every finished trait, which is how a real warning becomes noise. The
   number has to be what actually CHANGED - so one test needs the message and
   the other needs the silence.
*/
import { test, expect } from '@playwright/test';

/* Opens a trait of the given size whose edge is or is not already black, and
   returns what the save said and what it stored. */
const saveAndCompare = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  projectGrid = o.grid;
  const S = o.size;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  /* Greyscale, so nothing in the open path reads it as a base render and
     cleans it away - a saturated fixture cost an afternoon once. */
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const edge = (x === 0 || y === 0 || x === S - 1 || y === S - 1);
    const v = edge ? (o.blackEdge ? 0 : 200) : (60 + ((x * 7 + y * 11) % 120));
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.fillRect(x, y, 1, 1);
  }
  const shown = g.getImageData(0, 0, S, S).data.slice();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_Probe_eyes_approved', kind: 'trait', name: 'Probe',
    layer: 'eyes', status: 'approved', blob, w: S, h: S, at: Date.now() });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));

  const rec = (await dbAll()).find(r => r.kind === 'trait');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 300));

  window.__said = [];
  const realToast = window.toast;
  window.toast = (m) => { window.__said.push(String(m)); if (realToast) realToast(m); };
  await saveTrait();
  await new Promise(r => setTimeout(r, 400));
  window.toast = realToast;

  const out = (await dbAll()).find(r => r.kind === 'trait');
  const bm = await createImageBitmap(out.blob);
  const cc = document.createElement('canvas'); cc.width = out.w; cc.height = out.h;
  const gg = cc.getContext('2d', { willReadFrequently: true });
  gg.imageSmoothingEnabled = false; gg.drawImage(bm, 0, 0);
  const stored = gg.getImageData(0, 0, out.w, out.h).data;
  let differing = 0;
  for (let i = 0; i < shown.length; i += 4)
    if (shown[i] !== stored[i] || shown[i+1] !== stored[i+1] ||
        shown[i+2] !== stored[i+2] || shown[i+3] !== stored[i+3]) differing++;
  return { said: window.__said.join(' | '), differing, size: out.w + 'x' + out.h };
}, opts);

test.describe('a save that repaints says so', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof traitCanvas === 'function');
  });

  test('a non-black edge is blackened, and the count is stated',
    async ({ page }) => {
      /* 200 square at a 160 grid, edge drawn light grey. The border rule
         repaints the ring and the save now says how much of the picture it
         changed - 200*4-4 = 796. */
      const r = await saveAndCompare(page, { size: 200, grid: 160, blackEdge: false });
      expect(r.differing, 'the whole outer ring').toBe(796);
      expect(r.said, 'and the save said so').toContain('796 edge pixels');
      expect(r.said).toContain("collection's border rule");
    });

  test('and an edge that is already black is silent', async ({ page }) => {
    /* THE HALF THAT MAKES THE OTHER ONE USEFUL. Every finished trait in this
       collection already has a black outline, so the rule changes nothing and
       must say nothing - a warning on every save is a warning nobody reads.

       Reporting the ring SIZE instead of what changed would fail here with
       "796 edge pixels" on a save that altered not one. */
    const r = await saveAndCompare(page, { size: 200, grid: 160, blackEdge: true });
    expect(r.differing, 'the stored file is the visible canvas').toBe(0);
    expect(r.said, 'so nothing is said about a repaint').not.toContain('edge pixel');
    expect(r.said, 'it is still an ordinary save').toContain('Saved Probe');
  });

  test('and below the grid the border rule does not run at all',
    async ({ page }) => {
      /* traitCanvas gates on the canvas being at or above the collection grid,
         with its own recorded reasoning: on a shrunken canvas a one-pixel
         border eats a measured 36% of a 16px sprite. */
      const r = await saveAndCompare(page, { size: 64, grid: 160, blackEdge: false });
      expect(r.differing, 'nothing was repainted').toBe(0);
      expect(r.said).not.toContain('edge pixel');
    });
});
