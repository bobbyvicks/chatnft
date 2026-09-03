/* Shared plumbing for the suite.

   The app is one page with no module boundary, so the tests drive its own
   globals - startEditor, palette, applyResize, dab - exactly as a person's
   clicks would reach them. That is deliberate: a test that reimplements the
   algorithm proves the reimplementation works, which is not the question.

   NOTE for anyone adding a test. The page declares its state with top-level
   `let` - ctx, art, brush, tool, zoom, fileName. Those live in the global
   LEXICAL environment: reachable inside page.evaluate as a bare name, and
   never as a property of window. Reading it off window gives undefined, and
   assigning to window.fileName creates a NEW property the page never reads.
   Only `function` declarations land on window; bare names reach those too,
   so bare is the rule here. Both of those mistakes have been made already.

   The old note, which was right about the danger and wrong about the cause:
   `brush`, `tool`, `zoom` and friends are
   script-scope `let`, NOT on window. Reading window.brush gives undefined, and
   a check that compares undefined to undefined passes silently. Read the
   controls and the readouts instead - the slider value, #bslab, #bsize - or
   measure the pixels. That mistake has already been made once here.
*/

/** Open the editor on generated art. `draw(set, W, H)` paints it. */
export async function openTrait(page, { w = 80, h = 80, draw, name = 'test.png', folds = false } = {}) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');

  /* Step past the sign-in wall. These tests are about the editor, not about
     authentication, and without this every click is intercepted and every
     failure reads as a broken control.

     TWO things now, and they are deliberately separate. gateShow(false) takes
     the scrim down - that is the picture. `authed` is the lock: startEditor
     and load refuse to run without it, and gateShow does NOT set it, so
     hiding the scrim alone gets an empty app. A test that only did the first
     would fail on every editor test, and one that only did the second would
     pass while the scrim swallowed the clicks.

     This IS a bypass, stated plainly. The gate's own behaviour is tested in
     auth.spec.js, which drives the real sign-in path instead of setting this. */
  await page.evaluate(() => {
    try { authed = true; } catch (_) { /* older build without the lock */ }
    try { gateShow(false); } catch (_) {}
  });
  if (!folds) await page.evaluate(() => { try { localStorage.removeItem('pb.folds'); } catch (_) {} });

  await page.evaluate(({ w, h, src, name }) => {
    const d = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, c) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255;
    };
    // eslint-disable-next-line no-new-func
    new Function('set', 'W', 'H', src)(set, w, h);
    fileName = name;
    startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  }, { w, h, src: draw.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, ''), name });

  await page.waitForFunction(() => !document.getElementById('app').hidden);
  /* Again: the boot-time session check is async and re-raises the wall when it
     resolves to "not signed in", which lands after the editor has opened - and
     raising it now also empties the shelf, so the flag goes back too. */
  await page.evaluate(() => {
    try { authed = true; } catch (_) { /* older build without the lock */ }
    try { gateShow(false); } catch (_) {}
  });
  await page.waitForTimeout(250);
  return errors;
}

/** Open every folded section, for tests that need controls in more than one. */
export async function openAllSections(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
  });
  await page.waitForTimeout(120);
}

/** Open one section by its heading. */
export async function openSection(page, name) {
  /* CLICK the heading rather than stripping the class. The click handler is
     what scrolls the opened section into view, and a test that bypasses it
     tests a code path no person can reach. */
  await page.evaluate(n => {
    const h = [...document.querySelectorAll('.side section h2')]
      .find(x => x.textContent.toLowerCase().includes(n.toLowerCase()));
    if (!h) throw new Error('no section called ' + n);
    if (h.closest('section').classList.contains('folded')) h.click();
  }, name);
  await page.waitForTimeout(120);
}

/** Attach a base character. `draw(g, size)` paints it on a 2D context. */
export async function attachBase(page, { size = 200, draw } = {}) {
  await page.evaluate(async ({ size, src }) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    // eslint-disable-next-line no-new-func
    new Function('g', 'S', src)(g, size);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await setBaseFromBlob(blob);
  }, { size, src: draw.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, '') });
  await page.waitForTimeout(200);
}

