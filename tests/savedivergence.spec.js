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

   SUPERSEDED, 2026-09-08. That last sentence was wrong about a fifth of the
   collection: a solid opaque rectangle is exactly what a BACKGROUND looks
   like, and 58 of the 317 traits fill all four canvas edges - every background
   in the set. The user objected to the black frame this drew round one of them
   during the final review, so an edge the art fills COMPLETELY is no longer
   treated as an edge of the art. blackedge.spec.js holds that rule and both
   directions of it.

   The fixtures here are INSET as a result, so they still have an artwork edge
   to measure at all, and 796 becomes 764 - the perimeter of the art rather
   than of the canvas. What this file is about has not changed: a save says
   what it repainted, and says nothing when it repainted nothing.

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
  /* INSET leaves a transparent margin, so the artwork has an edge of its own
     rather than borrowing the canvas's. Without it every fixture here is full
     bleed, which is the one shape the border rule now leaves alone - and both
     of the tests below would pass while measuring nothing. */
  const M = o.inset || 0;
  for (let y = M; y < S - M; y++) for (let x = M; x < S - M; x++) {
    const edge = (x === M || y === M || x === S - 1 - M || y === S - 1 - M);
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
      /* 200 square at a 160 grid, inset by 4 so the artwork has an edge of its
         own, drawn light grey. The border rule repaints that ring and the save
         says how much of the picture it changed - 192*4-4 = 764. */
      const r = await saveAndCompare(page,
        { size: 200, grid: 160, blackEdge: false, inset: 4 });
      expect(r.differing, 'the whole outer ring of the ARTWORK').toBe(764);
      expect(r.said, 'and the save said so').toContain('764 edge pixels');
      expect(r.said).toContain("collection's border rule");
    });

  test('and an edge that is already black is silent', async ({ page }) => {
    /* THE HALF THAT MAKES THE OTHER ONE USEFUL. Every finished trait in this
       collection already has a black outline, so the rule changes nothing and
       must say nothing - a warning on every save is a warning nobody reads.

       Reporting the ring SIZE instead of what changed would fail here with
       "764 edge pixels" on a save that altered not one. */
    const r = await saveAndCompare(page,
      { size: 200, grid: 160, blackEdge: true, inset: 4 });
    expect(r.differing, 'the stored file is the visible canvas').toBe(0);
    expect(r.said, 'so nothing is said about a repaint').not.toContain('edge pixel');
    expect(r.said, 'it is still an ordinary save').toContain('Saved Probe');
  });

  test('AND A BACKGROUND THAT FILLS THE CANVAS IS NOT REPAINTED AT ALL',
    async ({ page }) => {
      /* THE ONE THE USER OBJECTED TO, pinned in the file that used to record
         the opposite. Full bleed, no inset: every canvas edge is filled, so
         there is no edge of the art anywhere and the save must store exactly
         what is on the screen. Before this rule it stored 796 black pixels
         that nobody had drawn. */
      const r = await saveAndCompare(page,
        { size: 200, grid: 160, blackEdge: false });
      expect(r.differing, 'the stored file is the visible canvas').toBe(0);
      expect(r.said, 'and there was no repaint to report')
        .not.toContain('edge pixel');
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
