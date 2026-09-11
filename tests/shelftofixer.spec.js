/* FROM THE SHELF STRAIGHT INTO FIX PIXELS.

   "have it so that i can directly go from project traits to fix pixels
   without having to downnload a version from projects to use in there (make
   them work together better)"

   The two halves of the page did not know about each other. A trait on the
   shelf opened in the editor and nowhere else; the fixer could only be fed by
   a file picker or a drop. Putting a saved trait through the fixer meant
   downloading it and importing it back - two trips through the filesystem for
   a picture already in the browser.

   The round trip is the half that makes it worth having: each file is built
   with fileWithPath(bytes, layer + "/" + name + ".png"), the shape a folder
   import arrives in, so the fixer's Save to project reads the layer out of
   the path and the trait lands back where it came from.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixFromRecords === 'function');
};

/* Two traits on the shelf, in two different layers. */
const shelfOf = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const mk = async (name, layer) => {
    const S = 640, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    for (let y = 0; y < S / 5; y++) for (let x = 0; x < S / 5; x++) {
      g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x + y) % 4];
      g.fillRect(x * 5, y * 5, 5, 5);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    await dbPut({ id: 't_' + name + '_' + layer + '_approved', kind: 'trait',
      name, layer, status: 'approved', blob, w: S, h: S, at: Date.now() });
  };
  await mk('Hoodie', 'clothing');
  await mk('Shades', 'glasses');
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['clothing', 'glasses', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 400));
});

test('A TILE SENDS ONE TRAIT, CARRYING ITS LAYER', async ({ page }) => {
  await ready(page);
  await shelfOf(page);
  const r = await page.evaluate(async () => {
    const tiles = [...document.querySelectorAll('#projbody .item')];
    const withButton = tiles.filter(t => t.querySelector('.fx')).length;
    const realToast = window.toast; let said = '';
    window.toast = (m) => { said += String(m); };
    try {
      tiles[0].querySelector('.fx').click();
      await new Promise(r2 => setTimeout(r2, 600));
    } finally { window.toast = realToast; }
    return { tiles: tiles.length, withButton, said,
      page: document.getElementById('land').getAttribute('data-page'),
      rel: FIX.rel, name: FIX.name,
      src: FIX.src ? FIX.src.width + 'x' + FIX.src.height : null,
      batchHidden: document.getElementById('fixbatch').hidden };
  });
  expect(r.withButton, 'every tile can send its trait').toBe(r.tiles);
  /* It lands you on the page it just filled. */
  expect(r.page).toBe('fixer');
  expect(r.src, 'the picture is loaded, not a placeholder').toBe('640x640');
  /* THE HALF THAT MAKES THE ROUND TRIP WORK. Without the layer in the path,
     the fixer's save reads no category and everything comes back to
     unsorted. */
  expect(r.rel, 'it carries where it came from').toBe('clothing/Hoodie.png');
  /* One trait goes down the single-image path, not the batch one - the same
     fork the drop handler makes. */
  expect(r.batchHidden).toBe(true);
  expect(r.said).toContain('Sent Hoodie to Fix pixels');
});

test('AND THE PICKED ONES GO AS ONE RUN', async ({ page }) => {
  await ready(page);
  await shelfOf(page);
  const r = await page.evaluate(async () => {
    const before = document.getElementById('shelfpickfix').disabled;
    const items = await dbAll();
    for (const i of items) if (i.kind === 'trait') shelfPick.add(shelfCore.recordKey(i));
    shelfPickPaint();
    const after = document.getElementById('shelfpickfix').disabled;
    const realToast = window.toast; let said = '';
    window.toast = (m) => { said += String(m); };
    try {
      document.getElementById('shelfpickfix').click();
      await new Promise(r2 => setTimeout(r2, 1500));
    } finally { window.toast = realToast; }
    return { before, after, said,
      page: document.getElementById('land').getAttribute('data-page'),
      n: fixBatchFiles.length,
      rels: fixBatchFiles.map(f => f.rel || f.name).sort() };
  });
  /* Off until something is picked, like Move and Clear beside it. */
  expect(r.before, 'nothing picked, nothing to send').toBe(true);
  expect(r.after, 'and live once there is').toBe(false);
  expect(r.page).toBe('fixer');
  expect(r.n, 'both of them, in one run').toBe(2);
  /* EACH ONE CARRYING ITS OWN LAYER, which is what sends them home again. */
  expect(r.rels).toEqual(['clothing/Hoodie.png', 'glasses/Shades.png']);
  expect(r.said).toContain('Sent 2 traits to Fix pixels');
});

test('and the fix button does not also open the editor', async ({ page }) => {
  await ready(page);
  await shelfOf(page);
  /* THE CONTROL. The tile body opens the editor, and the button sits on the
     tile - without stopPropagation both fire and you land in the editor with
     the fixer filled behind you. */
  const r = await page.evaluate(async () => {
    const tile = document.querySelector('#projbody .item');
    const realToast = window.toast; window.toast = () => {};
    try {
      tile.querySelector('.fx').click();
      await new Promise(r2 => setTimeout(r2, 600));
    } finally { window.toast = realToast; }
    return { page: document.getElementById('land').getAttribute('data-page'),
      editorOpen: !document.getElementById('app').hidden };
  });
  expect(r.page, 'the fixer, not the editor').toBe('fixer');
  expect(r.editorOpen, 'and the editor did not open behind it').toBe(false);
});

test('and it is there on a touch screen, where there is no hover',
  async ({ page }) => {
    await ready(page);
    await shelfOf(page);
    /* The remove button carries the same note for the same reason: the reveal
       rule is the only thing that shows it, and on a touch screen it never
       fires - so the button existed for nobody on a tablet. */
    const r = await page.evaluate(() => {
      const css = [...document.styleSheets].flatMap(s => {
        try { return [...s.cssRules].map(x => x.cssText); } catch (_) { return []; }
      }).join('\n');
      return { rule: /@media \(hover: ?none\)/.test(css) && /\.item \.fx/.test(css),
        hoverOnly: css.indexOf('.item:hover .fx') >= 0 };
    });
    expect(r.hoverOnly, 'it is revealed on hover on a pointer screen').toBe(true);
    expect(r.rule, 'and shown outright where there is none').toBe(true);
  });