/** Pixel counts on the artwork canvas. */
export const art = {
  /** How many opaque pixels exactly match this rgb. */
  colour: (page, rgb) => page.evaluate(c => {
    const d = ctx.getImageData(0, 0, art.width, art.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] > 0 && d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) n++;
    return n;
  }, rgb),
  /** How many fully transparent pixels. */
  empty: page => page.evaluate(() => {
    const d = ctx.getImageData(0, 0, art.width, art.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) n++;
    return n;
  }),
  /** Transparent pixels that still carry colour - a fringe left behind. */
  stale: page => page.evaluate(() => {
    const d = ctx.getImageData(0, 0, art.width, art.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] === 0 && (d[i] || d[i + 1] || d[i + 2])) n++;
    return n;
  }),
  /** Distinct columns holding any opaque pixel - counts vertical lines. */
  litColumns: page => page.evaluate(() => {
    const W = art.width, H = art.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    let n = 0;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 0) { n++; break; }
    }
    return n;
  }),
  size: page => page.evaluate(() => art.width + 'x' + art.height),
  /** The bounding box of the opaque pixels. */
  bounds: page => page.evaluate(() => {
    const W = art.width, H = art.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }),
};

/** Ink drawn on the base overlay, in canvas pixels. */
export const base = {
  ink: page => page.evaluate(() => {
    const b = document.getElementById('base');
    const d = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let x0 = 1e9, x1 = -1, n = 0;
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++)
      if (d[(y * b.width + x) * 4 + 3] > 0) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    return x1 < 0 ? { n: 0, w: 0, x0: 0 } : { n, w: x1 - x0 + 1, x0 };
  }),
  colour: (page, rgb) => page.evaluate(c => {
    const b = document.getElementById('base');
    const d = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] > 0 && d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) n++;
    return n;
  }, rgb),
};

/** Which recolour swatches are marked. */
export const picked = page => page.evaluate(() =>
  [...document.querySelectorAll('#rcpal .rsw')]
    .filter(s => s.getAttribute('aria-pressed') === 'true')
    .map(s => s.dataset.hex));

/** Click the nth recolour swatch. */
export const pickSwatch = (page, n) => page.evaluate(i => {
  const s = [...document.querySelectorAll('#rcpal .rsw')][i];
  if (!s) throw new Error('no swatch at index ' + i);
  s.click();
  return s.dataset.hex;
}, n);

/** Set a number field and fire the event the app listens for. */
export const setField = (page, id, value) => page.evaluate(({ id, value }) => {
  const e = document.getElementById(id);
  e.value = String(value);
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
}, { id, value });

/** Set a <select> and fire change. */
/* Handles a <select> OR a chip group, and throws when it matches neither.

   rsmode and tstatus stopped being selects - three short mutually exclusive
   options read better as segmented chips - and the tests that drove them by
   `.value` did not go red, they went QUIET: assigning `.value` to a div is
   perfectly legal and does nothing at all. Two resize tests then failed on
   their assertions instead of at the line that had stopped working.

   Throwing on an unknown shape is the point. It is the only way the next
   change of control type fails at the driver rather than passing silently. */
export const setSelect = (page, id, value) => page.evaluate(({ id, value }) => {
  const e = document.getElementById(id);
  if (!e) throw new Error('no control called ' + id);
  if (e.tagName === 'SELECT') {
    e.value = value;
    if (e.value !== value) throw new Error(id + ' has no option "' + value + '"');
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const chip = e.querySelector('[data-v="' + value + '"]');
  if (!chip) throw new Error(id + ' is neither a select nor a chip group offering "' + value + '"');
  chip.click();
  if (chip.getAttribute('aria-pressed') !== 'true')
    throw new Error(id + ' did not take the value "' + value + '"');
}, { id, value });

/** Whether a toggle button is pressed. */
export const pressed = (page, id) =>
  page.evaluate(i => document.getElementById(i).getAttribute('aria-pressed'), id);
