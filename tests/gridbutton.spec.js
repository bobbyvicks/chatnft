/* The Grid button promised the grid size and gave the trait's own.

   download(scale) draws at art.width*scale by art.height*scale, so at scale 1
   that is whatever the trait's canvas happens to be. The button's title said:

     "Download at the grid size - the size every trait has to be to line up"

   which is true only when the trait is already at the grid - the one case
   where the sentence has nothing to add.

   MEASURED. A 48x48 trait in a collection whose grid is 160:

     art               48x48
     projectGrid       160
     button title      "Download at the grid size ..."
     downloaded        48x48
     said              "Downloaded 48×48"

   The number was honest. The button was not: somebody with an off-grid trait
   presses "Grid" expecting a file that lines up and gets one that does not,
   while the app spends three other messages warning about that mismatch.

   THE BUTTON'S BEHAVIOUR IS UNCHANGED ON PURPOSE. Scaling art up to the grid
   on the way out is the thing this file has already refused in writing beside
   the project download - "silently resizing their art on the way out would be
   worse than shipping it wrong" - so the fix is what is claimed and what is
   said, and the first test here pins the size so a later reading of this as
   "make it output the grid size" cannot land quietly.
*/
import { test, expect } from '@playwright/test';

/* Opens a trait of the given size in a collection whose grid is 160, presses
   one of the download buttons, and reports what came out. */
const press = (page, opts) => page.evaluate(async (o) => {
  const { size, button } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  projectGrid = 160;
  await dbPut({ id: 'settings.grid', kind: 'settings', cells: 160, at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
  const w = size, h = size;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 200; d[i * 4 + 3] = 255; }
  fileName = 'probe';
  startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  await new Promise(r => setTimeout(r, 300));

  const said = [];
  const realToast = window.toast, realClick = HTMLAnchorElement.prototype.click;
  const realCreate = URL.createObjectURL;
  let blob = null;
  window.toast = (m) => { said.push(m); };
  HTMLAnchorElement.prototype.click = function () {};
  URL.createObjectURL = (b) => { blob = b; return 'blob:stub'; };
  try {
    document.getElementById(button).click();
    await new Promise(r => setTimeout(r, 700));
  } finally {
    window.toast = realToast; HTMLAnchorElement.prototype.click = realClick;
    URL.createObjectURL = realCreate;
  }
  if (!blob) throw new Error('nothing was downloaded, so there is nothing to read');
  const bm = await createImageBitmap(blob);
  return { out: bm.width + 'x' + bm.height, said: said.join(' | '),
    title: document.getElementById(button).title };
}, opts);

test.describe('what the Grid download claims and what it produces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof download === 'function');
  });

  test('it downloads the trait at its own size, off-grid or not', async ({ page }) => {
    /* Pinned deliberately. The other reading of this defect is "make it output
       160x160", which would scale somebody's art on the way out - refused in
       writing beside the project download. */
    const r = await press(page, { size: 48, button: 'dlNative' });
    expect(r.out, 'the art is not scaled to the grid').toBe('48x48');
  });

  test('and the button no longer says it does something else', async ({ page }) => {
    const r = await press(page, { size: 48, button: 'dlNative' });
    expect(r.title, 'it describes what it does').toContain('at its own size, unscaled');
    expect(r.title, 'and names the requirement separately').toContain("match the collection's grid");
    expect(r.title, 'the old claim is gone').not.toContain('Download at the grid size');
  });

  test('the message names the size it was supposed to be', async ({ page }) => {
    const r = await press(page, { size: 48, button: 'dlNative' });
    expect(r.said, 'the size it got').toContain('Downloaded 48×48');
    expect(r.said, 'and the one it should have been').toContain("not the collection's 160×160");
  });

  test('and says it once, not twice', async ({ page }) => {
    /* The first draft read "Downloaded 48×48 - this trait is 48×48, not the
       collection's 160×160". One number printed twice reads as a bug in the
       message rather than a fact about the trait. */
    const r = await press(page, { size: 48, button: 'dlNative' });
    expect(r.said.split('48×48').length - 1, '48×48 appears once').toBe(1);
  });

  test('a trait already at the grid is not warned about', async ({ page }) => {
    // A CONTROL. Most traits match, and a note on every download would stop
    // being read long before it met one that mattered.
    const r = await press(page, { size: 160, button: 'dlNative' });
    expect(r.out).toBe('160x160');
    expect(r.said).toBe('Downloaded 160×160');
  });

  test('the 8x download of a correct trait is silent too', async ({ page }) => {
    /* THE OTHER CONTROL. 8x writes a 1280-wide file on purpose, so a check
       written against the OUTPUT rather than the trait would warn on every
       press of it - a false alarm on the one button that cannot be wrong. */
    const r = await press(page, { size: 160, button: 'dlBig' });
    expect(r.out).toBe('1280x1280');
    expect(r.said, 'nothing to say about the size').toBe('Downloaded 1280×1280');
  });

  test('but an off-grid trait is still named at 8x', async ({ page }) => {
    const r = await press(page, { size: 48, button: 'dlBig' });
    expect(r.out).toBe('384x384');
    expect(r.said).toContain("not the collection's 160×160");
  });
});
