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

/* openAllSections is gone with the side column. It unfolded every
   `.side section`, and there is no .side - so it would have found nothing
   and succeeded silently at every one of its 71 call sites. Its absence is
   recorded here rather than left as a deletion nobody can account for.
   openSection below still works and still throws on a name that is not
   there; it just has nothing in the editor left to open. */

/** Press Resize.

   The transform controls left the side column for the panel the rail's T
   button opens, so a person presses that button before reaching them and a
   test has to as well. The panel is a full-screen card while it is up, which
   is why this closes it again: twenty-two call sites go on to click the
   canvas, the undo button or a tool, and every one of those would be
   swallowed by an overlay left open.

   The button's own wiring - that pressing it is what raises the panel - is
   asserted in paneldensity.spec.js and colourtools.spec.js; going through
   railPanel here keeps this to one line in each of the tests that only ever
   wanted to resize something. */
export async function resizeGo(page) {
  await page.evaluate(() => {
    if (!$('tfscrim').hidden) return;
    /* OPENING THE PANEL REFILLS THE SIZE BOXES from the canvas, which is
       right for a person - they press the button and then type - and wrong
       for a test that typed first. Measured: two base tests asked for 240
       and got 120 back, because the open had rewritten the field between
       the typing and the press. So the values ride across the open and are
       set again the same way setField sets them, which puts the test back
       in the order a person works in. */
    const w = $('rsw').value, h = $('rsh').value;
    railPanel('tf', true);
    for (const [id, v] of [['rsw', w], ['rsh', h]]) {
      const e = $(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.click('#rsgo');
  await page.evaluate(() => { railPanel('tf', false); });
}

/** Open one of the pop-out panels the tool rail carries. */
export async function openPanel(page, id) {
  await page.evaluate(i => { railPanel(i, true); }, id);
  await page.waitForTimeout(80);
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
/** Which colours are marked for replacing, read off the DOM.

    Reads data-rc, not aria-pressed. The two selections shared aria-pressed
    while there were two swatch grids, which is the collision that made
    changing the drawing colour wipe the recolour marks; they are separate
    attributes now, and reading the wrong one here would report an empty
    selection while the app held a full one. */
export const picked = page => page.evaluate(() =>
  [...document.querySelectorAll('#pal .sw')]
    .filter(s => s.dataset.rc === '1')
    .map(s => s.dataset.hex));

/** Mark the nth palette colour for replacing.

    There used to be two swatch grids - #pal to draw with and #rcpal to
    replace - showing the same 64 colours. They are one grid now, and what a
    click MEANS is a mode chip above it, so this sets the mode first, exactly
    as a person would. Picking without switching would set the drawing colour
    and mark nothing, which is a silent no-op rather than an error. */
export const pickSwatch = (page, n) => page.evaluate(i => {
  setChip('palmode', 'replace');
  const s = [...document.querySelectorAll('#pal .sw')][i];
  if (!s) throw new Error('no swatch at index ' + i);
  s.click();
  if (!rcPick.has(s.dataset.hex))
    throw new Error('clicking swatch ' + i + ' did not mark it - is the palette in Replace mode?');
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

/** Go to one of the app's three pages.

    The landing page became three - the main page where you pull a trait off a
    character, the project, and its settings - so anything that works with the
    shelf, the generator, the layer list or the rarity plan has to be on the
    right page first, the same way a person does. A test that skips this reads
    a width of zero and cannot click, because the other pages are display:none.

    Driven through showPage rather than by setting the attribute, so a test
    goes the way the tab does and cannot pass over a broken router. */
export async function gotoPage(page, name) {
  await page.waitForFunction(() => typeof showPage === 'function');
  await page.evaluate((p) => {
    showPage(p, true);
    if (document.getElementById('land').getAttribute('data-page') !== p)
      throw new Error('the router did not go to ' + p);
  }, name);
  await page.waitForTimeout(60);
}

/* ==== seeding the store, for the auto cloud save specs (design E2) ====

   These write records the way a person's store holds them, WITHOUT the
   page's dbPut. From stage 0 on, dbPut stamps every trait, reference and
   draft with the account, the kind of write and a local id, and a spec that
   needs a record from before stage 0 must be able to write one with none of
   those. So each record here holds exactly the fields given: stamps too,
   only when a spec passes them.

   findTrait looks a trait up the way a person names it - kind, name, layer,
   status - never by the local id, which the new page's store does not use.

   The old store only. Seeding the server and the new store's `local` (E2's
   seedSettings) belongs to the plan that builds that store. */
const putRaw = (page, rec) => page.evaluate(async (rec) => {
  if (rec.__bytes !== undefined) { rec.blob = new Blob([new Uint8Array(rec.__bytes)], { type: 'image/png' }); delete rec.__bytes; }
  const d = await db();
  await new Promise((res, rej) => {
    const tx = d.transaction('items', 'readwrite');
    tx.objectStore('items').put(rec);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
  return rec.id;
}, rec);

export async function seedTrait(page, t) {
  const kind = t.kind || 'trait';
  const layer = t.layer || 'unsorted', status = t.status || 'wip';
  const rec = { id: t.id || (kind === 'ref' ? 'ref_' + t.name : 't_' + t.name + '_' + layer + '_' + status),
    kind, name: t.name, w: t.w || 16, h: t.h || 16, at: t.at || 1, __bytes: t.bytes || 16 };
  if (kind === 'trait') { rec.layer = layer; rec.status = status; rec.rarity = typeof t.rarity === 'number' ? t.rarity : 1; }
  for (const k of ['rowId', 'path', 'rowAt', 'synced', 'unsent', 'shelfOrder', 'by', 'wk', 'lid', 'reviewId'])
    if (t[k] !== undefined) rec[k] = t[k];
  return putRaw(page, rec);
}

export async function findTrait(page, kind, name, layer, status) {
  return page.evaluate(async ([kind, name, layer, status]) => {
    const hit = (await dbAll()).filter(r => r.kind === kind && r.name === name
      && (kind === 'ref' || ((r.layer || 'unsorted') === (layer || 'unsorted') && (r.status || 'wip') === (status || 'wip'))));
    if (hit.length > 1) throw new Error('findTrait: ' + hit.length + ' records are ' + [kind, name, layer, status].join('/'));
    if (!hit.length) return null;
    const r = Object.assign({}, hit[0]);
    delete r.blob;
    return r;
  }, [kind, name, layer, status]);
}

export async function seedSettings(page, id, fields) {
  await putRaw(page, Object.assign({ id, kind: 'settings', at: 1 }, fields));
}

export async function seedDraft(page, d) {
  const rec = { id: d.traitId ? 'autosave.' + d.traitId : 'autosave.working', kind: 'autosave',
    traitId: d.traitId || null, name: d.name || 'draft.png', w: d.w || 16, h: d.h || 16, at: d.at || 1, __bytes: d.bytes || 16 };
  for (const k of ['by', 'wk']) if (d[k] !== undefined) rec[k] = d[k];
  return putRaw(page, rec);
}

/* ==== a stand-in Supabase for the stage-0 specs ====

   Installed as window.fetch, with a session for `uid`, on the group `ws`
   (null: the personal page). Options:
     row: 'fields' (default) | 'missing' (a row without protocol and
       switching_at, as every stub from before stage 0 answers) | 'none' ([]);
     protocol (1), switching (null, or an ISO time), protoStatus (200),
     protoHang (false: true makes the protocol read never answer, until
       the page gives up on it);
     after: the same keys, for the second and later protocol reads;
     insert: {status, body} to answer the trait insert with (default: 201);
     deleted: the rows a DELETE on traits answers (default []);
     keepState: true leaves s0State as it is (default: reset), for a spec
       about what one tab remembers across accounts.
   Every request is logged in window.__s0.log as "METHOD path", every body
   sent in window.__s0.bodies, and protocol reads are counted in
   window.__s0.reads. A request it does not name is recorded in
   window.__s0.unknown (also window.__unknown) and answered 501 - never a
   silent [] (design E2: unknown fetches throw); every spec using this
   asserts that list is empty after each test. It sets the reload guard for
   this store and account, so no spec but stage0reload.spec.js reloads the
   page. */
export const S0_SWITCHING = 'This project is being updated: your change is kept here and will be sent after it';
export const S0_SWITCHED = 'BuildaNFT was updated: reload to send what you saved';

export async function armStage0(page, o = {}) {
  await page.evaluate((o) => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    try { s0SeenUid = null; } catch (_) {}
    activeWs = o.ws === undefined ? 'team7' : o.ws;
    cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
    /* In a try: the rollback spec runs this on the page before stage 0, which has no s0State. */
    if (!o.keepState) { try { s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 }; } catch (_) {} }
    const uid = o.uid || 'u1';
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid } }));
    try { sessionStorage.setItem('pb.s0.reloaded.' + wsDbName() + '.' + uid, '1'); } catch (_) {}
    const S = window.__s0 = { log: [], bodies: [], reads: 0, unknown: [] };
    window.__unknown = S.unknown;
    const pick = () => (S.reads > 1 && o.after) ? Object.assign({}, o, o.after) : o;
    const json = (x, st, h) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
    window.__s0real = window.__s0real || window.fetch;
    window.fetch = async (u, io) => {
      const s = String(u), m = (io && io.method) || 'GET', path = s.replace(/^https?:\/\/[^/]+/, '');
      S.log.push(m + ' ' + path);
      if (io && typeof io.body === 'string') S.bodies.push({ m, path, body: io.body });
      if (s.indexOf('select=id,protocol,switching_at') >= 0) {
        S.reads++;
        const p = pick();
        if (p.protoHang) return new Promise((_, rej) => {
          const sg = io && io.signal;
          if (sg) sg.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        });
        if (p.protoStatus && p.protoStatus !== 200) return json({ code: 'XX000', message: 'down' }, p.protoStatus);
        if (p.row === 'none') return json([]);
        if (p.row === 'missing') return json([{ id: 'c1' }]);
        return json([{ id: 'c1', protocol: p.protocol === undefined ? 1 : p.protocol, switching_at: p.switching || null }]);
      }
      if (s.indexOf('/auth/v1/user') >= 0) return json({ id: uid });
      if (s.indexOf('/rest/v1/rpc/my_team') >= 0) return json('me');
      if (s.indexOf('/rest/v1/rpc/team_member_names') >= 0) return json([]);
      if (s.indexOf('/rest/v1/rpc/reorder_traits') >= 0) return json(null);
      if (s.indexOf('/rest/v1/rpc/leave_team') >= 0) return json(null);
      if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }]);
      if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats', 'unsorted'] }]);
      if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
      if (s.indexOf('/storage/v1/object/') >= 0) {
        if (m === 'GET') return new Response(new Blob([new Uint8Array([1])]), { status: 200 });
        if (m === 'DELETE') return json([]);
        return json({ Key: 'traits/x' });
      }
      if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
        if (o.insert) return json(o.insert.body, o.insert.status);
        const b = JSON.parse(io.body)[0];
        return json([Object.assign({ id: 'row-new', updated_at: '2026-09-27T12:00:00+00:00' }, b)], 201);
      }
      if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
        const id = decodeURIComponent((s.match(/id=eq\.([^&]+)/) || [])[1] || 'row-1');
        return json([{ id, updated_at: '2026-09-27T12:00:00+00:00' }]);
      }
      if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json(o.deleted || []);
      if (s.indexOf('/rest/v1/traits') >= 0) return json([], 200, { 'Content-Range': '0-0/0' });
      S.unknown.push(m + ' ' + path);
      return json({ code: 'UNROUTED', message: 'armStage0 has no answer for ' + m + ' ' + path }, 501);
    };
  }, o);
}
